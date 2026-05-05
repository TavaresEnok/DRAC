import { Injectable, Logger } from '@nestjs/common';
import { type Camera } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as http from 'http';
import { type PtzCommandDto } from './dto/ptz-command.dto';
import { CryptoService } from '../common/crypto/crypto.service';
import { PortCheckerService } from '../common/network/port-checker.service';

type DigestSoapRequestInput = {
  host: string;
  port: number;
  path: string;
  body: string;
  username: string;
  password: string;
  timeout: number;
};

type DetectOnvifInput = {
  ip: string;
  onvifPort?: number;
  username?: string;
  password?: string;
  onvifPath?: string;
  onvifProfileToken?: string;
};

@Injectable()
export class OnvifPtzService {
  private readonly logger = new Logger(OnvifPtzService.name);
  private readonly onvifFallbackPorts = [8075, 8080, 8000, 8899];

  constructor(
    private readonly cryptoService: CryptoService,
    private readonly portChecker: PortCheckerService,
  ) {}

  parseDigestHeader(header: string) {
    const result: Record<string, string> = {};
    const quotedRegex = /(\w+)="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = quotedRegex.exec(header)) !== null) {
      result[match[1]] = match[2];
    }
    if (Object.keys(result).length === 0) {
      const plainRegex = /(\w+)=([^,\s]+)/g;
      while ((match = plainRegex.exec(header)) !== null) {
        result[match[1]] = match[2];
      }
    }
    return result;
  }

  generateCnonce() {
    return randomBytes(8).toString('hex');
  }

  buildDigestAuth(
    method: string,
    uri: string,
    authHeader: string,
    username: string,
    password: string,
    nc = 1,
  ) {
    const params = this.parseDigestHeader(authHeader);
    const realm = params.realm ?? '';
    const nonce = params.nonce ?? '';
    const qop = params.qop ?? 'auth';
    const opaque = params.opaque ?? '';
    const algorithm = params.algorithm ?? 'MD5';
    const cnonce = this.generateCnonce();
    const ncStr = nc.toString(16).padStart(8, '0');

    const ha1 = createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
    const ha2 = createHash('md5').update(`${method}:${uri}`).digest('hex');
    const response = createHash('md5')
      .update(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');

    let auth = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${ncStr}, cnonce="${cnonce}", response="${response}"`;
    if (opaque) auth += `, opaque="${opaque}"`;
    if (algorithm && algorithm !== 'MD5') auth += `, algorithm="${algorithm}"`;
    return auth;
  }

  buildSoapBody(action: 'start' | 'stop', direction: PtzCommandDto['direction'], profileToken: string) {
    if (action === 'stop') {
      return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
    }

    const map: Record<NonNullable<PtzCommandDto['direction']>, [number, number, number]> = {
      Up: [0, 0.5, 0],
      Down: [0, -0.5, 0],
      Left: [-0.5, 0, 0],
      Right: [0.5, 0, 0],
      ZoomIn: [0, 0, 0.5],
      ZoomOut: [0, 0, -0.5],
    };
    const [x, y, z] = map[direction ?? 'Up'];

    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>${profileToken}</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${x}" y="${y}" />
        <tt:Zoom x="${z}" />
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </soap:Body>
</soap:Envelope>`;
  }

  digestSoapRequest(input: DigestSoapRequestInput): Promise<{ ok: boolean; message: string }> {
    const { host, port, path, body, username, password, timeout } = input;
    const baseHeaders = {
      'Content-Type': 'application/soap+xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(body),
      Connection: 'close',
    };

    return new Promise((resolve) => {
      const requestOptions: http.RequestOptions = {
        host,
        port,
        path,
        method: 'POST',
        timeout,
        headers: baseHeaders,
      };

      const req1 = http.request(requestOptions, (res1) => {
        if (res1.statusCode === 401) {
          const authHeader = res1.headers['www-authenticate'];
          if (!authHeader || !String(authHeader).toLowerCase().startsWith('digest')) {
            resolve({ ok: false, message: 'Auth não é Digest' });
            return;
          }

          const digestAuth = this.buildDigestAuth(
            'POST',
            path,
            String(authHeader),
            username,
            password,
            1,
          );

          const req2 = http.request(
            {
              ...requestOptions,
              headers: {
                ...baseHeaders,
                Authorization: digestAuth,
              },
            },
            (res2) => {
              if ((res2.statusCode ?? 500) >= 400) {
                resolve({
                  ok: false,
                  message: `ONVIF SOAP HTTP ${res2.statusCode ?? 500}`,
                });
                return;
              }
              resolve({ ok: true, message: 'ok' });
            },
          );

          req2.on('error', (error) => resolve({ ok: false, message: `SOAP PTZ falhou: ${error.message}` }));
          req2.on('timeout', () => {
            req2.destroy();
            resolve({ ok: false, message: 'SOAP PTZ timeout' });
          });
          req2.write(body);
          req2.end();
          return;
        }

        if ((res1.statusCode ?? 500) >= 400) {
          resolve({ ok: false, message: `ONVIF SOAP HTTP ${res1.statusCode ?? 500}` });
          return;
        }
        resolve({ ok: true, message: 'ok' });
      });

      req1.on('error', (error) => resolve({ ok: false, message: `SOAP PTZ falhou: ${error.message}` }));
      req1.on('timeout', () => {
        req1.destroy();
        resolve({ ok: false, message: 'SOAP PTZ timeout' });
      });
      req1.write(body);
      req1.end();
    });
  }

  private async findOnvifPort(camera: Camera) {
    const preferredPort = camera.onvifPort ?? this.onvifFallbackPorts[0];
    const ports = Array.from(new Set([preferredPort, ...this.onvifFallbackPorts]));

    try {
      return await Promise.any(
        ports.map((port) =>
          this.portChecker.check(camera.ip, port).then((reachable) => {
            if (reachable) return port;
            throw new Error(`Port ${port} unreachable`);
          }),
        ),
      );
    } catch {
      return null;
    }
  }

  async move(camera: Camera, direction: NonNullable<PtzCommandDto['direction']>) {
    const onvifPort = await this.findOnvifPort(camera);
    if (!onvifPort) {
      return { ok: false, message: 'ONVIF unreachable' };
    }

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const onvifPath = camera.onvifPath?.trim() || '/onvif/ptz_service';
    const profileToken = camera.onvifProfileToken?.trim() || 'Profile000';
    const body = this.buildSoapBody('start', direction, profileToken);
    this.logger.log(`PTZ start camera=${camera.id} direction=${direction} onvifPort=${onvifPort}`);
    return this.digestSoapRequest({
      host: camera.ip,
      port: onvifPort,
      path: onvifPath,
      body,
      username: camera.username,
      password,
      timeout: 5000,
    });
  }

  async stop(camera: Camera) {
    const onvifPort = await this.findOnvifPort(camera);
    if (!onvifPort) {
      return { ok: false, message: 'ONVIF unreachable' };
    }

    const password = this.cryptoService.decrypt(camera.passwordEncrypted);
    const onvifPath = camera.onvifPath?.trim() || '/onvif/ptz_service';
    const profileToken = camera.onvifProfileToken?.trim() || 'Profile000';
    const body = this.buildSoapBody('stop', undefined, profileToken);
    this.logger.log(`PTZ stop camera=${camera.id} onvifPort=${onvifPort}`);
    return this.digestSoapRequest({
      host: camera.ip,
      port: onvifPort,
      path: onvifPath,
      body,
      username: camera.username,
      password,
      timeout: 5000,
    });
  }

  async detectPtzEndpoint(input: DetectOnvifInput) {
    const ports = Array.from(new Set([input.onvifPort, ...this.onvifFallbackPorts, 80, 2020].filter((v): v is number => Number.isFinite(v as number))));
    const candidatePaths = Array.from(new Set([input.onvifPath?.trim(), '/onvif/ptz_service', '/onvif/device_service'].filter((v): v is string => Boolean(v))));
    const candidateTokens = Array.from(new Set([input.onvifProfileToken?.trim(), 'Profile000', 'Profile001', 'profile_1'].filter((v): v is string => Boolean(v))));

    for (const port of ports) {
      const reachable = await this.portChecker.check(input.ip, port);
      if (!reachable) continue;

      for (const path of candidatePaths) {
        for (const token of candidateTokens) {
          if (!input.username || !input.password) {
            continue;
          }
          const body = this.buildSoapBody('stop', undefined, token);
          const result = await this.digestSoapRequest({
            host: input.ip,
            port,
            path,
            body,
            username: input.username,
            password: input.password,
            timeout: 3500,
          });
          if (result.ok) {
            return {
              ok: true,
              onvifPort: port,
              onvifPath: path,
              onvifProfileToken: token,
            };
          }
        }
      }
    }

    return {
      ok: false,
      onvifPort: input.onvifPort ?? null,
      onvifPath: input.onvifPath ?? null,
      onvifProfileToken: input.onvifProfileToken ?? null,
    };
  }
}

const express = require('express');
const http = require('http');
const crypto = require('crypto');
const net = require('net');
const { spawn } = require('child_process');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const PORT = Number(process.env.PORT || 3000);

const CAMERA_IP = process.env.CAMERA_IP || '168.194.15.82';
const ONVIF_IP = process.env.ONVIF_IP || CAMERA_IP;
const CAMERA_USER = process.env.CAMERA_USER || 'admin';
const CAMERA_PASSWORD = process.env.CAMERA_PASSWORD || ''  // credencial removida do repo: defina CAMERA_PASSWORD no ambiente;

const RTSP_PORT = Number(process.env.RTSP_PORT || 51488);
const RTSP_CHANNEL = process.env.RTSP_CHANNEL || '1';
// Em muitas câmeras o subtype 0 costuma ser H.264 e mais estável que HEVC/H.265.
const RTSP_SUBTYPE = process.env.RTSP_SUBTYPE || '0';
const RTSP_TRY_MAIN_FIRST = ['1', 'true', 'yes'].includes(
  String(process.env.RTSP_TRY_MAIN_FIRST || '').trim().toLowerCase()
);

const ONVIF_PORT = Number(process.env.ONVIF_PORT || 8075);
const ONVIF_PTZ_PATH = process.env.ONVIF_PTZ_PATH || '/onvif/ptz_service';
const ONVIF_PROFILE_TOKEN = process.env.ONVIF_PROFILE_TOKEN || 'Profile000';
const ONVIF_FALLBACK_PORTS = [8080, 8000, 8899];

const FFMPEG_RTSP_TRANSPORT = process.env.FFMPEG_RTSP_TRANSPORT || 'tcp';
const FFMPEG_STIMEOUT_US = process.env.FFMPEG_STIMEOUT_US || '8000000';
const FFMPEG_MAX_DELAY_US = process.env.FFMPEG_MAX_DELAY_US || '500000';
const FFMPEG_PROBESIZE = process.env.FFMPEG_PROBESIZE || '32768';
const FFMPEG_ANALYZEDURATION_US = process.env.FFMPEG_ANALYZEDURATION_US || '1000000';
const MJPEG_FPS = process.env.MJPEG_FPS || '20';
const MJPEG_Q = process.env.MJPEG_Q || '5';

const RTSP_URL =
  process.env.RTSP_URL ||
  `rtsp://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}:${RTSP_PORT}/cam/realmonitor?channel=${RTSP_CHANNEL}&subtype=${RTSP_SUBTYPE}`;
const RTSP_FALLBACK_URL =
  process.env.RTSP_FALLBACK_URL ||
  `rtsp://${CAMERA_USER}:${CAMERA_PASSWORD}@${CAMERA_IP}:${RTSP_PORT}/cam/realmonitor?channel=${RTSP_CHANNEL}&subtype=0`;

function parseDigestHeader(header) {
  const result = {};
  const regex = /(\w+)="([^"]+)"/g;
  let match;
  while ((match = regex.exec(header)) !== null) result[match[1]] = match[2];
  if (Object.keys(result).length === 0) {
    const simpleRegex = /(\w+)=([^,\s]+)/g;
    while ((match = simpleRegex.exec(header)) !== null) result[match[1]] = match[2];
  }
  return result;
}

function generateCnonce() {
  return crypto.randomBytes(8).toString('hex');
}

function buildDigestAuth(method, uri, authHeader, username, password, nc = 1) {
  const params = parseDigestHeader(authHeader || '');
  const realm = params.realm || '';
  const nonce = params.nonce || '';
  const qop = params.qop || 'auth';
  const opaque = params.opaque || '';
  const algorithm = params.algorithm || 'MD5';

  const cnonce = generateCnonce();
  const ncStr = nc.toString(16).padStart(8, '0');

  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  const response = crypto
    .createHash('md5')
    .update(`${ha1}:${nonce}:${ncStr}:${cnonce}:${qop}:${ha2}`)
    .digest('hex');

  let auth = `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=${qop}, nc=${ncStr}, cnonce="${cnonce}", response="${response}"`;
  if (opaque) auth += `, opaque="${opaque}"`;
  if (algorithm && algorithm !== 'MD5') auth += `, algorithm="${algorithm}"`;
  return auth;
}

function portOpen(host, port, timeout = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let done = false;

    const finish = (ok) => {
      if (!done) {
        done = true;
        socket.destroy();
        resolve(ok);
      }
    };

    socket.setTimeout(timeout);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
    socket.connect(port, host);
  });
}

async function findOnvifPort() {
  if (await portOpen(ONVIF_IP, ONVIF_PORT)) return ONVIF_PORT;
  for (const p of ONVIF_FALLBACK_PORTS) {
    if (await portOpen(ONVIF_IP, p)) return p;
  }
  return null;
}

class CameraStreamState {
  constructor() {
    this.activeUrl = RTSP_URL;
    this.errorMsg = '';
    this.lastFrameTime = 0;
    this.streamActive = false;
  }
}

const streamState = new CameraStreamState();
const onvifState = {
  profileToken: null,
  error: 'ONVIF nativo (equivalente ao onvif-zeep) não implementado no Node; usando fallback SOAP Digest.',
};

function buildUrlPool() {
  const pool = [RTSP_URL];
  if (RTSP_FALLBACK_URL && RTSP_FALLBACK_URL !== RTSP_URL) pool.push(RTSP_FALLBACK_URL);
  if (RTSP_TRY_MAIN_FIRST && pool.length > 1) pool.reverse();
  return pool;
}

function makeFfmpegArgs(url) {
  return [
    '-hide_banner',
    '-loglevel',
    'warning',
    '-rtsp_transport',
    FFMPEG_RTSP_TRANSPORT,
    '-stimeout',
    String(FFMPEG_STIMEOUT_US),
    '-max_delay',
    String(FFMPEG_MAX_DELAY_US),
    '-probesize',
    String(FFMPEG_PROBESIZE),
    '-analyzeduration',
    String(FFMPEG_ANALYZEDURATION_US),
    '-err_detect',
    'ignore_err',
    '-fflags',
    '+genpts+discardcorrupt+nobuffer',
    '-flags',
    'low_delay',
    '-use_wallclock_as_timestamps',
    '1',
    '-i',
    url,
    '-an',
    '-vf',
    `fps=${MJPEG_FPS}`,
    '-pix_fmt',
    'yuvj420p',
    '-q:v',
    String(MJPEG_Q),
    '-f',
    'mpjpeg',
    'pipe:1',
  ];
}

function startMjpegStream(req, res) {
  const urls = buildUrlPool();
  let idx = 0;
  let currentProc = null;
  let closed = false;

  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=ffmpeg',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    Connection: 'keep-alive',
  });

  const cleanup = () => {
    if (closed) return;
    closed = true;
    if (currentProc && !currentProc.killed) currentProc.kill('SIGTERM');
  };

  req.on('close', cleanup);
  res.on('close', cleanup);

  const tryNext = () => {
    if (closed) return;
    if (idx >= urls.length) {
      streamState.streamActive = false;
      streamState.errorMsg = 'Não foi possível abrir o stream RTSP.';
      if (!res.writableEnded) res.end();
      return;
    }

    const url = urls[idx++];
    streamState.activeUrl = url;
    const ff = spawn('ffmpeg', makeFfmpegArgs(url), { stdio: ['ignore', 'pipe', 'pipe'] });
    currentProc = ff;

    let gotData = false;
    const probeTimer = setTimeout(() => {
      if (!gotData && !closed && ff && !ff.killed) {
        ff.kill('SIGTERM');
      }
    }, 5000);

    ff.stdout.on('data', (chunk) => {
      gotData = true;
      streamState.lastFrameTime = Date.now() / 1000;
      streamState.streamActive = true;
      streamState.errorMsg = '';
      if (!closed) res.write(chunk);
    });

    ff.stderr.on('data', () => {
      // stderr muito verboso em stream RTSP; mantemos silencioso
    });

    ff.on('close', () => {
      clearTimeout(probeTimer);
      if (closed) return;
      if (!gotData) {
        streamState.errorMsg = 'Falha ao ler frame. Reconectando...';
        tryNext();
        return;
      }
      // Se já teve frame e caiu, tentamos reconectar automaticamente.
      streamState.streamActive = false;
      setTimeout(() => {
        if (!closed) {
          idx = 0;
          tryNext();
        }
      }, 1000);
    });
  };

  tryNext();
}

function buildSoapBody(action, direction) {
  if (action === 'stop') {
    return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl">
  <soap:Body>
    <tptz:Stop>
      <tptz:ProfileToken>${ONVIF_PROFILE_TOKEN}</tptz:ProfileToken>
      <tptz:PanTilt>true</tptz:PanTilt>
      <tptz:Zoom>true</tptz:Zoom>
    </tptz:Stop>
  </soap:Body>
</soap:Envelope>`;
  }

  const map = {
    Up: [0, 0.5, 0],
    Down: [0, -0.5, 0],
    Left: [-0.5, 0, 0],
    Right: [0.5, 0, 0],
    ZoomIn: [0, 0, 0.5],
    ZoomOut: [0, 0, -0.5],
  };

  const [p, t, z] = map[String(direction || '')] || [0, 0, 0];
  return `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:tptz="http://www.onvif.org/ver20/ptz/wsdl" xmlns:tt="http://www.onvif.org/ver10/schema">
  <soap:Body>
    <tptz:ContinuousMove>
      <tptz:ProfileToken>${ONVIF_PROFILE_TOKEN}</tptz:ProfileToken>
      <tptz:Velocity>
        <tt:PanTilt x="${p}" y="${t}" />
        <tt:Zoom x="${z}" />
      </tptz:Velocity>
    </tptz:ContinuousMove>
  </soap:Body>
</soap:Envelope>`;
}

function digestSoapRequest({ host, port, path, body, timeout = 5000 }) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port,
      path,
      method: 'POST',
      timeout,
      headers: {
        'Content-Type': 'application/soap+xml; charset=utf-8',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req1 = http.request(options, (res1) => {
      if (res1.statusCode === 401) {
        const authHeader = res1.headers['www-authenticate'];
        if (!authHeader || !String(authHeader).toLowerCase().startsWith('digest')) {
          resolve({ ok: false, message: 'Auth não é Digest' });
          return;
        }

        const auth = buildDigestAuth('POST', path, authHeader, CAMERA_USER, CAMERA_PASSWORD, 1);
        const req2 = http.request(
          {
            ...options,
            headers: {
              ...options.headers,
              Authorization: auth,
            },
          },
          (res2) => {
            if (res2.statusCode >= 400) {
              resolve({ ok: false, message: `ONVIF SOAP HTTP ${res2.statusCode}` });
              return;
            }
            resolve({ ok: true, message: 'ok' });
          }
        );

        req2.on('error', (err) => resolve({ ok: false, message: `SOAP PTZ falhou: ${err.message}` }));
        req2.on('timeout', () => {
          req2.destroy();
          resolve({ ok: false, message: 'SOAP PTZ timeout' });
        });
        req2.write(body);
        req2.end();
        return;
      }

      if (res1.statusCode >= 400) {
        resolve({ ok: false, message: `ONVIF SOAP HTTP ${res1.statusCode}` });
        return;
      }
      resolve({ ok: true, message: 'ok' });
    });

    req1.on('error', (err) => resolve({ ok: false, message: `SOAP PTZ falhou: ${err.message}` }));
    req1.on('timeout', () => {
      req1.destroy();
      resolve({ ok: false, message: 'SOAP PTZ timeout' });
    });
    req1.write(body);
    req1.end();
  });
}

app.get('/', (_req, res) => {
  res.sendFile(`${__dirname}/public/index.html`);
});

app.get('/video_feed', (req, res) => {
  startMjpegStream(req, res);
});

app.get('/camera-stream', (req, res) => {
  startMjpegStream(req, res);
});

app.get('/status', async (_req, res) => {
  const onvifPort = (await portOpen(ONVIF_IP, ONVIF_PORT)) ? ONVIF_PORT : await findOnvifPort();
  const rtspReachable = await portOpen(CAMERA_IP, RTSP_PORT);

  res.json({
    camera_ip: CAMERA_IP,
    onvif_ip: ONVIF_IP,
    rtsp_port: RTSP_PORT,
    rtsp_url_active: streamState.activeUrl,
    rtsp_reachable: rtspReachable,
    onvif_port: onvifPort,
    onvif_available: onvifPort !== null,
    onvif_profile_token: onvifState.profileToken,
    stream_active: streamState.streamActive,
    last_frame: streamState.lastFrameTime,
    error: streamState.errorMsg,
    onvif_error: onvifState.error,
  });
});

app.post('/ptz', async (req, res) => {
  const data = req.body || {};
  const action = data.action;
  const direction = data.direction;

  const onvifPort = (await portOpen(ONVIF_IP, ONVIF_PORT)) ? ONVIF_PORT : await findOnvifPort();
  if (!onvifPort) {
    res.status(500).json({ status: 'error', message: 'ONVIF unreachable' });
    return;
  }

  const soapBody = buildSoapBody(action, direction);
  const result = await digestSoapRequest({
    host: ONVIF_IP,
    port: onvifPort,
    path: ONVIF_PTZ_PATH,
    body: soapBody,
    timeout: 5000,
  });

  if (result.ok) {
    res.json({ status: 'ok', message: result.message, profile_token: ONVIF_PROFILE_TOKEN });
    return;
  }

  res.status(500).json({ status: 'error', message: result.message });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor Node rodando em http://127.0.0.1:${PORT}`);
  console.log(`Video feed em http://127.0.0.1:${PORT}/video_feed`);
});

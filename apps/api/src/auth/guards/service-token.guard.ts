import { Injectable, CanActivate, ExecutionContext, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { isIP } from 'node:net';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  private readonly logger = new Logger(ServiceTokenGuard.name);
  private static readonly insecureTokens = new Set([
    '',
    'change_me_service_token',
  ]);

  constructor(private configService: ConfigService) {}

  private normalizeIp(ip: string): string {
    if (ip.startsWith('::ffff:')) {
      return ip.slice(7);
    }
    return ip;
  }

  private isPrivateSource(ipRaw: string | undefined): boolean {
    if (!ipRaw) return false;
    const ip = this.normalizeIp(ipRaw);
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') return true;
    if (ip.startsWith('10.') || ip.startsWith('192.168.')) return true;
    if (ip.startsWith('172.')) {
      const octets = ip.split('.');
      const second = Number(octets[1] ?? -1);
      if (Number.isInteger(second) && second >= 16 && second <= 31) return true;
    }
    if (ip.startsWith('fc') || ip.startsWith('fd')) return true; // IPv6 ULA
    return isIP(ip) !== 0 && ip.startsWith('169.254.'); // link-local fallback
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-service-token'];
    const remoteAddress = request.socket?.remoteAddress as string | undefined;

    if (typeof token !== 'string' || !token) {
      return false;
    }

    if (!this.isPrivateSource(remoteAddress)) {
      this.logger.warn(`Tentativa em rota interna bloqueada de origem não privada (${remoteAddress ?? 'unknown'}).`);
      return false;
    }

    const internalSecret = (this.configService.get<string>('internalServiceToken') ?? '').trim();
    if (!internalSecret) {
      return false;
    }
    if (ServiceTokenGuard.insecureTokens.has(internalSecret) || internalSecret.length < 24) {
      this.logger.error('INTERNAL_SERVICE_TOKEN inválido/inseguro. Rotas internas permanecerão bloqueadas.');
      return false;
    }

    const tokenBuffer = Buffer.from(token);
    const secretBuffer = Buffer.from(internalSecret);
    return tokenBuffer.length === secretBuffer.length && timingSafeEqual(tokenBuffer, secretBuffer);
  }
}

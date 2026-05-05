import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ServiceTokenGuard implements CanActivate {
  constructor(private configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const token = request.headers['x-service-token'];
    
    const internalSecret = this.configService.get<string>('internalServiceToken') ?? 'change_me_service_token';
    
    return token === internalSecret;
  }
}

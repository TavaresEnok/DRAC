import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiBaseUrl = 'http://ai-service:8000';

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private internalHeaders() {
    const token = (this.configService.get<string>('internalServiceToken') ?? '').trim();
    return token ? { 'x-service-token': token } : undefined;
  }

  async getHealth() {
    try {
      const response: any = await firstValueFrom(this.httpService.get(`${this.aiBaseUrl}/health`));
      return response.data;
    } catch (error: any) {
      this.logger.error(`AI Service health check failed: ${error.message}`);
      return { status: 'offline' };
    }
  }

  async startAnalysis(cameraId: string, rtspUrl: string) {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/analyze/start`,
        {
          camera_id: cameraId,
          rtsp_url: rtspUrl,
          analysis_type: 'motion',
        },
        { headers: this.internalHeaders() },
      ));
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to start AI analysis for camera ${cameraId}: ${error.message}`);
      throw error;
    }
  }

  async stopAnalysis(cameraId: string) {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/analyze/stop/${cameraId}`,
        {},
        { headers: this.internalHeaders() },
      ));
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to stop AI analysis for camera ${cameraId}: ${error.message}`);
      throw error;
    }
  }
}

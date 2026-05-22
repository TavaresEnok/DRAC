import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly aiBaseUrl: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiBaseUrl = this.configService.get<string>('aiBaseUrl') ?? 'http://ai-service:8000';
  }

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

  async startAnalysis(cameraId: string, rtspUrl: string, analysisType = 'motion') {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/analyze/start`,
        {
          camera_id: cameraId,
          rtsp_url: rtspUrl,
          analysis_type: analysisType,
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

  async stopAll() {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/analyze/stop-all`,
        {},
        { headers: this.internalHeaders() },
      ));
      return response.data;
    } catch (error: any) {
      this.logger.error(`Failed to stop all AI analysis: ${error.message}`);
      throw error;
    }
  }

  async resetModels() {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/models/reset`,
        {},
        { headers: this.internalHeaders() },
      ));
      return response.data;
    } catch (error: any) {
      this.logger.warn(`Failed to reset AI models: ${error.message}`);
      return { status: 'unavailable' };
    }
  }

  async loadModel(analysisType: string) {
    try {
      const response: any = await firstValueFrom(this.httpService.post(
        `${this.aiBaseUrl}/models/load`,
        { analysis_type: analysisType },
        { headers: this.internalHeaders() },
      ));
      return response.data;
    } catch (error: any) {
      this.logger.warn(`Failed to load AI model ${analysisType}: ${error.message}`);
      return { status: 'unavailable', error: error.message };
    }
  }
}

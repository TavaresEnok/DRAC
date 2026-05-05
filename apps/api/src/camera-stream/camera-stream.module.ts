import { Module } from '@nestjs/common';
import { AccessControlModule } from '../access-control/access-control.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CamerasModule } from '../cameras/cameras.module';
import { CameraStreamController } from './camera-stream.controller';
import { FfmpegMjpegService } from './ffmpeg-mjpeg.service';
import { MediamtxProxyService } from './mediamtx-proxy.service';

@Module({
  imports: [CamerasModule, AuthModule, AuditModule, AccessControlModule],
  controllers: [CameraStreamController],
  providers: [FfmpegMjpegService, MediamtxProxyService],
})
export class CameraStreamModule {}

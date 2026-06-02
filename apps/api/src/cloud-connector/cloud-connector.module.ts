import { Module } from '@nestjs/common';
import { CloudConnectorController } from './cloud-connector.controller';
import { CloudConnectorService } from './cloud-connector.service';

@Module({
  controllers: [CloudConnectorController],
  providers: [CloudConnectorService],
  exports: [CloudConnectorService],
})
export class CloudConnectorModule {}

import { Global, Module } from '@nestjs/common';
import { CommercialPolicyService } from './commercial-policy.service';

@Global()
@Module({
  providers: [CommercialPolicyService],
  exports: [CommercialPolicyService],
})
export class CommercialPolicyModule {}

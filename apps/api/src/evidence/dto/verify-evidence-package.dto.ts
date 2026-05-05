import { IsObject } from 'class-validator';

export class VerifyEvidencePackageDto {
  @IsObject()
  evidencePackage!: Record<string, unknown>;
}

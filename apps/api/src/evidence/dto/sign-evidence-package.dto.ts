import { IsObject } from 'class-validator';

export class SignEvidencePackageDto {
  @IsObject()
  payload!: Record<string, unknown>;
}

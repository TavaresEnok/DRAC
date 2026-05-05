import { IsObject, IsOptional, IsString } from 'class-validator';

export class UpsertSiteMapLayoutDto {
  @IsOptional()
  @IsString()
  svgDataUrl?: string | null;

  @IsOptional()
  @IsObject()
  markers?: Record<string, unknown>;
}

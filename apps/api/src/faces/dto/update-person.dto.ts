import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class UpdatePersonDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

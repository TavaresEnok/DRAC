import { IsOptional, IsString } from 'class-validator';

export class CreateAreaDto {
  @IsOptional()
  @IsString()
  siteId?: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

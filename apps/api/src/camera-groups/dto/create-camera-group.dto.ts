import { IsOptional, IsString } from 'class-validator';

export class CreateCameraGroupDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;
}

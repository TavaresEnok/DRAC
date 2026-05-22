import { IsOptional, IsString } from 'class-validator';

export class CreatePersonDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  externalId?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

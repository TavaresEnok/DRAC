import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInvestigationItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}

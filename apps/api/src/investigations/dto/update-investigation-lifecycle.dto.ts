import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInvestigationLifecycleDto {
  @IsIn(['OPEN', 'ACTIVE', 'REVIEW', 'CLOSED', 'ARCHIVED'])
  status!: 'OPEN' | 'ACTIVE' | 'REVIEW' | 'CLOSED' | 'ARCHIVED';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

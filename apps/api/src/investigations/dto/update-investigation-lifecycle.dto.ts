import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateInvestigationLifecycleDto {
  @IsIn(['OPEN', 'IN_REVIEW', 'PENDING_APPROVAL', 'CLOSED', 'ARCHIVED', 'ACTIVE', 'REVIEW'])
  status!: 'OPEN' | 'IN_REVIEW' | 'PENDING_APPROVAL' | 'CLOSED' | 'ARCHIVED' | 'ACTIVE' | 'REVIEW';

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  summary?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  note?: string;
}

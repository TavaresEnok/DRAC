import { IsIn, IsOptional, IsString, ValidateIf } from 'class-validator';

export const PTZ_DIRECTIONS = ['Up', 'Down', 'Left', 'Right', 'ZoomIn', 'ZoomOut'] as const;
export const PTZ_ACTIONS = ['start', 'stop'] as const;

export class PtzCommandDto {
  @IsString()
  @IsIn(PTZ_ACTIONS)
  action!: (typeof PTZ_ACTIONS)[number];

  @IsOptional()
  @ValidateIf((object: PtzCommandDto) => object.action === 'start')
  @IsString()
  @IsIn(PTZ_DIRECTIONS)
  direction?: (typeof PTZ_DIRECTIONS)[number];
}

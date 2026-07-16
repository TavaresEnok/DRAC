import { IsDateString, IsNotIn, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * Tipos RESERVADOS: só o servidor os cria, por métodos dedicados. O cliente segue livre
 * para criar os seus (event/camera/recording/snapshot/clip/bookmark/note/...), mas forjar
 * um destes via POST /items dava efeitos privilegiados:
 *  - `export_package`: o download confia no `metadata.artifact.filePath` do item →
 *    forjá-lo servia qualquer arquivo legível pela API (env → JWT_SECRET). Ver o
 *    ensureFileUnderRoot em getExportPackageDownload, que é a trava principal.
 *  - `legal_hold`: a retenção protege gravações com este tipo (retention.service.ts:65) →
 *    forjá-lo impede a limpeza automática e enche o disco.
 *  - `activity`/`lifecycle`/`case_meta`/`export_request`: forjariam trilha/estado do caso.
 */
export const SERVER_OWNED_INVESTIGATION_ITEM_TYPES = [
  'export_package',
  'export_request',
  'legal_hold',
  'activity',
  'lifecycle',
  'case_meta',
] as const;

export class CreateInvestigationItemDto {
  @IsString()
  @MaxLength(32)
  @IsNotIn(SERVER_OWNED_INVESTIGATION_ITEM_TYPES as unknown as string[], {
    message: 'type reservado ao servidor.',
  })
  type!: string;

  @IsString()
  @MaxLength(240)
  label!: string;

  @IsOptional()
  @IsString()
  cameraId?: string;

  @IsOptional()
  @IsString()
  cameraName?: string;

  @IsOptional()
  @IsString()
  eventId?: string;

  @IsOptional()
  @IsString()
  recordingId?: string;

  @IsDateString()
  timestamp!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

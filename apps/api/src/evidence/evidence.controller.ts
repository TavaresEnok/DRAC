import { Body, Controller, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { SignEvidencePackageDto } from './dto/sign-evidence-package.dto';
import { VerifyEvidencePackageDto } from './dto/verify-evidence-package.dto';
import { EvidenceService } from './evidence.service';

@Controller('evidence')
export class EvidenceController {
  constructor(
    private readonly evidenceService: EvidenceService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Post('sign')
  async signPackage(@CurrentUser() user: AuthUser, @Body() dto: SignEvidencePackageDto, @Req() req: Request) {
    const result = this.evidenceService.signPackage(dto.payload);

    await this.auditService.log(
      user.id,
      'evidence.sign',
      'EvidencePackage',
      null,
      {
        caseName: typeof dto.payload.caseName === 'string' ? dto.payload.caseName : null,
        investigator: typeof dto.payload.investigator === 'string' ? dto.payload.investigator : null,
      },
      req,
    );

    return result;
  }

  @Roles(UserRole.VIEWER)
  @Post('verify')
  async verifyPackage(@CurrentUser() user: AuthUser, @Body() dto: VerifyEvidencePackageDto, @Req() req: Request) {
    const result = this.evidenceService.verifyPackage(dto.evidencePackage);

    await this.auditService.log(
      user.id,
      'evidence.verify',
      'EvidencePackage',
      null,
      {
        ok: result.ok,
        hashValid: result.hashValid,
        signatureValid: result.signatureValid,
      },
      req,
    );

    return result;
  }
}

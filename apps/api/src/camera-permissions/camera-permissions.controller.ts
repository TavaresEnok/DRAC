import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CameraPermissionsService } from './camera-permissions.service';
import { GrantCameraPermissionDto } from './dto/grant-camera-permission.dto';
import { UpdateCameraPermissionDto } from './dto/update-camera-permission.dto';

@Controller('camera-permissions')
export class CameraPermissionsController {
  constructor(
    private readonly cameraPermissionsService: CameraPermissionsService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.OPERATOR)
  @Get()
  list(@CurrentUser() user: AuthUser, @Query('userId') userId?: string) {
    return this.cameraPermissionsService.list(user, userId);
  }

  @Roles(UserRole.OPERATOR)
  @Post()
  async grant(@CurrentUser() user: AuthUser, @Body() dto: GrantCameraPermissionDto, @Req() req: Request) {
    const result = await this.cameraPermissionsService.grant(user, dto);
    await this.auditService.log(
      user.id,
      'camera_permission.grant',
      'CameraPermission',
      result.id,
      { userId: dto.userId, cameraId: dto.cameraId ?? null, groupId: dto.groupId ?? null, level: dto.level },
      req,
    );
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Patch(':id')
  async update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCameraPermissionDto, @Req() req: Request) {
    const result = await this.cameraPermissionsService.update(user, id, dto);
    await this.auditService.log(user.id, 'camera_permission.update', 'CameraPermission', result.id, { level: dto.level }, req);
    return result;
  }

  @Roles(UserRole.OPERATOR)
  @Delete(':id')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const result = await this.cameraPermissionsService.remove(user, id);
    await this.auditService.log(user.id, 'camera_permission.revoke', 'CameraPermission', id, undefined, req);
    return result;
  }
}

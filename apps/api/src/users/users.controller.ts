import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { type Request } from 'express';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthUser } from '../common/types/auth-user.type';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly auditService: AuditService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Get()
  list() {
    return this.usersService.list();
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async create(@CurrentUser() actor: AuthUser, @Body() dto: CreateUserDto, @Req() req: Request) {
    const user = await this.usersService.create(actor, dto);
    await this.auditService.log(actor.id, 'user.create', 'User', user.id, { role: user.role }, req);
    return user;
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  async update(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Body() dto: UpdateUserDto, @Req() req: Request) {
    const user = await this.usersService.update(actor, id, dto);
    await this.auditService.log(actor.id, 'user.update', 'User', user.id, { role: user.role, isActive: user.isActive }, req);
    return user;
  }

  @Roles(UserRole.ADMIN)
  @Delete(':id')
  async softDelete(@CurrentUser() actor: AuthUser, @Param('id') id: string, @Req() req: Request) {
    const user = await this.usersService.softDelete(actor, id);
    await this.auditService.log(actor.id, 'user.deactivate', 'User', user.id, undefined, req);
    return user;
  }
}

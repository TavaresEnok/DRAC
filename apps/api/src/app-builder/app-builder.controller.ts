import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequirePermission } from '../role-permissions/require-permission.decorator';
import { AppBuilderService } from './app-builder.service';

/**
 * Gestão de apps white-label pela Central (admin). Faz proxy para o agente de
 * build no host. Ver AppBuilderService.
 */
@Roles(UserRole.ADMIN)
@RequirePermission('serverConfig')
@Controller('app-builder')
export class AppBuilderController {
  constructor(private readonly appBuilder: AppBuilderService) {}

  @Get('clients')
  listClients() {
    return this.appBuilder.listClients();
  }

  @Post('clients')
  createClient(@Body() body: unknown) {
    return this.appBuilder.createClient(body);
  }

  @Post('clients/:slug/build')
  startBuild(@Param('slug') slug: string) {
    return this.appBuilder.startBuild(slug);
  }

  @Get('builds')
  listBuilds() {
    return this.appBuilder.listBuilds();
  }
}

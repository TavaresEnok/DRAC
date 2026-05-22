import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFile, UseInterceptors, UseGuards } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ServiceTokenGuard } from '../auth/guards/service-token.guard';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';
import { FacesService } from './faces.service';

@Controller('faces')
export class FacesController {
  constructor(private readonly facesService: FacesService) {}

  @Roles(UserRole.OPERATOR)
  @Post('persons')
  create(@Body() dto: CreatePersonDto) {
    return this.facesService.createPerson(dto);
  }

  @Roles(UserRole.VIEWER)
  @Get('persons')
  list() {
    return this.facesService.listPersons();
  }

  @Roles(UserRole.OPERATOR)
  @Patch('persons/:id')
  update(@Param('id') id: string, @Body() dto: UpdatePersonDto) {
    return this.facesService.updatePerson(id, dto);
  }

  @Roles(UserRole.OPERATOR)
  @Delete('persons/:id')
  remove(@Param('id') id: string) {
    return this.facesService.removePerson(id);
  }

  @Roles(UserRole.OPERATOR)
  @Post('persons/:id/enroll')
  @UseInterceptors(FileInterceptor('file'))
  enroll(@Param('id') id: string, @UploadedFile() file: any) {
    return this.facesService.enroll(id, file);
  }

  @Public()
  @UseGuards(ServiceTokenGuard)
  @Get('internal/gallery')
  gallery() {
    return this.facesService.gallery();
  }
}

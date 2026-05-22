import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreatePersonDto } from './dto/create-person.dto';
import { UpdatePersonDto } from './dto/update-person.dto';

@Injectable()
export class FacesService {
  private readonly aiBaseUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.aiBaseUrl = this.configService.get<string>('aiBaseUrl') ?? 'http://ai-service:8000';
  }

  private internalHeaders() {
    const token = (this.configService.get<string>('internalServiceToken') ?? '').trim();
    return token ? { 'x-service-token': token } : undefined;
  }

  createPerson(dto: CreatePersonDto) {
    return this.prisma.person.create({
      data: {
        name: dto.name.trim(),
        externalId: dto.externalId?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
      include: { embeddings: true },
    });
  }

  listPersons() {
    return this.prisma.person.findMany({
      include: { embeddings: { select: { id: true, sourceImagePath: true, detScore: true, createdAt: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updatePerson(id: string, dto: UpdatePersonDto) {
    await this.getPersonOrThrow(id);
    return this.prisma.person.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        externalId: dto.externalId?.trim(),
        notes: dto.notes?.trim(),
        isActive: dto.isActive,
      },
      include: { embeddings: true },
    });
  }

  async removePerson(id: string) {
    await this.getPersonOrThrow(id);
    return this.prisma.person.delete({ where: { id } });
  }

  async enroll(personId: string, file: any) {
    await this.getPersonOrThrow(personId);
    if (!file?.buffer?.length) {
      throw new BadRequestException('Imagem de enrollment obrigatória.');
    }

    const form = new FormData();
    form.append('file', new Blob([file.buffer]), file.originalname || 'face.jpg');
    const response: any = await firstValueFrom(this.httpService.post(
      `${this.aiBaseUrl}/embed`,
      form,
      { headers: this.internalHeaders() },
    ));
    const embedding = response.data?.embedding;
    if (!Array.isArray(embedding) || embedding.length === 0) {
      throw new BadRequestException('Embedding facial inválido retornado pela IA.');
    }

    return this.prisma.faceEmbedding.create({
      data: {
        personId,
        embedding,
        detScore: typeof response.data?.detScore === 'number' ? response.data.detScore : null,
        sourceImagePath: null,
      },
    });
  }

  async gallery() {
    const people = await this.prisma.person.findMany({
      where: { isActive: true },
      include: { embeddings: true },
      orderBy: { name: 'asc' },
    });
    return people.flatMap((person) =>
      person.embeddings.map((embedding) => ({
        personId: person.id,
        name: person.name,
        embedding: embedding.embedding,
        embeddingId: embedding.id,
      })),
    );
  }

  private async getPersonOrThrow(id: string) {
    const person = await this.prisma.person.findUnique({ where: { id } });
    if (!person) throw new NotFoundException('Pessoa não encontrada.');
    return person;
  }
}

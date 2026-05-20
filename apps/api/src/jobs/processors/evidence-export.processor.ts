import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EvidenceService } from '../../evidence/evidence.service';
import { EVIDENCE_EXPORT_QUEUE } from '../queues/evidence-export.queue';

type ExecuteExportJob = {
  investigationId: string;
  requestId: string;
  packageItemId: string;
  executionReason: string;
  executedByUserId: string;
  executedByUserName: string;
};

type RetrySignatureJob = {
  investigationId: string;
  packageItemId: string;
};

@Injectable()
@Processor(EVIDENCE_EXPORT_QUEUE)
export class EvidenceExportProcessor extends WorkerHost {
  constructor(
    private readonly prisma: PrismaService,
    private readonly evidenceService: EvidenceService,
  ) {
    super();
  }

  private async writePackageArtifact(investigationId: string, packageItemId: string, content: Record<string, unknown>) {
    const root = process.env.EVIDENCE_PACKAGES_ROOT || './storage/evidence-packages';
    const now = new Date();
    const dir = join(
      root,
      investigationId,
      `${now.getUTCFullYear()}`,
      `${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
      `${String(now.getUTCDate()).padStart(2, '0')}`,
    );
    await mkdir(dir, { recursive: true });
    const filePath = join(dir, `package-${packageItemId}.json`);
    const raw = JSON.stringify(content, null, 2);
    await writeFile(filePath, raw, 'utf-8');
    const sizeBytes = Buffer.byteLength(raw, 'utf-8');
    const sha256 = createHash('sha256').update(raw).digest('hex');
    return { filePath, sizeBytes, sha256 };
  }

  private async setPackageStatus(packageItemId: string, patch: Record<string, unknown>) {
    const item = await this.prisma.investigationItem.findUnique({ where: { id: packageItemId } });
    if (!item) return;
    const metadata = item.metadata && typeof item.metadata === 'object'
      ? ({ ...(item.metadata as Record<string, unknown>) })
      : {};
    await this.prisma.investigationItem.update({
      where: { id: packageItemId },
      data: {
        metadata: {
          ...metadata,
          ...patch,
          updatedAt: new Date().toISOString(),
        } as Prisma.InputJsonValue,
      },
    });
  }

  private async retrySingleSignature(data: RetrySignatureJob) {
    const item = await this.prisma.investigationItem.findUnique({ where: { id: data.packageItemId } });
    if (!item) return;
    const metadata = item.metadata && typeof item.metadata === 'object' ? (item.metadata as Record<string, unknown>) : {};
    if (metadata.status !== 'PENDING_SIGNATURE' || !metadata.payload || typeof metadata.payload !== 'object') return;
    try {
      const signature = this.evidenceService.signPackage(metadata.payload as Record<string, unknown>);
      const artifact = await this.writePackageArtifact(data.investigationId, data.packageItemId, { payload: metadata.payload, signature });
      await this.setPackageStatus(data.packageItemId, {
        status: 'READY',
        signature,
        artifact,
        signatureError: null,
        retriedAt: new Date().toISOString(),
      });
    } catch (error) {
      await this.setPackageStatus(data.packageItemId, {
        status: 'PENDING_SIGNATURE',
        signatureError: error instanceof Error ? error.message : 'signature_failed',
        retriedAt: new Date().toISOString(),
      });
    }
    await this.prisma.auditLog.create({
      data: {
        userId: null,
        action: 'investigation.export.signature.retry',
        entityType: 'Investigation',
        entityId: data.investigationId,
        metadata: { packageItemId: data.packageItemId } as Prisma.InputJsonValue,
      },
    });
  }

  async process(job: Job<ExecuteExportJob | RetrySignatureJob>) {
    if (job.name === 'execute-export') {
      const data = job.data as ExecuteExportJob;
      await this.setPackageStatus(data.packageItemId, { status: 'PROCESSING', progress: 20 });

      const reqItem = await this.prisma.investigationItem.findFirst({
        where: { investigationId: data.investigationId, id: data.requestId, type: 'export_request' },
      });
      if (!reqItem) {
        await this.setPackageStatus(data.packageItemId, { status: 'FAILED', error: 'request_not_found' });
        return;
      }
      const reqMeta = reqItem.metadata && typeof reqItem.metadata === 'object' ? (reqItem.metadata as Record<string, unknown>) : {};
      if (reqMeta.status !== 'APPROVED') {
        await this.setPackageStatus(data.packageItemId, { status: 'FAILED', error: 'request_not_approved' });
        return;
      }

      const inv = await this.prisma.investigation.findUnique({
        where: { id: data.investigationId },
        include: { items: { orderBy: { timestamp: 'asc' } } },
      });
      if (!inv) {
        await this.setPackageStatus(data.packageItemId, { status: 'FAILED', error: 'investigation_not_found' });
        return;
      }
      await this.setPackageStatus(data.packageItemId, { progress: 60 });

      const payload = {
        investigationId: inv.id,
        investigationTitle: inv.title,
        exportedAt: new Date().toISOString(),
        executedByUserId: data.executedByUserId,
        executedByUserName: data.executedByUserName,
        executionReason: data.executionReason,
        requestId: data.requestId,
        request: reqMeta,
        evidenceItems: inv.items
          .filter((i) => ['event', 'clip', 'snapshot', 'bookmark'].includes(i.type))
          .map((i) => ({
            id: i.id,
            type: i.type,
            label: i.label,
            cameraId: i.cameraId,
            recordingId: i.recordingId,
            timestamp: i.timestamp,
          })),
      };

      try {
        const signature = this.evidenceService.signPackage(payload as Record<string, unknown>);
        const artifact = await this.writePackageArtifact(data.investigationId, data.packageItemId, { payload, signature });
        await this.setPackageStatus(data.packageItemId, {
          status: 'READY',
          progress: 100,
          payload,
          signature,
          artifact,
          signatureError: null,
        });
      } catch (error) {
        const artifact = await this.writePackageArtifact(data.investigationId, data.packageItemId, { payload, signature: null, signatureError: error instanceof Error ? error.message : 'signature_failed' });
        await this.setPackageStatus(data.packageItemId, {
          status: 'PENDING_SIGNATURE',
          progress: 100,
          payload,
          signature: null,
          artifact,
          signatureError: error instanceof Error ? error.message : 'signature_failed',
        });
      }

      await this.prisma.auditLog.create({
        data: {
          userId: data.executedByUserId,
          action: 'investigation.export.package.processed',
          entityType: 'Investigation',
          entityId: data.investigationId,
          metadata: { requestId: data.requestId, packageItemId: data.packageItemId } as Prisma.InputJsonValue,
        },
      });
      return;
    }

    if (job.name === 'retry-signature') {
      const data = job.data as RetrySignatureJob;
      await this.retrySingleSignature(data);
      return;
    }

    if (job.name === 'retry-all-pending-signatures') {
      const pendingItems = await this.prisma.investigationItem.findMany({
        where: {
          type: 'export_package',
          metadata: {
            path: ['status'],
            equals: 'PENDING_SIGNATURE',
          },
        },
        select: {
          id: true,
          investigationId: true,
        },
        take: 200,
        orderBy: { createdAt: 'asc' },
      });

      for (const item of pendingItems) {
        await this.retrySingleSignature({
          investigationId: item.investigationId,
          packageItemId: item.id,
        });
      }
    }
  }
}

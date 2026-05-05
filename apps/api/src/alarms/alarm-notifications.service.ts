import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlarmInstance, AlarmRule } from '@prisma/client';
import axios from 'axios';
import nodemailer from 'nodemailer';

@Injectable()
export class AlarmNotificationsService {
  private readonly logger = new Logger(AlarmNotificationsService.name);

  constructor(private readonly configService: ConfigService) {}

  private buildPayload(alarm: AlarmInstance) {
    return {
      id: alarm.id,
      cameraId: alarm.cameraId,
      eventId: alarm.eventId,
      source: alarm.source,
      type: alarm.type,
      title: alarm.title,
      message: alarm.message,
      severity: alarm.severity,
      priority: alarm.priority,
      status: alarm.status,
      occurrenceCount: alarm.occurrenceCount,
      firstOccurredAt: alarm.firstOccurredAt,
      lastOccurredAt: alarm.lastOccurredAt,
      metadata: alarm.metadata,
    };
  }

  async notifyOnOpen(alarm: AlarmInstance, rule: AlarmRule | null) {
    const targets = {
      webhook: (rule?.webhookUrl?.trim() || this.configService.get<string>('alarmWebhookDefaultUrl') || '').trim(),
      emailTo: (rule?.emailTo?.trim() || '').trim(),
    };

    const payload = this.buildPayload(alarm);

    if (targets.webhook) {
      try {
        await axios.post(targets.webhook, payload, { timeout: 8000 });
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown';
        this.logger.warn(`Webhook notification failed for alarm=${alarm.id}: ${message}`);
      }
    }

    if (targets.emailTo) {
      const host = this.configService.get<string>('smtpHost') ?? '';
      const port = Number(this.configService.get<number>('smtpPort') ?? 587);
      const secure = Boolean(this.configService.get<boolean>('smtpSecure') ?? false);
      const user = this.configService.get<string>('smtpUser') ?? '';
      const pass = this.configService.get<string>('smtpPass') ?? '';
      const from = this.configService.get<string>('alarmEmailFrom') ?? user;

      if (host && from && user && pass) {
        try {
          const transporter = nodemailer.createTransport({
            host,
            port,
            secure,
            auth: { user, pass },
          });
          await transporter.sendMail({
            from,
            to: targets.emailTo,
            subject: `[ALARM ${alarm.priority}] ${alarm.type} camera=${alarm.cameraId ?? 'unknown'}`,
            text: JSON.stringify(payload, null, 2),
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'unknown';
          this.logger.warn(`Email notification failed for alarm=${alarm.id}: ${message}`);
        }
      } else {
        this.logger.warn(`Email notification skipped for alarm=${alarm.id}: SMTP env not fully configured.`);
      }
    }
  }
}

import { Injectable } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import {
  type BudgetNotification,
  NotificationGateway,
  type StatusNotification,
} from '@notification/application/notification.gateway';
import {
  type RenderedEmail,
  renderBudgetEmail,
  renderStatusUpdateEmail,
} from '@notification/infrastructure/email-templates';

@Injectable()
export class SmtpNotificationGateway implements NotificationGateway {
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor() {
    const port = Number(process.env.SMTP_PORT ?? 1025);
    const user = process.env.SMTP_USER;

    this.transporter = createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port,
      secure: port === 465,
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      auth: user ? { user, pass: process.env.SMTP_PASS } : undefined,
    });
    this.from = process.env.SMTP_FROM ?? 'Garage Flow <no-reply@garageflow.local>';
  }

  sendStatusUpdate(notification: StatusNotification): Promise<void> {
    return this.send(notification.to, renderStatusUpdateEmail(notification));
  }

  sendBudget(notification: BudgetNotification): Promise<void> {
    return this.send(notification.to, renderBudgetEmail(notification));
  }

  private async send(to: string, email: RenderedEmail): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: email.subject,
      text: email.text,
      html: email.html,
    });
  }
}

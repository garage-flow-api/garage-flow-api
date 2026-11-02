import { Module } from '@nestjs/common';
import { NotificationGateway } from '@notification/application/notification.gateway';
import { SmtpNotificationGateway } from '@notification/infrastructure/smtp-notification.gateway';

@Module({
  providers: [{ provide: NotificationGateway, useClass: SmtpNotificationGateway }],
  exports: [NotificationGateway],
})
export class NotificationModule {}

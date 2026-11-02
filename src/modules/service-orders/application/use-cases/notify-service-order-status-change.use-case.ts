import { Injectable, Logger } from '@nestjs/common';

import { NotificationGateway } from '@notification/application/notification.gateway';
import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { toPublicStatus } from '@service-orders/domain/value-objects/public-service-order-status.vo';
import { buildTrackingLink } from '@service-orders/infrastructure/security/tracking-token.util';
import { buildBudgetDecisionLink } from '@service-orders/infrastructure/security/budget-decision-token.util';
import { BuildServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/build-service-order-budget.use-case';
import { FindVehicleByIdUseCase } from '@vehicle/application/use-cases/find-vehicle-by-id.use-case';
import { FindClientByIdUseCase } from '@client/application/use-cases/find-client-by-id.use-case';

@Injectable()
export class NotifyServiceOrderStatusChangeUseCase {
  private readonly logger = new Logger(NotifyServiceOrderStatusChangeUseCase.name);

  constructor(
    private readonly notificationGateway: NotificationGateway,
    private readonly findVehicleById: FindVehicleByIdUseCase,
    private readonly findClientById: FindClientByIdUseCase,
    private readonly buildBudget: BuildServiceOrderBudgetUseCase,
  ) {}

  /**
   * Nunca lança: falha de e-mail não pode desfazer a mudança de status.
   * Quando `previousStatus` é informado e o cliente enxerga o mesmo status que antes
   * (ex.: AWAITING_EXECUTION -> IN_EXECUTION, ambos "Execução"), nenhum e-mail é enviado.
   */
  async execute(serviceOrder: ServiceOrder, previousStatus?: ServiceOrderStatus): Promise<void> {
    try {
      if (
        previousStatus !== undefined &&
        toPublicStatus(previousStatus) === toPublicStatus(serviceOrder.status)
      ) {
        return;
      }
      await this.notify(serviceOrder);
    } catch (error) {
      this.logger.error(
        `Failed to notify status change of service order ${serviceOrder.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  private async notify(serviceOrder: ServiceOrder): Promise<void> {
    const vehicle = await this.findVehicleById.execute(serviceOrder.vehicleId);
    const client = await this.findClientById.execute(vehicle.clientId);

    if (!client.email) {
      this.logger.log(`Client of service order ${serviceOrder.id} has no e-mail; skipping`);
      return;
    }

    const baseUrl = (process.env.PUBLIC_BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const trackingLink = buildTrackingLink(baseUrl, serviceOrder.id);

    if (serviceOrder.status === ServiceOrderStatus.AWAITING_APPROVAL) {
      const budget = await this.buildBudget.execute(serviceOrder);
      await this.notificationGateway.sendBudget({
        to: client.email,
        recipientName: client.name,
        lines: [...budget.services, ...budget.parts].map((line) => ({
          description: line.quantity > 1 ? `${line.name} (x${line.quantity})` : line.name,
          amount: line.subtotal,
        })),
        totalAmount: budget.totalAmount,
        approveUrl: buildBudgetDecisionLink(baseUrl, serviceOrder.id, 'approve'),
        rejectUrl: buildBudgetDecisionLink(baseUrl, serviceOrder.id, 'reject'),
        trackingLink,
      });
      return;
    }

    await this.notificationGateway.sendStatusUpdate({
      to: client.email,
      recipientName: client.name,
      status: toPublicStatus(serviceOrder.status),
      trackingLink,
    });
  }
}

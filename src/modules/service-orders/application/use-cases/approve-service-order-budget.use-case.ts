import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';

@Injectable()
export class ApproveServiceOrderBudgetUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly notifyStatusChange: NotifyServiceOrderStatusChangeUseCase,
  ) {}

  async execute(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');

    serviceOrder.approveBudget();
    await this.serviceOrderRepository.save(serviceOrder);
    await this.notifyStatusChange.execute(serviceOrder);
    return serviceOrder;
  }
}

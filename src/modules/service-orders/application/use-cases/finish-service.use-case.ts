import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { WriteOffPartsUseCase } from '@inventory/application/use-cases/write-off-parts.use-case';

@Injectable()
export class FinishServiceUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly writeOffParts: WriteOffPartsUseCase,
    private readonly notifyStatusChange: NotifyServiceOrderStatusChangeUseCase,
  ) {}

  async execute(serviceOrderId: string, mechanicId: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(serviceOrderId);
    if (!serviceOrder) throw new NotFoundError('Service order not found');
    serviceOrder.finishService(mechanicId);
    await this.writeOffParts.execute(
      serviceOrder.partItems.map((item) => ({
        inventoryId: item.inventoryId,
        quantity: item.quantity,
      })),
    );
    await this.serviceOrderRepository.save(serviceOrder);
    await this.notifyStatusChange.execute(serviceOrder);
    return serviceOrder;
  }
}

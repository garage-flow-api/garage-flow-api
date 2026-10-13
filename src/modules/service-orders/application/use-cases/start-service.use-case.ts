import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

@Injectable()
export class StartServiceUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(serviceOrderId: string, mechanicId: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(serviceOrderId);
    if (!serviceOrder) throw new NotFoundError('Service order not found');

    serviceOrder.startService(mechanicId);
    await this.serviceOrderRepository.save(serviceOrder);
    return serviceOrder;
  }
}

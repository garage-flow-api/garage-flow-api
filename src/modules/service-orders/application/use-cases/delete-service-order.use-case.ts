import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

@Injectable()
export class DeleteServiceOrderUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(id: string): Promise<void> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');

    serviceOrder.softDelete();
    await this.serviceOrderRepository.save(serviceOrder);
  }
}

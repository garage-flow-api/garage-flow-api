import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

@Injectable()
export class FindServiceOrderByIdUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');
    return serviceOrder;
  }
}

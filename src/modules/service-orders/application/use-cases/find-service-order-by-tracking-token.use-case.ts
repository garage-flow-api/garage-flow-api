import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { resolveTrackingToken } from '@service-orders/infrastructure/security/tracking-token.util';

@Injectable()
export class FindServiceOrderByTrackingTokenUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(token: string): Promise<ServiceOrder> {
    let serviceOrderId: string;
    try {
      serviceOrderId = resolveTrackingToken(token);
    } catch {
      throw new NotFoundError('Service order not found');
    }

    const serviceOrder = await this.serviceOrderRepository.findById(serviceOrderId);
    if (!serviceOrder) throw new NotFoundError('Service order not found');
    return serviceOrder;
  }
}

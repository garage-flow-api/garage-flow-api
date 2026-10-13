import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceRepository } from '@service/domain/repositories/service.repository';
import { ServiceEntity } from '@service/domain/entities/service.entity';
import { ServicePrice } from '@service/domain/value-objects/service-price.value-object';

@Injectable()
export class UpdateServiceUseCase {
  constructor(private readonly serviceRepository: ServiceRepository) {}

  async execute(id: string, name?: string, price?: number): Promise<ServiceEntity> {
    const service = await this.serviceRepository.findById(id);
    if (!service) {
      throw new NotFoundError(`Service with id ${id} not found`);
    }

    const servicePrice = price !== undefined ? ServicePrice.create(price) : undefined;
    service.update(name, servicePrice);

    return this.serviceRepository.update(service);
  }
}

import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceRepository } from '@service/domain/repositories/service.repository';
import { ServiceEntity } from '@service/domain/entities/service.entity';

@Injectable()
export class FindServiceByIdUseCase {
  constructor(private readonly serviceRepository: ServiceRepository) {}

  async execute(id: string): Promise<ServiceEntity> {
    const service = await this.serviceRepository.findById(id);
    if (!service || service.isDeleted) {
      throw new NotFoundError(`Service with id ${id} not found`);
    }
    return service;
  }
}

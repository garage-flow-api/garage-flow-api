import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceRepository } from '@service/domain/repositories/service.repository';
import { ServiceEntity } from '@service/domain/entities/service.entity';

@Injectable()
export class FindServicesByIdListUseCase {
  constructor(private readonly serviceRepository: ServiceRepository) {}

  async execute(idList: string[]): Promise<ServiceEntity[]> {
    const services = await this.serviceRepository.findByIdList(idList);
    if (!services || services.length === 0) {
      throw new NotFoundError(`No services found with ids ${idList.join(', ')}`);
    }
    return services;
  }
}

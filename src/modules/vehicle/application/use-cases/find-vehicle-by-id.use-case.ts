import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';

@Injectable()
export class FindVehicleByIdUseCase {
  constructor(private readonly vehicleRepository: VehicleRepository) {}

  async execute(id: string): Promise<VehicleEntity> {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) {
      throw new NotFoundError(`Vehicle with id ${id} not found`);
    }
    return vehicle;
  }
}

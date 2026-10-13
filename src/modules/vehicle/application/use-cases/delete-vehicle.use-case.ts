import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';

@Injectable()
export class DeleteVehicleUseCase {
  constructor(private readonly vehicleRepository: VehicleRepository) {}

  async execute(id: string): Promise<void> {
    const vehicle = await this.vehicleRepository.findById(id);
    if (!vehicle) {
      throw new NotFoundError(`Vehicle with id ${id} not found`);
    }

    vehicle.softDelete();
    await this.vehicleRepository.update(vehicle);
  }
}

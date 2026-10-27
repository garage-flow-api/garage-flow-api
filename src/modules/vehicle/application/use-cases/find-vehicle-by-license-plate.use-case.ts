import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';

@Injectable()
export class FindVehicleByLicensePlateUseCase {
  constructor(private readonly vehicleRepository: VehicleRepository) {}

  async execute(licensePlate: string): Promise<VehicleEntity> {
    const vehicle = await this.vehicleRepository.findByLicensePlate(licensePlate);
    if (!vehicle) throw new NotFoundError('Vehicle not found');
    return vehicle;
  }
}

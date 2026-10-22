import { BusinessRuleError, DomainError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';
import { LicensePlate } from '@vehicle/domain/value-objects/license-plate.vo';
import { CreateVehicleUseCase } from './create-vehicle.use-case';

export interface EnsureVehicleInput {
  clientId: string;
  licensePlate: string;
  brand?: string;
  model?: string;
  year?: number;
}

@Injectable()
export class EnsureVehicleUseCase {
  constructor(
    private readonly vehicleRepository: VehicleRepository,
    private readonly createVehicle: CreateVehicleUseCase,
  ) {}

  async execute(input: EnsureVehicleInput): Promise<VehicleEntity> {
    const licensePlate = LicensePlate.create(input.licensePlate);

    const existing = await this.vehicleRepository.findByLicensePlate(licensePlate.value);
    if (existing) {
      if (existing.clientId !== input.clientId) {
        throw new BusinessRuleError('Vehicle does not belong to the informed client');
      }
      return existing;
    }

    const { brand, model, year } = input;
    if (!brand || !model || year === undefined) {
      throw new DomainError(
        'brand, model and year are required when the vehicle is not registered yet',
      );
    }

    return this.createVehicle.execute({
      clientId: input.clientId,
      licensePlate: input.licensePlate,
      brand,
      model,
      year,
    });
  }
}

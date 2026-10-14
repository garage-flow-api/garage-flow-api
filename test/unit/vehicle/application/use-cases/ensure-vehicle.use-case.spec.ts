import { BusinessRuleError, DomainError } from '@common/errors/domain.error';
import { EnsureVehicleUseCase } from '@vehicle/application/use-cases/ensure-vehicle.use-case';
import { type CreateVehicleUseCase } from '@vehicle/application/use-cases/create-vehicle.use-case';
import { type VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { type VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';

describe('EnsureVehicleUseCase', () => {
  let repository: { findByLicensePlate: jest.Mock };
  let createVehicle: { execute: jest.Mock };
  let useCase: EnsureVehicleUseCase;

  const plate = 'ABC1D23';
  const existingVehicle = { id: 'vehicle-1', clientId: 'client-1' } as VehicleEntity;
  const newVehicle = { id: 'vehicle-2', clientId: 'client-1' } as VehicleEntity;

  beforeEach(() => {
    repository = { findByLicensePlate: jest.fn().mockResolvedValue(null) };
    createVehicle = { execute: jest.fn().mockResolvedValue(newVehicle) };
    useCase = new EnsureVehicleUseCase(
      repository as unknown as VehicleRepository,
      createVehicle as unknown as CreateVehicleUseCase,
    );
  });

  it('reaproveita o veículo existente do mesmo cliente', async () => {
    repository.findByLicensePlate.mockResolvedValue(existingVehicle);

    await expect(useCase.execute({ clientId: 'client-1', licensePlate: plate })).resolves.toBe(
      existingVehicle,
    );
    expect(createVehicle.execute).not.toHaveBeenCalled();
  });

  it('rejeita placa que pertence a outro cliente', async () => {
    repository.findByLicensePlate.mockResolvedValue(existingVehicle);

    await expect(useCase.execute({ clientId: 'client-9', licensePlate: plate })).rejects.toThrow(
      BusinessRuleError,
    );
    expect(createVehicle.execute).not.toHaveBeenCalled();
  });

  it('cadastra o veículo quando a placa ainda não existe', async () => {
    const input = {
      clientId: 'client-1',
      licensePlate: plate,
      brand: 'Fiat',
      model: 'Uno',
      year: 2020,
    };

    await expect(useCase.execute(input)).resolves.toBe(newVehicle);
    expect(createVehicle.execute).toHaveBeenCalledWith(expect.objectContaining(input));
  });

  it.each(['brand', 'model', 'year'])('rejeita veículo novo sem %s', async (missing) => {
    const input: Record<string, unknown> = {
      clientId: 'client-1',
      licensePlate: plate,
      brand: 'Fiat',
      model: 'Uno',
      year: 2020,
    };
    delete input[missing];

    await expect(useCase.execute(input as never)).rejects.toThrow(DomainError);
    expect(createVehicle.execute).not.toHaveBeenCalled();
  });
});

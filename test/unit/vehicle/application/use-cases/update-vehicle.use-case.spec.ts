import { NotFoundError } from '@common/errors/domain.error';

import { UpdateVehicleUseCase } from '@vehicle/application/use-cases/update-vehicle.use-case';
import { type VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { type VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';
import { makeVehicle, makeVehicleRepositoryMock } from '../../vehicle.factory';

describe('UpdateVehicleUseCase', () => {
  let repository: jest.Mocked<VehicleRepository>;
  let useCase: UpdateVehicleUseCase;

  beforeEach(() => {
    repository = makeVehicleRepositoryMock();
    repository.update.mockImplementation((v: VehicleEntity) => Promise.resolve(v));
    useCase = new UpdateVehicleUseCase(repository);
  });

  it('aplica as alterações e persiste', async () => {
    const vehicle = makeVehicle();
    repository.findById.mockResolvedValue(vehicle);

    const updated = await useCase.execute(vehicle.id, { model: 'Polo', year: 2023 });

    expect(updated.model).toBe('Polo');
    expect(updated.year).toBe(2023);
    expect(updated.brand).toBe('Volkswagen');
    expect(repository.update).toHaveBeenCalledWith(vehicle);
  });

  it('mantém placa e dono inalterados', async () => {
    const vehicle = makeVehicle();
    const { clientId } = vehicle;
    repository.findById.mockResolvedValue(vehicle);

    const updated = await useCase.execute(vehicle.id, { model: 'Polo' });

    expect(updated.licensePlate.value).toBe('ABC1D23');
    expect(updated.clientId).toBe(clientId);
  });

  it('lança 404 e não persiste quando o veículo não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente', { model: 'Polo' })).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

import { NotFoundError } from '@common/errors/domain.error';

import { DeleteVehicleUseCase } from '@vehicle/application/use-cases/delete-vehicle.use-case';
import { type VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { type VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';
import { makeVehicle, makeVehicleRepositoryMock } from '../../vehicle.factory';

describe('DeleteVehicleUseCase', () => {
  let repository: jest.Mocked<VehicleRepository>;
  let useCase: DeleteVehicleUseCase;

  beforeEach(() => {
    repository = makeVehicleRepositoryMock();
    repository.update.mockImplementation((v: VehicleEntity) => Promise.resolve(v));
    useCase = new DeleteVehicleUseCase(repository);
  });

  it('faz soft delete e persiste em vez de apagar', async () => {
    const vehicle = makeVehicle();
    repository.findById.mockResolvedValue(vehicle);

    await useCase.execute(vehicle.id);

    expect(vehicle.isDeleted).toBe(true);
    expect(vehicle.deletedAt).toBeInstanceOf(Date);
    expect(repository.update).toHaveBeenCalledWith(vehicle);
  });

  it('lança 404 e não persiste quando o veículo não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

import { NotFoundError } from '@common/errors/domain.error';

import { FindVehicleByIdUseCase } from '@vehicle/application/use-cases/find-vehicle-by-id.use-case';
import { type VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { makeVehicle, makeVehicleRepositoryMock } from '../../vehicle.factory';

describe('FindVehicleByIdUseCase', () => {
  let repository: jest.Mocked<VehicleRepository>;
  let useCase: FindVehicleByIdUseCase;

  beforeEach(() => {
    repository = makeVehicleRepositoryMock();
    useCase = new FindVehicleByIdUseCase(repository);
  });

  it('devolve o veículo encontrado', async () => {
    const vehicle = makeVehicle();
    repository.findById.mockResolvedValue(vehicle);

    await expect(useCase.execute(vehicle.id)).resolves.toBe(vehicle);
    expect(repository.findById).toHaveBeenCalledWith(vehicle.id);
  });

  it('lança 404 quando o veículo não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundError);
  });
});

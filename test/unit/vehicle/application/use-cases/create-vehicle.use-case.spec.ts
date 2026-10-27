import { ConflictError, NotFoundError } from '@common/errors/domain.error';

import { CreateVehicleUseCase } from '@vehicle/application/use-cases/create-vehicle.use-case';
import { type VehicleRepository } from '@vehicle/domain/repositories/vehicle.repository';
import { type VehicleEntity } from '@vehicle/domain/entities/vehicle.entity';
import { InvalidLicensePlateError } from '@vehicle/domain/value-objects/license-plate.vo';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { type ClientEntity } from '@client/domain/entities/client.entity';
import { makeVehicleRepositoryMock } from '../../vehicle.factory';
import { makeClient, makeClientRepositoryMock } from '../../../client/client.factory';

describe('CreateVehicleUseCase', () => {
  let vehicleRepository: jest.Mocked<VehicleRepository>;
  let clientRepository: jest.Mocked<ClientRepository>;
  let useCase: CreateVehicleUseCase;

  const input = {
    brand: 'Volkswagen',
    model: 'Gol',
    licensePlate: 'abc-1234',
    year: 2020,
    clientId: '123e4567-e89b-12d3-a456-426614174000',
  };

  beforeEach(() => {
    vehicleRepository = makeVehicleRepositoryMock();
    vehicleRepository.create.mockImplementation((v: VehicleEntity) => Promise.resolve(v));
    vehicleRepository.findByLicensePlate.mockResolvedValue(null);

    clientRepository = makeClientRepositoryMock();
    clientRepository.findById.mockResolvedValue(makeClient());

    useCase = new CreateVehicleUseCase(vehicleRepository, clientRepository);
  });

  it('cria o veículo normalizando a placa', async () => {
    const vehicle = await useCase.execute(input);

    expect(vehicleRepository.create).toHaveBeenCalledTimes(1);
    expect(vehicle.licensePlate.value).toBe('ABC1234');
    expect(vehicle.licensePlate.type).toBe('OLD');
    expect(vehicle.brand).toBe('Volkswagen');
    expect(vehicle.clientId).toBe(input.clientId);
    expect(vehicle.id).toEqual(expect.any(String));
    expect(vehicle.deletedAt).toBeNull();
  });

  it('consulta duplicidade usando a placa normalizada', async () => {
    await useCase.execute(input);

    expect(vehicleRepository.findByLicensePlate).toHaveBeenCalledWith('ABC1234');
  });

  it('rejeita placa inválida com 400 antes de tocar os repositórios', async () => {
    await expect(useCase.execute({ ...input, licensePlate: 'AB12' })).rejects.toThrow(
      InvalidLicensePlateError,
    );
    expect(clientRepository.findById).not.toHaveBeenCalled();
    expect(vehicleRepository.findByLicensePlate).not.toHaveBeenCalled();
    expect(vehicleRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita com 404 quando o cliente não existe', async () => {
    clientRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
    expect(vehicleRepository.create).not.toHaveBeenCalled();
  });

  it('rejeita placa já cadastrada com 409', async () => {
    vehicleRepository.findByLicensePlate.mockResolvedValue({} as VehicleEntity);

    await expect(useCase.execute(input)).rejects.toThrow(ConflictError);
    expect(vehicleRepository.create).not.toHaveBeenCalled();
  });

  it('valida o dono antes de consultar a placa', async () => {
    clientRepository.findById.mockResolvedValue(null);

    await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
    expect(vehicleRepository.findByLicensePlate).not.toHaveBeenCalled();
  });

  it('aceita placa no padrão Mercosul', async () => {
    const vehicle = await useCase.execute({ ...input, licensePlate: 'ABC1D23' });

    expect(vehicle.licensePlate.type).toBe('MERCOSUL');
  });

  it('não usa a entidade do cliente além da checagem de existência', async () => {
    const client: ClientEntity = makeClient();
    clientRepository.findById.mockResolvedValue(client);

    const vehicle = await useCase.execute(input);

    expect(vehicle.clientId).toBe(input.clientId);
    expect(vehicle.clientId).not.toBe(client.id);
  });
});

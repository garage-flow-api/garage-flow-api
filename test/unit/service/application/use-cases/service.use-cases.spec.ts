import { NotFoundError } from '@common/errors/domain.error';

import { CreateServiceUseCase } from '@service/application/use-cases/create-service.use-case';
import { FindAllServicesUseCase } from '@service/application/use-cases/find-all-services.use-case';
import { FindServiceByIdUseCase } from '@service/application/use-cases/find-service-by-id.use-case';
import { UpdateServiceUseCase } from '@service/application/use-cases/update-service.use-case';
import { DeleteServiceUseCase } from '@service/application/use-cases/delete-service.use-case';
import { type ServiceRepository } from '@service/domain/repositories/service.repository';
import { ServiceEntity } from '@service/domain/entities/service.entity';
import { ServicePrice } from '@service/domain/value-objects/service-price.value-object';
import { type UUID } from 'crypto';
import { FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';

const mockId = '123e4567-e89b-12d3-a456-426614174000' as UUID;

const makeService = (overrides = {}): ServiceEntity =>
  ServiceEntity.create({
    id: mockId,
    name: 'Troca de óleo',
    price: ServicePrice.create(150),
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    deletedAt: null,
    ...overrides,
  });

const makeRepository = (): jest.Mocked<ServiceRepository> => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findById: jest.fn(),
  update: jest.fn(),
  findByIdList: jest.fn(),
});

describe('CreateServiceUseCase', () => {
  it('should create a service', async () => {
    const repo = makeRepository();
    const service = makeService();
    repo.create.mockResolvedValue(service);

    const useCase = new CreateServiceUseCase(repo);
    const result = await useCase.execute('Troca de óleo', 150);

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(result.name).toBe('Troca de óleo');
  });
});

describe('FindAllServicesUseCase', () => {
  it('should return all services from repository', async () => {
    const repo = makeRepository();
    const active = makeService();
    repo.findAll.mockResolvedValue([active]);

    const useCase = new FindAllServicesUseCase(repo);
    const result = await useCase.execute();

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(mockId);
  });
});

describe('FindServiceByIdUseCase', () => {
  let repo: jest.Mocked<ServiceRepository>;

  beforeEach(() => {
    repo = makeRepository();
  });

  it('should return a service by id', async () => {
    const service = makeService();
    repo.findById.mockResolvedValue(service);

    const useCase = new FindServiceByIdUseCase(repo);
    const result = await useCase.execute(mockId);

    expect(result.id).toBe(mockId);
  });

  it('should throw NotFoundError when service not found', async () => {
    repo.findById.mockResolvedValue(null);

    const useCase = new FindServiceByIdUseCase(repo);
    await expect(useCase.execute(mockId)).rejects.toThrow(NotFoundError);
  });

  it('should throw NotFoundError when service is deleted', async () => {
    const service = makeService();
    service.softDelete();
    repo.findById.mockResolvedValue(service);

    const useCase = new FindServiceByIdUseCase(repo);
    await expect(useCase.execute(mockId)).rejects.toThrow(NotFoundError);
  });
});

describe('UpdateServiceUseCase', () => {
  let repo: jest.Mocked<ServiceRepository>;

  beforeEach(() => {
    repo = makeRepository();
  });

  it('should update a service', async () => {
    const service = makeService();
    repo.findById.mockResolvedValue(service);
    repo.update.mockResolvedValue(service);

    const useCase = new UpdateServiceUseCase(repo);
    await useCase.execute(mockId, 'Alinhamento', 200);

    expect(repo.update).toHaveBeenCalledTimes(1);
    expect(service.name).toBe('Alinhamento');
  });

  it('should throw NotFoundError when service not found', async () => {
    repo.findById.mockResolvedValue(null);

    const useCase = new UpdateServiceUseCase(repo);
    await expect(useCase.execute(mockId, 'Alinhamento')).rejects.toThrow(NotFoundError);
  });
});

describe('DeleteServiceUseCase', () => {
  let repo: jest.Mocked<ServiceRepository>;

  beforeEach(() => {
    repo = makeRepository();
  });

  it('should soft delete a service', async () => {
    const service = makeService();
    repo.findById.mockResolvedValue(service);
    repo.update.mockResolvedValue(service);

    const useCase = new DeleteServiceUseCase(repo);
    await useCase.execute(mockId);

    expect(service.isDeleted).toBe(true);
    expect(repo.update).toHaveBeenCalledWith(service);
  });

  it('should throw NotFoundError when service not found', async () => {
    repo.findById.mockResolvedValue(null);

    const useCase = new DeleteServiceUseCase(repo);
    await expect(useCase.execute(mockId)).rejects.toThrow(NotFoundError);
  });
});

describe('FindServicesByIdListUseCase', () => {
  let repo: jest.Mocked<ServiceRepository>;

  beforeEach(() => {
    repo = makeRepository();
  });

  it('should return services by id list', async () => {
    const service1 = makeService({ id: 'id-1' as UUID });
    const service2 = makeService({ id: 'id-2' as UUID });
    repo.findByIdList.mockResolvedValue([service1, service2]);

    const useCase = new FindServicesByIdListUseCase(repo);
    const result = await useCase.execute(['id-1', 'id-2']);
    expect(result).toEqual([service1, service2]);
  });

  it('should throw NotFoundError when no services found', async () => {
    repo.findByIdList.mockResolvedValue([]);

    const useCase = new FindServicesByIdListUseCase(repo);
    await expect(useCase.execute(['id-1', 'id-2'])).rejects.toThrow(NotFoundError);
  });
});

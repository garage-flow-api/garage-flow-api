import { NotFoundError } from '@common/errors/domain.error';

import { UpdateServiceOrderUseCase } from '@service-orders/application/use-cases/update-service-order.use-case';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { type UpdateServiceOrderDto } from '@service-orders/presentation/dtos/update-service-order.dto';
import { makeServiceOrder } from '../service-order.factory';

describe('UpdateServiceOrderUseCase', () => {
  let repository: jest.Mocked<ServiceOrderRepository>;
  let useCase: UpdateServiceOrderUseCase;

  const buildServiceOrder = () => ServiceOrder.create('vehicle-1', 'Ruído no motor', [], [], 0);

  beforeEach(() => {
    repository = {
      save: jest.fn((serviceOrder) => Promise.resolve(serviceOrder)),
      findById: jest.fn().mockResolvedValue(buildServiceOrder()),
      findAll: jest.fn(),
      findAverageExecutionTime: jest.fn(),
    };

    useCase = new UpdateServiceOrderUseCase(repository);
  });

  it('deve atualizar vehicleId, mechanicId e approvedAt', async () => {
    const dto: UpdateServiceOrderDto = {
      vehicleId: 'vehicle-2',
      mechanicId: 'mechanic-1',
      approvedAt: '2026-08-22T10:00:00.000Z',
    };

    const os = await useCase.execute('os-1', dto);

    expect(repository.findById).toHaveBeenCalledWith('os-1');
    expect(os.vehicleId).toBe('vehicle-2');
    expect(os.mechanicId).toBe('mechanic-1');
    expect(os.approvedAt).toEqual(new Date('2026-08-22T10:00:00.000Z'));
    expect(repository.save).toHaveBeenCalledWith(os);
  });

  it('deve permitir limpar mechanicId e approvedAt enviando null', async () => {
    const existing = buildServiceOrder();
    existing.update({ mechanicId: 'mechanic-1', approvedAt: new Date() });
    repository.findById.mockResolvedValue(existing);

    const os = await useCase.execute('os-1', { mechanicId: null, approvedAt: null });

    expect(os.mechanicId).toBeNull();
    expect(os.approvedAt).toBeNull();
  });

  it('não deve alterar campos não informados no DTO', async () => {
    const existing = makeServiceOrder({
      mechanicId: 'mechanic-1',
      status: ServiceOrderStatus.AWAITING_EXECUTION,
    });
    repository.findById.mockResolvedValue(existing);

    const os = await useCase.execute('os-1', { vehicleId: 'vehicle-3' });

    expect(os.mechanicId).toBe('mechanic-1');
    expect(os.vehicleId).toBe('vehicle-3');
  });

  it('deve lançar NotFoundError se a OS não existir', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('os-inexistente', { vehicleId: 'vehicle-2' })).rejects.toThrow(
      NotFoundError,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });
});

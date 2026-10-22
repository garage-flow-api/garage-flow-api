import { StartServiceUseCase } from '@service-orders/application/use-cases/start-service.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { DomainError, NotFoundError } from '@common/errors/domain.error';
import { makeServiceOrder } from '../service-order.factory';

describe('StartServiceUseCase', () => {
  const makeOrder = (mechanicId: string | null) =>
    makeServiceOrder({
      vehicleId: 'vehicle-1',
      description: 'Falha no motor',
      mechanicId,
      status: ServiceOrderStatus.AWAITING_EXECUTION,
      approvedAt: new Date(),
      totalAmount: 100,
    });

  it('inicia a execução para o mecânico atribuído', async () => {
    const order = makeOrder('mechanic-1');
    const repository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn().mockResolvedValue(order),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    await new StartServiceUseCase(repository).execute(order.id, 'mechanic-1');

    expect(order.status).toBe(ServiceOrderStatus.IN_EXECUTION);
    expect(order.serviceStartedAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(order);
  });

  it('rejeita mecânico não atribuído', async () => {
    const order = makeOrder('mechanic-1');
    const repository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    await expect(
      new StartServiceUseCase(repository).execute(order.id, 'mechanic-2'),
    ).rejects.toThrow(DomainError);
  });

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    await expect(
      new StartServiceUseCase(repository).execute('missing-order', 'mechanic-1'),
    ).rejects.toThrow(NotFoundError);
  });
});

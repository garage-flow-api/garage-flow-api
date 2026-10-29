import { StartServiceUseCase } from '@service-orders/application/use-cases/start-service.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { DomainError, NotFoundError } from '@common/errors/domain.error';
import { makeServiceOrder } from '../service-order.factory';

describe('StartServiceUseCase', () => {
  const makeNotify = () => ({ execute: jest.fn().mockResolvedValue(undefined) });

  const makeOrder = (mechanicId: string | null) =>
    makeServiceOrder({
      vehicleId: 'vehicle-1',
      description: 'Falha no motor',
      mechanicId,
      status: ServiceOrderStatus.AWAITING_EXECUTION,
      approvedAt: new Date(),
      totalAmount: 100,
    });

  it('inicia a execução para o mecânico atribuído e notifica o cliente', async () => {
    const order = makeOrder('mechanic-1');
    const repository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn().mockResolvedValue(order),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await new StartServiceUseCase(
      repository,
      notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
    ).execute(order.id, 'mechanic-1');

    expect(order.status).toBe(ServiceOrderStatus.IN_EXECUTION);
    expect(order.serviceStartedAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(order);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(order);
  });

  it('rejeita mecânico não atribuído', async () => {
    const order = makeOrder('mechanic-1');
    const repository = {
      findById: jest.fn().mockResolvedValue(order),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new StartServiceUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute(order.id, 'mechanic-2'),
    ).rejects.toThrow(DomainError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new StartServiceUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute('missing-order', 'mechanic-1'),
    ).rejects.toThrow(NotFoundError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });
});

import { NotFoundError } from '@common/errors/domain.error';

import { DeliverServiceOrderUseCase } from '@service-orders/application/use-cases/deliver-service-order.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { makeServiceOrder } from '../service-order.factory';

describe('DeliverServiceOrderUseCase', () => {
  const makeNotify = () => ({ execute: jest.fn().mockResolvedValue(undefined) });

  it('entrega a OS finalizada, salva e notifica o cliente', async () => {
    const serviceOrder = makeServiceOrder({ status: ServiceOrderStatus.FINISHED });
    const repository = {
      findById: jest.fn().mockResolvedValue(serviceOrder),
      save: jest.fn().mockResolvedValue(serviceOrder),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    const result = await new DeliverServiceOrderUseCase(
      repository,
      notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
    ).execute(serviceOrder.id);

    expect(result.status).toBe(ServiceOrderStatus.DELIVERED);
    expect(repository.save).toHaveBeenCalledWith(serviceOrder);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(serviceOrder);
  });

  it('não entrega uma OS que ainda não foi finalizada', async () => {
    const serviceOrder = makeServiceOrder({ status: ServiceOrderStatus.IN_EXECUTION });
    const repository = {
      findById: jest.fn().mockResolvedValue(serviceOrder),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new DeliverServiceOrderUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute(serviceOrder.id),
    ).rejects.toThrow();
    expect(repository.save).not.toHaveBeenCalled();
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new DeliverServiceOrderUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute('missing-order'),
    ).rejects.toThrow(NotFoundError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });
});

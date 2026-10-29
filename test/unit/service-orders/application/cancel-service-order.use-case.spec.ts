import { NotFoundError } from '@common/errors/domain.error';

import { CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { makeServiceOrder } from '../service-order.factory';

describe('CancelServiceOrderUseCase', () => {
  const makeNotify = () => ({ execute: jest.fn().mockResolvedValue(undefined) });

  it.each([
    ServiceOrderStatus.RECEIVED,
    ServiceOrderStatus.IN_DIAGNOSIS,
    ServiceOrderStatus.FINISHED_DIAGNOSIS,
    ServiceOrderStatus.AWAITING_APPROVAL,
    ServiceOrderStatus.AWAITING_EXECUTION,
    ServiceOrderStatus.IN_EXECUTION,
  ])('cancela a OS no status %s e notifica o cliente', async (status) => {
    const serviceOrder = makeServiceOrder({ status });
    const repository = {
      findById: jest.fn().mockResolvedValue(serviceOrder),
      save: jest.fn().mockResolvedValue(serviceOrder),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    const result = await new CancelServiceOrderUseCase(
      repository,
      notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
    ).execute(serviceOrder.id);

    expect(result.status).toBe(ServiceOrderStatus.CANCELED);
    expect(repository.save).toHaveBeenCalledWith(serviceOrder);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(serviceOrder);
  });

  it.each([ServiceOrderStatus.FINISHED, ServiceOrderStatus.DELIVERED])(
    'não permite cancelar uma OS no status %s',
    async (status) => {
      const serviceOrder = makeServiceOrder({ status });
      const repository = {
        findById: jest.fn().mockResolvedValue(serviceOrder),
        save: jest.fn(),
      } as unknown as jest.Mocked<ServiceOrderRepository>;
      const notifyStatusChange = makeNotify();

      await expect(
        new CancelServiceOrderUseCase(
          repository,
          notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
        ).execute(serviceOrder.id),
      ).rejects.toThrow();
      expect(repository.save).not.toHaveBeenCalled();
      expect(notifyStatusChange.execute).not.toHaveBeenCalled();
    },
  );

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new CancelServiceOrderUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute('missing-order'),
    ).rejects.toThrow(NotFoundError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });
});

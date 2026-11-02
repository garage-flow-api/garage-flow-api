import { NotFoundError } from '@common/errors/domain.error';

import { ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { makeServiceOrder } from '../service-order.factory';

describe('ApproveServiceOrderBudgetUseCase', () => {
  const makeNotify = () => ({ execute: jest.fn().mockResolvedValue(undefined) });

  it('aprova o orçamento, salva a OS e notifica o cliente', async () => {
    const serviceOrder = makeServiceOrder({ status: ServiceOrderStatus.AWAITING_APPROVAL });
    const repository = {
      findById: jest.fn().mockResolvedValue(serviceOrder),
      save: jest.fn().mockResolvedValue(serviceOrder),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    const result = await new ApproveServiceOrderBudgetUseCase(
      repository,
      notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
    ).execute(serviceOrder.id);

    expect(result.status).toBe(ServiceOrderStatus.AWAITING_EXECUTION);
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(serviceOrder);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(serviceOrder);
  });

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;
    const notifyStatusChange = makeNotify();

    await expect(
      new ApproveServiceOrderBudgetUseCase(
        repository,
        notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
      ).execute('missing-order'),
    ).rejects.toThrow(NotFoundError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });
});

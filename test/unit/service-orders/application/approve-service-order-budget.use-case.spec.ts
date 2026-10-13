import { NotFoundError } from '@common/errors/domain.error';

import { ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { makeServiceOrder } from '../service-order.factory';

describe('ApproveServiceOrderBudgetUseCase', () => {
  it('aprova o orçamento e salva a OS', async () => {
    const serviceOrder = makeServiceOrder({ status: ServiceOrderStatus.AWAITING_APPROVAL });
    const repository = {
      findById: jest.fn().mockResolvedValue(serviceOrder),
      save: jest.fn().mockResolvedValue(serviceOrder),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    const result = await new ApproveServiceOrderBudgetUseCase(repository).execute(serviceOrder.id);

    expect(result.status).toBe(ServiceOrderStatus.AWAITING_EXECUTION);
    expect(result.approvedAt).toBeInstanceOf(Date);
    expect(repository.save).toHaveBeenCalledWith(serviceOrder);
  });

  it('retorna erro quando a OS não existe', async () => {
    const repository = {
      findById: jest.fn().mockResolvedValue(null),
      save: jest.fn(),
    } as unknown as jest.Mocked<ServiceOrderRepository>;

    await expect(
      new ApproveServiceOrderBudgetUseCase(repository).execute('missing-order'),
    ).rejects.toThrow(NotFoundError);
  });
});

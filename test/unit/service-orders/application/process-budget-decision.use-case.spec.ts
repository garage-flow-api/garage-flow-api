import { ProcessBudgetDecisionUseCase } from '@service-orders/application/use-cases/process-budget-decision.use-case';
import { type FindServiceOrderByIdUseCase } from '@service-orders/application/use-cases/find-service-order-by-id.use-case';
import { type ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { type CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';
import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { BudgetDecision } from '@service-orders/domain/value-objects/budget-decision.vo';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';

describe('ProcessBudgetDecisionUseCase', () => {
  const find = { execute: jest.fn() };
  const approve = { execute: jest.fn() };
  const cancel = { execute: jest.fn() };
  let useCase: ProcessBudgetDecisionUseCase;

  const givenStatus = (status: ServiceOrderStatus) =>
    find.execute.mockResolvedValue({ status } as ServiceOrder);

  beforeEach(() => {
    jest.resetAllMocks();
    useCase = new ProcessBudgetDecisionUseCase(
      find as unknown as FindServiceOrderByIdUseCase,
      approve as unknown as ApproveServiceOrderBudgetUseCase,
      cancel as unknown as CancelServiceOrderUseCase,
    );
  });

  it('aprova a OS que aguarda aprovação', async () => {
    givenStatus(ServiceOrderStatus.AWAITING_APPROVAL);

    const result = await useCase.execute('id', BudgetDecision.APPROVED);

    expect(result).toEqual({ processed: true });
    expect(approve.execute).toHaveBeenCalledWith('id');
    expect(cancel.execute).not.toHaveBeenCalled();
  });

  it('cancela a OS que aguarda aprovação quando a decisão é recusa', async () => {
    givenStatus(ServiceOrderStatus.AWAITING_APPROVAL);

    const result = await useCase.execute('id', BudgetDecision.REJECTED);

    expect(result).toEqual({ processed: true });
    expect(cancel.execute).toHaveBeenCalledWith('id');
    expect(approve.execute).not.toHaveBeenCalled();
  });

  it.each([
    ServiceOrderStatus.AWAITING_EXECUTION,
    ServiceOrderStatus.CANCELED,
    ServiceOrderStatus.RECEIVED,
  ])('ignora a decisão quando a OS está em %s', async (status) => {
    givenStatus(status);

    const approved = await useCase.execute('id', BudgetDecision.APPROVED);
    const rejected = await useCase.execute('id', BudgetDecision.REJECTED);

    expect(approved).toEqual({ processed: false });
    expect(rejected).toEqual({ processed: false });
    expect(approve.execute).not.toHaveBeenCalled();
    expect(cancel.execute).not.toHaveBeenCalled();
  });
});

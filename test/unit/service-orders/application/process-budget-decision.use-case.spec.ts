import { ProcessBudgetDecisionUseCase } from '@service-orders/application/use-cases/process-budget-decision.use-case';
import { type FindServiceOrderByIdUseCase } from '@service-orders/application/use-cases/find-service-order-by-id.use-case';
import { type ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { type CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';
import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { BudgetDecision } from '@service-orders/domain/value-objects/budget-decision.vo';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type TransactionRunner } from '@common/application/transaction-runner';

describe('ProcessBudgetDecisionUseCase', () => {
  const repository = { lockForUpdate: jest.fn() };
  const transactionRunner = { run: jest.fn() };
  const find = { execute: jest.fn() };
  const approve = { execute: jest.fn() };
  const cancel = { execute: jest.fn() };
  let useCase: ProcessBudgetDecisionUseCase;

  const givenStatus = (status: ServiceOrderStatus) =>
    find.execute.mockResolvedValue({ status } as ServiceOrder);

  beforeEach(() => {
    jest.resetAllMocks();
    repository.lockForUpdate.mockResolvedValue(undefined);
    transactionRunner.run.mockImplementation((work: () => Promise<unknown>) => work());
    useCase = new ProcessBudgetDecisionUseCase(
      repository as unknown as ServiceOrderRepository,
      transactionRunner as unknown as TransactionRunner,
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

  it('trava a OS dentro da transação antes de ler o status', async () => {
    givenStatus(ServiceOrderStatus.AWAITING_APPROVAL);
    const calls: string[] = [];
    transactionRunner.run.mockImplementation(async (work: () => Promise<unknown>) => {
      calls.push('transaction:start');
      const result = await work();
      calls.push('transaction:end');
      return result;
    });
    repository.lockForUpdate.mockImplementation(async () => {
      calls.push('lock');
    });
    find.execute.mockImplementation(async () => {
      calls.push('find');
      return { status: ServiceOrderStatus.AWAITING_APPROVAL } as ServiceOrder;
    });
    approve.execute.mockImplementation(async () => {
      calls.push('approve');
    });

    await useCase.execute('id', BudgetDecision.APPROVED);

    expect(repository.lockForUpdate).toHaveBeenCalledWith('id');
    expect(calls).toEqual(['transaction:start', 'lock', 'find', 'approve', 'transaction:end']);
  });
});

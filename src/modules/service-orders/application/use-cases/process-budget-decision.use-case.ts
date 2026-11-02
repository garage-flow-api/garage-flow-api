import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@common/application/transaction-runner';
import { BudgetDecision } from '@service-orders/domain/value-objects/budget-decision.vo';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { FindServiceOrderByIdUseCase } from '@service-orders/application/use-cases/find-service-order-by-id.use-case';
import { ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';

export interface BudgetDecisionResult {
  /** false quando a decisão foi ignorada por já ter sido tomada (ou a OS não aguarda mais aprovação). */
  processed: boolean;
}

@Injectable()
export class ProcessBudgetDecisionUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly findServiceOrderById: FindServiceOrderByIdUseCase,
    private readonly approveServiceOrderBudget: ApproveServiceOrderBudgetUseCase,
    private readonly cancelServiceOrder: CancelServiceOrderUseCase,
  ) {}

  async execute(serviceOrderId: string, decision: BudgetDecision): Promise<BudgetDecisionResult> {
    return this.transactionRunner.run(async () => {
      await this.serviceOrderRepository.lockForUpdate(serviceOrderId);

      const serviceOrder = await this.findServiceOrderById.execute(serviceOrderId);

      // A primeira decisão vale - repetições e decisões conflitantes são ignoradas.
      if (serviceOrder.status !== ServiceOrderStatus.AWAITING_APPROVAL) {
        return { processed: false };
      }

      if (decision === BudgetDecision.APPROVED) {
        await this.approveServiceOrderBudget.execute(serviceOrderId);
      } else {
        await this.cancelServiceOrder.execute(serviceOrderId);
      }
      return { processed: true };
    });
  }
}

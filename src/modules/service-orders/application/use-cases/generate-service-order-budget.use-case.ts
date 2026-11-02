import { BusinessRuleError, NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import {
  BuildServiceOrderBudgetUseCase,
  type ServiceOrderBudget,
} from '@service-orders/application/use-cases/build-service-order-budget.use-case';
import { NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';

export type {
  ServiceOrderBudget,
  ServiceOrderBudgetLineItem,
} from '@service-orders/application/use-cases/build-service-order-budget.use-case';

@Injectable()
export class GenerateServiceOrderBudgetUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly buildBudget: BuildServiceOrderBudgetUseCase,
    private readonly notifyStatusChange: NotifyServiceOrderStatusChangeUseCase,
  ) {}

  async execute(id: string): Promise<ServiceOrderBudget> {
    const serviceOrder = await this.findServiceOrderWithBudgetAccess(id);
    const budget = await this.buildBudget.execute(serviceOrder); // valida serviços e peças antes de salvar
    await this.submitForApprovalIfDiagnosisFinished(serviceOrder);
    return { ...budget, status: serviceOrder.status };
  }

  private async findServiceOrderWithBudgetAccess(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');

    if (!serviceOrder.canAccessBudget()) {
      throw new BusinessRuleError(
        'Service orders with RECEIVED or IN_DIAGNOSIS status cannot access a budget',
      );
    }
    if (serviceOrder.serviceItems.length === 0 && serviceOrder.partItems.length === 0) {
      throw new BusinessRuleError(
        'Cannot generate a budget for a service order without services or parts',
      );
    }
    return serviceOrder;
  }

  private async submitForApprovalIfDiagnosisFinished(serviceOrder: ServiceOrder): Promise<void> {
    if (serviceOrder.status !== ServiceOrderStatus.FINISHED_DIAGNOSIS) return;

    serviceOrder.submitBudgetForApproval();
    await this.serviceOrderRepository.save(serviceOrder);
    await this.notifyStatusChange.execute(serviceOrder); // só na transição, não a cada GET
  }
}

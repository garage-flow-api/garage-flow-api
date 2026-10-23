import { Injectable } from '@nestjs/common';
import {
  ServiceOrderListItem,
  ServiceOrderRepository,
} from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import {
  PRIORITY_LIST_EXCLUDED_STATUSES,
  SERVICE_ORDER_PRIORITY,
} from '@service-orders/domain/value-objects/service-order-priority.vo';

@Injectable()
export class FindAllServiceOrdersUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  /**
   * Sem filtro de status: só OS em aberto, por prioridade do status e dentro dela,
   * da mais antiga para a mais nova.
   */
  async execute(status?: ServiceOrderStatus, mechanicId?: string): Promise<ServiceOrderListItem[]> {
    const excludedStatuses = status ? [] : PRIORITY_LIST_EXCLUDED_STATUSES;
    const serviceOrders = await this.serviceOrderRepository.findAll(
      status,
      mechanicId,
      excludedStatuses,
    );

    // O repositório devolve da mais antiga para a mais nova.
    return [...serviceOrders].sort(
      (a, b) => SERVICE_ORDER_PRIORITY[a.status] - SERVICE_ORDER_PRIORITY[b.status],
    );
  }
}

import { ServiceOrderStatus } from './service-order-status.vo';

/**
 * Prioridade na listagem da oficina: quanto menor o número, mais ao topo.
 */
export const SERVICE_ORDER_PRIORITY: Record<ServiceOrderStatus, number> = {
  [ServiceOrderStatus.IN_EXECUTION]: 1,
  [ServiceOrderStatus.AWAITING_EXECUTION]: 1,
  [ServiceOrderStatus.AWAITING_APPROVAL]: 2,
  [ServiceOrderStatus.IN_DIAGNOSIS]: 3,
  [ServiceOrderStatus.FINISHED_DIAGNOSIS]: 3,
  [ServiceOrderStatus.RECEIVED]: 4,
  [ServiceOrderStatus.FINISHED]: 5,
  [ServiceOrderStatus.DELIVERED]: 5,
  [ServiceOrderStatus.CANCELED]: 5,
};

/** OS encerradas: ficam fora da listagem priorizada. */
export const PRIORITY_LIST_EXCLUDED_STATUSES: ServiceOrderStatus[] = [
  ServiceOrderStatus.FINISHED,
  ServiceOrderStatus.DELIVERED,
  ServiceOrderStatus.CANCELED,
];

import { ServiceOrderStatus } from './service-order-status.vo';

/**
 * Status que o cliente enxerga. O banco continua com o status interno.
 * A tradução acontece só na resposta das consultas públicas.
 */
export enum PublicServiceOrderStatus {
  RECEIVED = 'Recebida',
  DIAGNOSIS = 'Diagnóstico',
  AWAITING_APPROVAL = 'Aguardando aprovação',
  EXECUTION = 'Execução',
  FINISHED = 'Finalizada',
  DELIVERED = 'Entregue',
  CANCELED = 'Cancelada',
}

const PUBLIC_STATUS_BY_INTERNAL_STATUS: Record<ServiceOrderStatus, PublicServiceOrderStatus> = {
  [ServiceOrderStatus.RECEIVED]: PublicServiceOrderStatus.RECEIVED,
  [ServiceOrderStatus.IN_DIAGNOSIS]: PublicServiceOrderStatus.DIAGNOSIS,
  [ServiceOrderStatus.FINISHED_DIAGNOSIS]: PublicServiceOrderStatus.DIAGNOSIS,
  [ServiceOrderStatus.AWAITING_APPROVAL]: PublicServiceOrderStatus.AWAITING_APPROVAL,
  [ServiceOrderStatus.AWAITING_EXECUTION]: PublicServiceOrderStatus.EXECUTION,
  [ServiceOrderStatus.IN_EXECUTION]: PublicServiceOrderStatus.EXECUTION,
  [ServiceOrderStatus.FINISHED]: PublicServiceOrderStatus.FINISHED,
  [ServiceOrderStatus.DELIVERED]: PublicServiceOrderStatus.DELIVERED,
  [ServiceOrderStatus.CANCELED]: PublicServiceOrderStatus.CANCELED,
};

export function toPublicStatus(status: ServiceOrderStatus): PublicServiceOrderStatus {
  return PUBLIC_STATUS_BY_INTERNAL_STATUS[status];
}

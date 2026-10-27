import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import {
  PublicServiceOrderStatus,
  toPublicStatus,
} from '@service-orders/domain/value-objects/public-service-order-status.vo';

describe('toPublicStatus', () => {
  it.each([
    [ServiceOrderStatus.RECEIVED, 'Recebida'],
    [ServiceOrderStatus.IN_DIAGNOSIS, 'Diagnóstico'],
    [ServiceOrderStatus.FINISHED_DIAGNOSIS, 'Diagnóstico'],
    [ServiceOrderStatus.AWAITING_APPROVAL, 'Aguardando aprovação'],
    [ServiceOrderStatus.AWAITING_EXECUTION, 'Execução'],
    [ServiceOrderStatus.IN_EXECUTION, 'Execução'],
    [ServiceOrderStatus.FINISHED, 'Finalizada'],
    [ServiceOrderStatus.DELIVERED, 'Entregue'],
    [ServiceOrderStatus.CANCELED, 'Cancelada'],
  ])('traduz %s para "%s"', (internal, expected) => {
    expect(toPublicStatus(internal)).toBe(expected);
  });

  it('nunca devolve um status fora da lista combinada', () => {
    const allowed = Object.values(PublicServiceOrderStatus);

    for (const internal of Object.values(ServiceOrderStatus)) {
      expect(allowed).toContain(toPublicStatus(internal));
    }
  });
});

import { StartDiagnosisUseCase } from '@service-orders/application/use-cases/start-diagnosis.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { DomainError, NotFoundError } from '@common/errors/domain.error';
import { makeServiceOrder } from '../service-order.factory';

describe('StartDiagnosisUseCase', () => {
  const repository = {
    findById: jest.fn(),
    save: jest.fn(),
  } as unknown as jest.Mocked<ServiceOrderRepository>;
  const notifyStatusChange = { execute: jest.fn().mockResolvedValue(undefined) };
  const useCase = new StartDiagnosisUseCase(
    repository,
    notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
  );

  const makeOrder = (status: ServiceOrderStatus) =>
    makeServiceOrder({ vehicleId: 'vehicle-1', description: 'Falha no motor', status });

  beforeEach(() => jest.clearAllMocks());

  it('inicia o diagnostico somente para OS recebida', async () => {
    const order = makeOrder(ServiceOrderStatus.RECEIVED);
    repository.findById.mockResolvedValue(order);
    repository.save.mockResolvedValue(order);

    await useCase.execute(order.id, 'mechanic-1');

    expect(order.status).toBe(ServiceOrderStatus.IN_DIAGNOSIS);
    expect(order.mechanicId).toBe('mechanic-1');
    expect(repository.save).toHaveBeenCalledWith(order);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(order);
  });

  it('recusa OS que ja estao em outro status', async () => {
    const order = makeOrder(ServiceOrderStatus.AWAITING_APPROVAL);
    repository.findById.mockResolvedValue(order);

    await expect(useCase.execute(order.id, 'mechanic-1')).rejects.toThrow(DomainError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('retorna erro quando a OS nao existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('missing-order', 'mechanic-1')).rejects.toThrow(NotFoundError);
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });
});

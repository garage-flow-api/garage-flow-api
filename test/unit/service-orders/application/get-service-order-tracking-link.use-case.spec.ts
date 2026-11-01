import { NotFoundError } from '@common/errors/domain.error';

import { GetServiceOrderTrackingLinkUseCase } from '@service-orders/application/use-cases/get-service-order-tracking-link.use-case';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { resolveTrackingToken } from '@service-orders/infrastructure/security/tracking-token.util';

describe('GetServiceOrderTrackingLinkUseCase', () => {
  let repository: jest.Mocked<ServiceOrderRepository>;
  let useCase: GetServiceOrderTrackingLinkUseCase;

  const baseUrl = 'https://garage-flow.example.com';

  beforeEach(() => {
    process.env.TRACKING_TOKEN_SECRET = 'test-secret';
    repository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findAverageExecutionTime: jest.fn(),
      lockForUpdate: jest.fn(),
    };
    useCase = new GetServiceOrderTrackingLinkUseCase(repository);
  });

  it('deve retornar um link absoluto, a partir do baseUrl informado, que resolve para o id da OS', async () => {
    const os = ServiceOrder.create('vehicle-1', 'Ruído no motor', [], [], 0);
    repository.findById.mockResolvedValue(os);

    const trackingLink = await useCase.execute(baseUrl, os.id);

    expect(trackingLink).toMatch(/^https:\/\/garage-flow\.example\.com\/service-orders\/track\/.+/);
    const token = trackingLink.split('/track/')[1];
    expect(resolveTrackingToken(token)).toBe(os.id);
  });

  it('deve lançar NotFoundError se a OS não existir', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute(baseUrl, 'inexistente')).rejects.toThrow(NotFoundError);
  });
});

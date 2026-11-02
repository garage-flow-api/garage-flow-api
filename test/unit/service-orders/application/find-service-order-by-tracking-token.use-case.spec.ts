import { NotFoundError } from '@common/errors/domain.error';

import { FindServiceOrderByTrackingTokenUseCase } from '@service-orders/application/use-cases/find-service-order-by-tracking-token.use-case';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { generateTrackingToken } from '@service-orders/infrastructure/security/tracking-token.util';

describe('FindServiceOrderByTrackingTokenUseCase', () => {
  let repository: jest.Mocked<ServiceOrderRepository>;
  let useCase: FindServiceOrderByTrackingTokenUseCase;

  beforeEach(() => {
    process.env.TRACKING_TOKEN_SECRET = 'test-secret';
    repository = {
      save: jest.fn(),
      findById: jest.fn(),
      findAll: jest.fn(),
      findAverageExecutionTime: jest.fn(),
      lockForUpdate: jest.fn(),
    };
    useCase = new FindServiceOrderByTrackingTokenUseCase(repository);
  });

  it('deve retornar a OS correspondente ao token', async () => {
    const os = ServiceOrder.create('vehicle-1', 'Ruído no motor', [], [], 0);
    const token = generateTrackingToken(os.id);
    repository.findById.mockResolvedValue(os);

    const result = await useCase.execute(token);

    expect(repository.findById).toHaveBeenCalledWith(os.id);
    expect(result).toBe(os);
  });

  it('deve lançar NotFoundError se o token for inválido', async () => {
    await expect(useCase.execute('not-a-valid-token')).rejects.toThrow(NotFoundError);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('deve lançar NotFoundError se a OS não existir', async () => {
    const token = generateTrackingToken('123e4567-e89b-12d3-a456-426614174000');
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute(token)).rejects.toThrow(NotFoundError);
  });
});

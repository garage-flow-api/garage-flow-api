import { DomainError } from '@common/errors/domain.error';
import { GetAverageExecutionTimeUseCase } from '@service-orders/application/use-cases/get-average-execution-time.use-case';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

describe('GetAverageExecutionTimeUseCase', () => {
  it('calculates and formats the average execution time', async () => {
    const repository = {
      findAverageExecutionTime: jest.fn().mockResolvedValue({
        averageExecutionTimeMinutes: 187,
        completedServiceOrders: 2,
      }),
    } as unknown as ServiceOrderRepository;

    const result = await new GetAverageExecutionTimeUseCase(repository).execute({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
    });

    expect(result).toEqual({
      averageExecutionTimeMinutes: 187,
      averageExecutionTimeFormatted: '3h 7min',
      completedServiceOrders: 2,
    });
    expect(repository.findAverageExecutionTime).toHaveBeenCalledWith(
      new Date('2026-08-01T00:00:00.000Z'),
      new Date('2026-09-01T00:00:00.000Z'),
    );
  });

  it('returns zero metrics when there are no completed service orders', async () => {
    const repository = {
      findAverageExecutionTime: jest.fn().mockResolvedValue({
        averageExecutionTimeMinutes: null,
        completedServiceOrders: 0,
      }),
    } as unknown as ServiceOrderRepository;

    await expect(new GetAverageExecutionTimeUseCase(repository).execute({})).resolves.toEqual({
      averageExecutionTimeMinutes: 0,
      averageExecutionTimeFormatted: '0min',
      completedServiceOrders: 0,
    });
  });

  it('rejects an invalid date range', async () => {
    const repository = {
      findAverageExecutionTime: jest.fn(),
    } as unknown as ServiceOrderRepository;

    await expect(
      new GetAverageExecutionTimeUseCase(repository).execute({
        from: new Date('2026-08-31T00:00:00.000Z'),
        to: new Date('2026-08-01T00:00:00.000Z'),
      }),
    ).rejects.toThrow(DomainError);
    expect(repository.findAverageExecutionTime).not.toHaveBeenCalled();
  });
});

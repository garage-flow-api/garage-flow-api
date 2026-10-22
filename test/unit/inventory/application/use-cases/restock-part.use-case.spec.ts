import { NotFoundError } from '@common/errors/domain.error';

import { RestockPartUseCase } from '@inventory/application/use-cases/restock-part.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../part.factory';

describe('RestockPartUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: RestockPartUseCase;

  beforeEach(() => {
    repository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      findAll: jest.fn(),
      findReservedQuantities: jest.fn(),
      findByIdList: jest.fn(),
      findBelowMinimum: jest.fn(),
    };
    useCase = new RestockPartUseCase(repository);
  });

  it('deve repor o estoque de uma peça existente', async () => {
    const part = makePart({ id: 'part-1', name: 'Óleo', quantity: new Quantity(10) });
    repository.findById.mockResolvedValue(part);

    const result = await useCase.execute('part-1', 5);

    expect(result.quantity.value).toBe(15);
    expect(repository.save).toHaveBeenCalledWith(part);
  });

  it('deve lançar um erro quando a peça não existir', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown', 5)).rejects.toThrow(NotFoundError);
  });
});

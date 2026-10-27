import { NotFoundError } from '@common/errors/domain.error';

import { UpdatePartUseCase } from '@inventory/application/use-cases/update-part.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../part.factory';

describe('UpdatePartUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: UpdatePartUseCase;

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
    useCase = new UpdatePartUseCase(repository);
  });

  it('deve atualizar nome e preço de uma peça existente', async () => {
    const part = makePart({ id: 'part-1', name: 'Óleo', quantity: new Quantity(10) });
    repository.findById.mockResolvedValue(part);

    const result = await useCase.execute('part-1', { name: 'Óleo sintético', unitPrice: 59.9 });

    expect(result.name).toBe('Óleo sintético');
    expect(result.unitPrice).toBe(59.9);
    expect(repository.save).toHaveBeenCalledWith(part);
  });

  it('deve lançar NotFoundError quando a peça não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown', { name: 'X', unitPrice: 10 })).rejects.toThrow(
      NotFoundError,
    );
  });
});

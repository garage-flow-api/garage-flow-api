import { NotFoundError } from '@common/errors/domain.error';

import { DeletePartUseCase } from '@inventory/application/use-cases/delete-part.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../part.factory';

describe('DeletePartUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: DeletePartUseCase;

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
    useCase = new DeletePartUseCase(repository);
  });

  it('deve marcar a peça como excluída e salvar quando ela existe', async () => {
    const part = makePart({ id: 'part-1', name: 'Óleo', quantity: new Quantity(10) });
    repository.findById.mockResolvedValue(part);

    await useCase.execute('part-1');

    expect(part.isDeleted).toBe(true);
    expect(repository.save).toHaveBeenCalledWith(part);
  });

  it('deve lançar NotFoundError quando a peça não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('unknown')).rejects.toThrow(NotFoundError);
  });
});

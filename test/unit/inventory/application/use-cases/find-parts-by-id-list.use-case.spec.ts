import { NotFoundError } from '@common/errors/domain.error';

import { FindPartsByIdListUseCase } from '@inventory/application/use-cases/find-parts-by-id-list.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../part.factory';

describe('FindPartsByIdListUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: FindPartsByIdListUseCase;

  beforeEach(() => {
    repository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByIds: jest.fn(),
      findAll: jest.fn(),
      findByIdList: jest.fn(),
      findBelowMinimum: jest.fn(),
      findReservedQuantities: jest.fn(),
    };
    useCase = new FindPartsByIdListUseCase(repository);
  });

  it('deve retornar as peças pelo id list', async () => {
    const part1 = makePart({
      id: 'id-1',
      name: 'Óleo de motor',
      unitPrice: 45.9,
      quantity: new Quantity(20),
    });
    const part2 = makePart({
      id: 'id-2',
      name: 'Filtro de óleo',
      unitPrice: 30,
      quantity: new Quantity(10),
    });
    repository.findByIdList.mockResolvedValue([part1, part2]);

    const result = await useCase.execute(['id-1', 'id-2']);

    expect(repository.findByIdList).toHaveBeenCalledWith(['id-1', 'id-2']);
    expect(result).toEqual([part1, part2]);
  });

  it('deve lançar NotFoundError quando nenhuma peça for encontrada', async () => {
    repository.findByIdList.mockResolvedValue([]);

    await expect(useCase.execute(['id-1', 'id-2'])).rejects.toThrow(NotFoundError);
  });
});

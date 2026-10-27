import { NotFoundError } from '@common/errors/domain.error';

import { WriteOffPartsUseCase } from '@inventory/application/use-cases/write-off-parts.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../part.factory';

const buildPart = (id: string, quantity: number) =>
  makePart({ id, name: `Peça ${id}`, unitPrice: 10, quantity: new Quantity(quantity) });

describe('WriteOffPartsUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: WriteOffPartsUseCase;

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
    useCase = new WriteOffPartsUseCase(repository);
  });

  it('baixa a quantidade usada de cada peça', async () => {
    const parts = new Map([
      ['p1', buildPart('p1', 10)],
      ['p2', buildPart('p2', 4)],
    ]);
    repository.findById.mockImplementation((id: string) => Promise.resolve(parts.get(id) ?? null));

    const result = await useCase.execute([
      { inventoryId: 'p1', quantity: 3 },
      { inventoryId: 'p2', quantity: 1 },
    ]);

    expect(result[0].quantity.value).toBe(7);
    expect(result[1].quantity.value).toBe(3);
    expect(repository.save).toHaveBeenCalledTimes(2);
  });

  it('deixa o estoque negativo quando falta peça, em vez de bloquear', async () => {
    repository.findById.mockResolvedValue(buildPart('p1', 2));

    const [part] = await useCase.execute([{ inventoryId: 'p1', quantity: 5 }]);

    expect(part.quantity.value).toBe(-3);
    expect(repository.save).toHaveBeenCalledTimes(1);
  });

  it('não consulta nem grava nada quando não há peças', async () => {
    await expect(useCase.execute([])).resolves.toEqual([]);

    expect(repository.findById).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('lança 404 e não grava nenhuma baixa se alguma peça não existir', async () => {
    repository.findById.mockImplementation((id: string) =>
      Promise.resolve(id === 'p1' ? buildPart('p1', 10) : null),
    );

    await expect(
      useCase.execute([
        { inventoryId: 'p1', quantity: 1 },
        { inventoryId: 'sumiu', quantity: 1 },
      ]),
    ).rejects.toThrow(NotFoundError);

    expect(repository.save).not.toHaveBeenCalled();
  });
});

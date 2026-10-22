import { NotFoundError } from '@common/errors/domain.error';

import { CheckPartsAvailabilityUseCase } from '@inventory/application/use-cases/check-parts-availability.use-case';
import { type PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { OPEN_SERVICE_ORDER_STATUSES } from '@service-orders/domain/value-objects/service-order-status.vo';
import { makePart } from '../../part.factory';

const buildPart = (id: string, quantity: number) =>
  makePart({ id, name: `Peça ${id}`, unitPrice: 10, quantity: new Quantity(quantity) });

describe('CheckPartsAvailabilityUseCase', () => {
  let repository: jest.Mocked<PartRepository>;
  let useCase: CheckPartsAvailabilityUseCase;

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
    repository.findReservedQuantities.mockResolvedValue(new Map());
    useCase = new CheckPartsAvailabilityUseCase(repository);
  });

  it('consulta em lote: duas queries independente da quantidade de peças', async () => {
    repository.findByIds.mockResolvedValue([
      buildPart('p1', 10),
      buildPart('p2', 10),
      buildPart('p3', 10),
    ]);

    await useCase.execute([
      { inventoryId: 'p1', quantity: 1 },
      { inventoryId: 'p2', quantity: 1 },
      { inventoryId: 'p3', quantity: 1 },
    ]);

    expect(repository.findByIds).toHaveBeenCalledTimes(1);
    expect(repository.findReservedQuantities).toHaveBeenCalledTimes(1);
    expect(repository.findById).not.toHaveBeenCalled();
  });

  it('escopa a consulta de reserva apenas às peças pedidas e às OS em aberto', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 10)]);

    await useCase.execute([{ inventoryId: 'p1', quantity: 1 }]);

    expect(repository.findReservedQuantities).toHaveBeenCalledWith(OPEN_SERVICE_ORDER_STATUSES, [
      'p1',
    ]);
  });

  it('aprova quando o estoque lógico cobre o pedido', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 10)]);
    repository.findReservedQuantities.mockResolvedValue(new Map([['p1', 5]]));

    const [availability] = await useCase.execute([{ inventoryId: 'p1', quantity: 5 }]);

    expect(availability.stockLevel.availableQuantity).toBe(5);
    expect(availability.requestedQuantity).toBe(5);
    expect(availability.isAvailable).toBe(true);
  });

  it('reprova quando o físico cobre mas a reserva de outra OS não deixa', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 10)]);
    repository.findReservedQuantities.mockResolvedValue(new Map([['p1', 9]]));

    const [availability] = await useCase.execute([{ inventoryId: 'p1', quantity: 2 }]);

    expect(availability.stockLevel.availableQuantity).toBe(1);
    expect(availability.isAvailable).toBe(false);
  });

  it('soma linhas repetidas da mesma peça antes de comparar', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 4)]);

    const result = await useCase.execute([
      { inventoryId: 'p1', quantity: 2 },
      { inventoryId: 'p1', quantity: 3 },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0].requestedQuantity).toBe(5);
    expect(result[0].isAvailable).toBe(false);
    expect(repository.findByIds).toHaveBeenCalledWith(['p1']);
  });

  it('trata peça sem reserva como reserva zero', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 4)]);
    repository.findReservedQuantities.mockResolvedValue(new Map([['outra', 99]]));

    const [availability] = await useCase.execute([{ inventoryId: 'p1', quantity: 4 }]);

    expect(availability.stockLevel.reservedQuantity).toBe(0);
    expect(availability.isAvailable).toBe(true);
  });

  it('lança 404 quando alguma peça pedida não existe', async () => {
    repository.findByIds.mockResolvedValue([buildPart('p1', 10)]);

    await expect(
      useCase.execute([
        { inventoryId: 'p1', quantity: 1 },
        { inventoryId: 'sumiu', quantity: 1 },
      ]),
    ).rejects.toThrow(NotFoundError);
  });

  it('não consulta nada quando não há peças pedidas', async () => {
    await expect(useCase.execute([])).resolves.toEqual([]);

    expect(repository.findByIds).not.toHaveBeenCalled();
    expect(repository.findReservedQuantities).not.toHaveBeenCalled();
  });
});

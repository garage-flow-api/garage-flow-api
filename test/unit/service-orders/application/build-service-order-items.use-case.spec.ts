import { BusinessRuleError, DomainError, NotFoundError } from '@common/errors/domain.error';
import { BuildServiceOrderItemsUseCase } from '@service-orders/application/use-cases/build-service-order-items.use-case';
import {
  type CheckPartsAvailabilityUseCase,
  type PartAvailability,
} from '@inventory/application/use-cases/check-parts-availability.use-case';
import { StockLevel } from '@inventory/domain/value-objects/stock-level.vo';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { type FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';
import { makePart } from '../../inventory/part.factory';

describe('BuildServiceOrderItemsUseCase', () => {
  let checkPartsAvailability: { execute: jest.Mock };
  let findServicesByIdList: { execute: jest.Mock };
  let useCase: BuildServiceOrderItemsUseCase;

  const service = { id: 'service-1', price: { getValue: () => 100 } };

  /** Disponibilidade da peça: `physical` na prateleira, `reserved` já comprometido com OS em aberto. */
  const buildAvailability = (physical: number, reserved = 0, requested = 2): PartAvailability => {
    const stockLevel = new StockLevel(
      makePart({
        id: 'part-1',
        name: 'Óleo',
        unitPrice: 30,
        quantity: new Quantity(physical),
        minQuantity: new Quantity(0),
      }),
      reserved,
    );
    return {
      stockLevel,
      requestedQuantity: requested,
      isAvailable: requested <= stockLevel.availableQuantity,
    };
  };

  const buildInput = () => ({
    services: [{ serviceId: 'service-1' }],
    parts: [{ inventoryId: 'part-1', quantity: 2 }],
  });

  beforeEach(() => {
    findServicesByIdList = { execute: jest.fn().mockResolvedValue([service]) };
    checkPartsAvailability = { execute: jest.fn().mockResolvedValue([buildAvailability(10)]) };

    useCase = new BuildServiceOrderItemsUseCase(
      checkPartsAvailability as unknown as CheckPartsAvailabilityUseCase,
      findServicesByIdList as unknown as FindServicesByIdListUseCase,
    );
  });

  it('deve montar os itens de serviço e de peça a partir do que foi pedido', async () => {
    const { serviceItems, partItems } = await useCase.execute(buildInput());

    expect(serviceItems).toHaveLength(1);
    expect(serviceItems[0].serviceId).toBe('service-1');
    expect(serviceItems[0].price).toBe(100);
    expect(partItems).toHaveLength(1);
    expect(partItems[0].inventoryId).toBe('part-1');
    expect(partItems[0].quantity).toBe(2);
    expect(partItems[0].unitPrice).toBe(30);
  });

  it('deve devolver listas vazias quando nada foi informado', async () => {
    checkPartsAvailability.execute.mockResolvedValue([]);

    const result = await useCase.execute({});

    expect(result).toEqual({ serviceItems: [], partItems: [] });
  });

  it('não deve consultar serviços quando não há serviços informados', async () => {
    await useCase.execute({ services: [], parts: [{ inventoryId: 'part-1', quantity: 2 }] });

    expect(findServicesByIdList.execute).not.toHaveBeenCalled();
  });

  it('deve rejeitar a mesma peça repetida na entrada', async () => {
    const input = {
      parts: [
        { inventoryId: 'part-1', quantity: 1 },
        { inventoryId: 'part-1', quantity: 2 },
      ],
    };

    await expect(useCase.execute(input)).rejects.toThrow(DomainError);
    expect(checkPartsAvailability.execute).not.toHaveBeenCalled();
    expect(findServicesByIdList.execute).not.toHaveBeenCalled();
  });

  it('deve lançar BusinessRuleError se a quantidade de peça for maior que a disponível', async () => {
    checkPartsAvailability.execute.mockResolvedValue([buildAvailability(1)]); // pediu 2, só tem 1

    await expect(useCase.execute(buildInput())).rejects.toThrow(BusinessRuleError);
  });

  it('deve barrar quando o estoque físico cobre mas outra OS já reservou a peça', async () => {
    // 10 na prateleira, 9 comprometidos com OS em aberto -> só 1 realmente livre
    checkPartsAvailability.execute.mockResolvedValue([buildAvailability(10, 9)]);

    await expect(useCase.execute(buildInput())).rejects.toThrow(BusinessRuleError);
  });

  it('deve aceitar quando o estoque lógico ainda cobre o pedido', async () => {
    // 10 na prateleira, 5 reservados -> 5 livres, pedido de 2 passa
    checkPartsAvailability.execute.mockResolvedValue([buildAvailability(10, 5)]);

    await expect(useCase.execute(buildInput())).resolves.toBeDefined();
  });

  it('deve lançar NotFoundError se a peça pedida não vier na disponibilidade', async () => {
    const input = { parts: [{ inventoryId: 'part-inexistente', quantity: 1 }] };

    await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
  });

  it('deve propagar NotFoundError se o serviço não existir', async () => {
    findServicesByIdList.execute.mockRejectedValue(new NotFoundError('Serviço não encontrado'));

    await expect(useCase.execute(buildInput())).rejects.toThrow(NotFoundError);
  });

  it('deve propagar NotFoundError se a peça não existir', async () => {
    checkPartsAvailability.execute.mockRejectedValue(new NotFoundError('Peça não encontrada'));

    await expect(useCase.execute(buildInput())).rejects.toThrow(NotFoundError);
  });
});

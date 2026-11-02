import { BusinessRuleError, DomainError, NotFoundError } from '@common/errors/domain.error';
import { AddServicesAndPartsUseCase } from '@service-orders/application/use-cases/add-services-and-parts.use-case';
import { BuildServiceOrderItemsUseCase } from '@service-orders/application/use-cases/build-service-order-items.use-case';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { type AddServicesAndPartsDto } from '@service-orders/presentation/dtos/add-services-and-parts.dto';
import {
  type CheckPartsAvailabilityUseCase,
  type PartAvailability,
} from '@inventory/application/use-cases/check-parts-availability.use-case';
import { StockLevel } from '@inventory/domain/value-objects/stock-level.vo';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { makePart } from '../../inventory/part.factory';
import { type FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';
import { type CalculateTotalAmountUseCase } from '@service-orders/application/use-cases/calculate-total-amount.use-case';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';

describe('AddServicesAndPartsUseCase', () => {
  let repository: jest.Mocked<ServiceOrderRepository>;
  let checkPartsAvailability: { execute: jest.Mock };
  let findServicesByIdList: { execute: jest.Mock };
  let calculateTotalAmount: { execute: jest.Mock };
  let useCase: AddServicesAndPartsUseCase;

  const service = { id: 'service-1', price: { getValue: () => 100 } };

  /** Disponibilidade da peça: `physical` na prateleira, `reserved` já comprometido com OS em aberto. */
  const buildAvailability = (
    physical: number,
    reserved = 0,
    requested = 2,
    minQuantity = 0,
  ): PartAvailability => {
    const stockLevel = new StockLevel(
      makePart({
        id: 'part-1',
        name: 'Óleo',
        unitPrice: 30,
        quantity: new Quantity(physical),
        minQuantity: new Quantity(minQuantity),
      }),
      reserved,
    );
    return {
      stockLevel,
      requestedQuantity: requested,
      isAvailable: requested <= stockLevel.availableQuantity,
    };
  };

  const buildServiceOrder = () => {
    const serviceOrder = ServiceOrder.create('vehicle-1', 'Ruído no motor', [], [], 0);
    serviceOrder.update({ mechanicId: 'mechanic-1' });
    serviceOrder.updateStatus(ServiceOrderStatus.IN_DIAGNOSIS);
    return serviceOrder;
  };

  beforeEach(() => {
    repository = {
      save: jest.fn((serviceOrder) => Promise.resolve(serviceOrder)),
      findById: jest.fn().mockResolvedValue(buildServiceOrder()),
      findAll: jest.fn(),
      findAverageExecutionTime: jest.fn(),
      lockForUpdate: jest.fn(),
    };
    findServicesByIdList = { execute: jest.fn().mockResolvedValue([service]) };
    checkPartsAvailability = { execute: jest.fn().mockResolvedValue([buildAvailability(10)]) };
    calculateTotalAmount = { execute: jest.fn().mockResolvedValue(160) };

    // A montagem dos itens é testada em build-service-order-items.use-case.spec.ts;
    // aqui usamos a implementação real com os mesmos mocks, para validar a integração.
    const buildServiceOrderItems = new BuildServiceOrderItemsUseCase(
      checkPartsAvailability as unknown as CheckPartsAvailabilityUseCase,
      findServicesByIdList as unknown as FindServicesByIdListUseCase,
    );

    useCase = new AddServicesAndPartsUseCase(
      repository,
      buildServiceOrderItems,
      checkPartsAvailability as unknown as CheckPartsAvailabilityUseCase,
      calculateTotalAmount as unknown as CalculateTotalAmountUseCase,
    );
  });

  const buildDto = (): AddServicesAndPartsDto => ({
    services: [{ serviceId: 'service-1' }],
    parts: [{ inventoryId: 'part-1', quantity: 2 }],
  });

  it('deve adicionar serviços e peças à OS e recalcular o valor total', async () => {
    const { serviceOrder: os } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

    expect(repository.findById).toHaveBeenCalledWith('os-1');
    expect(os.serviceItems).toHaveLength(1);
    expect(os.serviceItems[0].serviceId).toBe('service-1');
    expect(os.partItems).toHaveLength(1);
    expect(os.partItems[0].inventoryId).toBe('part-1');
    expect(calculateTotalAmount.execute).toHaveBeenCalledWith(os.serviceItems, os.partItems);
    expect(os.totalAmount).toBe(160);
    expect(repository.save).toHaveBeenCalledWith(os);
  });

  it('deve mover a OS para FINISHED_DIAGNOSIS após adicionar serviços e peças', async () => {
    const { serviceOrder: os } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

    expect(os.status).toBe(ServiceOrderStatus.FINISHED_DIAGNOSIS);
  });

  it('deve preservar os itens já existentes na OS ao adicionar novos', async () => {
    const existingServiceOrder = buildServiceOrder();
    existingServiceOrder.addServicesAndParts([ServiceItem.create('service-existing', 50)], [], 50);
    repository.findById.mockResolvedValue(existingServiceOrder);

    const { serviceOrder: os } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

    expect(os.serviceItems.map((item) => item.serviceId)).toEqual([
      'service-existing',
      'service-1',
    ]);
  });

  it('deve lançar NotFoundError se a OS não existir', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('os-inexistente', buildDto(), 'mechanic-1')).rejects.toThrow(
      NotFoundError,
    );
  });

  it('deve rejeitar a mesma peça repetida sem consultar a OS nem o estoque', async () => {
    const dto = {
      services: [],
      parts: [
        { inventoryId: 'part-1', quantity: 1 },
        { inventoryId: 'part-1', quantity: 2 },
      ],
    };

    await expect(useCase.execute('os-1', dto, 'mechanic-1')).rejects.toThrow(DomainError);
    expect(repository.findById).not.toHaveBeenCalled();
    expect(checkPartsAvailability.execute).not.toHaveBeenCalled();
  });

  it('deve lançar DomainError se a OS não estiver em diagnóstico', async () => {
    const serviceOrder = ServiceOrder.create('vehicle-1', 'Ruído no motor', [], [], 0);
    serviceOrder.update({ mechanicId: 'mechanic-1' });
    repository.findById.mockResolvedValue(serviceOrder);

    await expect(useCase.execute('os-1', buildDto(), 'mechanic-1')).rejects.toThrow(DomainError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('deve lançar DomainError ao tentar adicionar itens novamente após a OS já estar em FINISHED_DIAGNOSIS', async () => {
    const serviceOrder = buildServiceOrder();
    serviceOrder.updateStatus(ServiceOrderStatus.FINISHED_DIAGNOSIS);
    repository.findById.mockResolvedValue(serviceOrder);

    await expect(useCase.execute('os-1', buildDto(), 'mechanic-1')).rejects.toThrow(DomainError);
    expect(repository.save).not.toHaveBeenCalled();
  });

  it('não deve salvar a OS se a quantidade de peça for maior que a disponível', async () => {
    checkPartsAvailability.execute.mockResolvedValue([buildAvailability(1)]); // pediu 2, só tem 1

    await expect(useCase.execute('os-1', buildDto(), 'mechanic-1')).rejects.toThrow(
      BusinessRuleError,
    );
    expect(repository.save).not.toHaveBeenCalled();
  });

  describe('alerta de estoque mínimo', () => {
    /** 1ª chamada valida a disponibilidade; a 2ª, depois do save, monta o alerta. */
    const mockAvailability = (availability: PartAvailability) =>
      checkPartsAvailability.execute.mockResolvedValue([availability]);

    it('acusa a peça cujo estoque lógico ficou abaixo do mínimo', async () => {
      mockAvailability(buildAvailability(20, 18, 2, 10));

      const { stockAlerts } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

      expect(stockAlerts).toHaveLength(1);
      expect(stockAlerts[0].part.id).toBe('part-1');
      expect(stockAlerts[0].availableQuantity).toBe(2);
      expect(stockAlerts[0].part.minQuantity.value).toBe(10);
    });

    it('não acusa nada quando o estoque lógico cobre o mínimo', async () => {
      mockAvailability(buildAvailability(100, 0, 2, 5));

      const { stockAlerts } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

      expect(stockAlerts).toEqual([]);
    });

    it('usa o estoque lógico, e não o físico, para decidir o alerta', async () => {
      mockAvailability(buildAvailability(20, 18, 2, 10));

      const { stockAlerts } = await useCase.execute('os-1', buildDto(), 'mechanic-1');

      expect(stockAlerts[0].part.isBelowMinimum()).toBe(false);
      expect(stockAlerts[0].isBelowMinimum()).toBe(true);
    });

    it('monta o alerta só depois de salvar a OS', async () => {
      const order: string[] = [];
      repository.save.mockImplementation((serviceOrder) => {
        order.push('save');
        return Promise.resolve(serviceOrder);
      });
      checkPartsAvailability.execute.mockImplementation(() => {
        order.push('stock');
        return Promise.resolve([buildAvailability(100, 0, 2, 5)]);
      });

      await useCase.execute('os-1', buildDto(), 'mechanic-1');

      expect(order).toEqual(['stock', 'save', 'stock']);
    });

    it('consulta o estoque antes e depois de salvar para montar o alerta', async () => {
      await useCase.execute(
        'os-1',
        {
          services: [],
          parts: [{ inventoryId: 'part-1', quantity: 2 }],
        },
        'mechanic-1',
      );

      expect(checkPartsAvailability.execute).toHaveBeenCalledTimes(2);
    });
  });
});

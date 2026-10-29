import { BusinessRuleError, NotFoundError } from '@common/errors/domain.error';
import { type TransactionRunner } from '@common/application/transaction-runner';
import { type EnsureClientUseCase } from '@client/application/use-cases/ensure-client.use-case';
import { type EnsureVehicleUseCase } from '@vehicle/application/use-cases/ensure-vehicle.use-case';
import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { type BuildServiceOrderItemsUseCase } from '@service-orders/application/use-cases/build-service-order-items.use-case';
import { type CalculateTotalAmountUseCase } from '@service-orders/application/use-cases/calculate-total-amount.use-case';
import { type NotifyServiceOrderStatusChangeUseCase } from '@service-orders/application/use-cases/notify-service-order-status-change.use-case';
import {
  CreateServiceOrderUseCase,
  type OpenServiceOrderInput,
} from '@service-orders/application/use-cases/create-service-order.use-case';

describe('CreateServiceOrderUseCase', () => {
  let repository: { save: jest.Mock };
  let transactionRunner: { run: jest.Mock };
  let ensureClient: { execute: jest.Mock };
  let ensureVehicle: { execute: jest.Mock };
  let buildItems: { execute: jest.Mock };
  let calculateTotal: { execute: jest.Mock };
  let notifyStatusChange: { execute: jest.Mock };
  let useCase: CreateServiceOrderUseCase;
  let calls: string[];

  const input: OpenServiceOrderInput = {
    client: { cpfCnpj: '123.456.789-09', name: 'João', phone: '11999999999', address: 'Rua A, 1' },
    vehicle: { licensePlate: 'ABC1D23', brand: 'Fiat', model: 'Uno', year: 2020 },
    description: 'Barulho ao freiar',
    services: [{ serviceId: 'service-1' }],
    parts: [{ inventoryId: 'part-1', quantity: 1 }],
  };

  beforeEach(() => {
    calls = [];
    repository = {
      save: jest.fn((os) => {
        calls.push('save');
        return Promise.resolve(os);
      }),
    };
    transactionRunner = {
      run: jest.fn((work: () => Promise<unknown>) => {
        calls.push('transaction');
        return work();
      }),
    };
    ensureClient = { execute: jest.fn().mockResolvedValue({ id: 'client-1' }) };
    ensureVehicle = { execute: jest.fn().mockResolvedValue({ id: 'vehicle-1' }) };
    buildItems = {
      execute: jest.fn().mockResolvedValue({
        serviceItems: [ServiceItem.create('service-1', 100)],
        partItems: [],
      }),
    };
    calculateTotal = { execute: jest.fn().mockResolvedValue(100) };
    notifyStatusChange = {
      execute: jest.fn(() => {
        calls.push('notify');
        return Promise.resolve();
      }),
    };

    useCase = new CreateServiceOrderUseCase(
      repository as unknown as ServiceOrderRepository,
      transactionRunner as unknown as TransactionRunner,
      ensureClient as unknown as EnsureClientUseCase,
      ensureVehicle as unknown as EnsureVehicleUseCase,
      buildItems as unknown as BuildServiceOrderItemsUseCase,
      calculateTotal as unknown as CalculateTotalAmountUseCase,
      notifyStatusChange as unknown as NotifyServiceOrderStatusChangeUseCase,
    );
  });

  it('abre a OS com o cliente, o veículo e os itens informados', async () => {
    const serviceOrder = await useCase.execute(input);

    expect(ensureClient.execute).toHaveBeenCalledWith(input.client);
    expect(ensureVehicle.execute).toHaveBeenCalledWith({
      ...input.vehicle,
      clientId: 'client-1',
    });
    expect(serviceOrder.vehicleId).toBe('vehicle-1');
    expect(serviceOrder.description).toBe(input.description);
    expect(serviceOrder.serviceItems).toHaveLength(1);
    expect(serviceOrder.totalAmount).toBe(100);
    expect(repository.save).toHaveBeenCalledWith(serviceOrder);
  });

  it('monta e valida os itens antes de abrir a transação e notifica só depois de gravar', async () => {
    await useCase.execute(input);

    expect(buildItems.execute).toHaveBeenCalledWith({
      services: input.services,
      parts: input.parts,
    });
    expect(calls).toEqual(['transaction', 'save', 'notify']);
    expect(buildItems.execute.mock.invocationCallOrder[0]).toBeLessThan(
      transactionRunner.run.mock.invocationCallOrder[0],
    );
  });

  it('notifica o cliente com a OS criada', async () => {
    const serviceOrder = await useCase.execute(input);

    expect(notifyStatusChange.execute).toHaveBeenCalledTimes(1);
    expect(notifyStatusChange.execute).toHaveBeenCalledWith(serviceOrder);
  });

  it('não abre transação nem grava nada se um item for inválido', async () => {
    buildItems.execute.mockRejectedValue(new BusinessRuleError('Unavailable quantity for part'));

    await expect(useCase.execute(input)).rejects.toThrow(BusinessRuleError);
    expect(transactionRunner.run).not.toHaveBeenCalled();
    expect(ensureClient.execute).not.toHaveBeenCalled();
    expect(repository.save).not.toHaveBeenCalled();
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('propaga o erro do veículo, não salva a OS e não notifica', async () => {
    ensureVehicle.execute.mockRejectedValue(
      new BusinessRuleError('Vehicle does not belong to the informed client'),
    );

    await expect(useCase.execute(input)).rejects.toThrow(BusinessRuleError);
    expect(repository.save).not.toHaveBeenCalled();
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('propaga o erro quando uma peça não existe', async () => {
    buildItems.execute.mockRejectedValue(new NotFoundError('Part not found'));

    await expect(useCase.execute(input)).rejects.toThrow(NotFoundError);
    expect(transactionRunner.run).not.toHaveBeenCalled();
    expect(notifyStatusChange.execute).not.toHaveBeenCalled();
  });

  it('abre a OS sem serviços nem peças quando eles não são informados', async () => {
    buildItems.execute.mockResolvedValue({ serviceItems: [], partItems: [] });
    calculateTotal.execute.mockResolvedValue(0);

    const serviceOrder = await useCase.execute({
      client: input.client,
      vehicle: input.vehicle,
      description: input.description,
    });

    expect(serviceOrder.serviceItems).toHaveLength(0);
    expect(serviceOrder.totalAmount).toBe(0);
  });
});

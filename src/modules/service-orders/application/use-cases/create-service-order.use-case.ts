import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@common/application/transaction-runner';
import { EnsureClientUseCase } from '@client/application/use-cases/ensure-client.use-case';
import { EnsureVehicleUseCase } from '@vehicle/application/use-cases/ensure-vehicle.use-case';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { BuildServiceOrderItemsUseCase } from './build-service-order-items.use-case';
import { CalculateTotalAmountUseCase } from './calculate-total-amount.use-case';

export interface OpenServiceOrderInput {
  client: {
    cpfCnpj: string;
    name?: string;
    phone?: string;
    address?: string;
    email?: string | null;
  };
  vehicle: {
    licensePlate: string;
    brand?: string;
    model?: string;
    year?: number;
  };
  description: string;
  services?: { serviceId: string }[];
  parts?: { inventoryId: string; quantity: number }[];
}

@Injectable()
export class CreateServiceOrderUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly transactionRunner: TransactionRunner,
    private readonly ensureClient: EnsureClientUseCase,
    private readonly ensureVehicle: EnsureVehicleUseCase,
    private readonly buildServiceOrderItems: BuildServiceOrderItemsUseCase,
    private readonly calculateTotalAmount: CalculateTotalAmountUseCase,
  ) {}

  async execute(input: OpenServiceOrderInput): Promise<ServiceOrder> {
    // se algo estiver errado nos itens, nada é aberto.
    const { serviceItems, partItems } = await this.buildServiceOrderItems.execute({
      services: input.services,
      parts: input.parts,
    });
    const totalAmount = await this.calculateTotalAmount.execute(serviceItems, partItems);

    // todas as escritas na mesma transação: ou grava tudo, ou nada.
    return this.transactionRunner.run(async () => {
      const client = await this.ensureClient.execute(input.client);
      const vehicle = await this.ensureVehicle.execute({
        ...input.vehicle,
        clientId: client.id,
      });

      const serviceOrder = ServiceOrder.create(
        vehicle.id,
        input.description,
        serviceItems,
        partItems,
        totalAmount,
      );

      return this.serviceOrderRepository.save(serviceOrder);
    });
  }
}

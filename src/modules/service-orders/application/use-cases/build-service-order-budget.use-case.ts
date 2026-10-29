import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { FindVehicleByIdUseCase } from '@vehicle/application/use-cases/find-vehicle-by-id.use-case';
import { FindClientByIdUseCase } from '@client/application/use-cases/find-client-by-id.use-case';
import { FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';
import { type ServiceEntity } from '@service/domain/entities/service.entity';
import { FindPartsByIdListUseCase } from '@inventory/application/use-cases/find-parts-by-id-list.use-case';
import { type Part } from '@inventory/domain/entities/part.entity';

export interface ServiceOrderBudgetLineItem {
  name: string;
  quantity: number;
  unitOfMeasure: string | null;
  unitPrice: number;
  subtotal: number;
}

export interface ServiceOrderBudget {
  serviceOrderId: string;
  description: string;
  status: string;
  client: {
    name: string;
    cpfCnpj: string;
    phone: string;
    address: string;
    email: string | null;
  };
  vehicle: {
    brand: string;
    model: string;
    licensePlate: string;
    year: number;
  };
  services: ServiceOrderBudgetLineItem[];
  parts: ServiceOrderBudgetLineItem[];
  totalAmount: number;
  generatedAt: Date;
}

type BudgetClient = Awaited<ReturnType<FindClientByIdUseCase['execute']>>;
type BudgetVehicle = Awaited<ReturnType<FindVehicleByIdUseCase['execute']>>;

interface BudgetRelations {
  vehicle: BudgetVehicle;
  client: BudgetClient;
  services: ServiceEntity[];
  parts: Part[];
}

interface BudgetParts {
  serviceOrder: ServiceOrder;
  client: BudgetClient;
  vehicle: BudgetVehicle;
  serviceLines: ServiceOrderBudgetLineItem[];
  partLines: ServiceOrderBudgetLineItem[];
}

@Injectable()
export class BuildServiceOrderBudgetUseCase {
  constructor(
    private readonly findVehicleById: FindVehicleByIdUseCase,
    private readonly findClientById: FindClientByIdUseCase,
    private readonly findServicesByIdList: FindServicesByIdListUseCase,
    private readonly findPartsByIdList: FindPartsByIdListUseCase,
  ) {}

  async execute(serviceOrder: ServiceOrder): Promise<ServiceOrderBudget> {
    const { vehicle, client, services, parts } = await this.loadBudgetRelations(serviceOrder);
    return this.toBudget({
      serviceOrder,
      client,
      vehicle,
      serviceLines: this.buildServiceLines(serviceOrder, services),
      partLines: this.buildPartLines(serviceOrder, parts),
    });
  }

  private async loadBudgetRelations(serviceOrder: ServiceOrder): Promise<BudgetRelations> {
    const [vehicle, services, parts] = await Promise.all([
      this.findVehicleById.execute(serviceOrder.vehicleId),
      serviceOrder.serviceItems.length > 0
        ? this.findServicesByIdList.execute(serviceOrder.serviceItems.map((item) => item.serviceId))
        : Promise.resolve([]),
      serviceOrder.partItems.length > 0
        ? this.findPartsByIdList.execute(serviceOrder.partItems.map((item) => item.inventoryId))
        : Promise.resolve([]),
    ]);
    const client = await this.findClientById.execute(vehicle.clientId);
    return { vehicle, client, services, parts };
  }

  private buildServiceLines(
    serviceOrder: ServiceOrder,
    services: ServiceEntity[],
  ): ServiceOrderBudgetLineItem[] {
    const servicesById = new Map<string, ServiceEntity>(
      services.map((service) => [service.id, service]),
    );

    return serviceOrder.serviceItems.map((item) => {
      const service = servicesById.get(item.serviceId);
      if (!service?.name) {
        throw new NotFoundError(`Service not found: ${item.serviceId}`);
      }
      return {
        name: service.name,
        quantity: 1,
        unitOfMeasure: null,
        unitPrice: item.price,
        subtotal: item.price,
      };
    });
  }

  private buildPartLines(serviceOrder: ServiceOrder, parts: Part[]): ServiceOrderBudgetLineItem[] {
    const partsById = new Map<string, Part>(parts.map((part) => [part.id, part]));

    return serviceOrder.partItems.map((item) => {
      const part = partsById.get(item.inventoryId);
      if (!part) {
        throw new NotFoundError(`Part not found: ${item.inventoryId}`);
      }
      return {
        name: part.name,
        quantity: item.quantity,
        unitOfMeasure: item.unitOfMeasure,
        unitPrice: item.unitPrice,
        subtotal: item.quantity * item.unitPrice,
      };
    });
  }

  private toBudget(parts: BudgetParts): ServiceOrderBudget {
    const { serviceOrder, client, vehicle, serviceLines, partLines } = parts;

    return {
      serviceOrderId: serviceOrder.id,
      description: serviceOrder.description,
      status: serviceOrder.status,
      client: {
        name: client.name,
        cpfCnpj: client.cpfCnpj.value,
        phone: client.phone,
        address: client.address,
        email: client.email,
      },
      vehicle: {
        brand: vehicle.brand,
        model: vehicle.model,
        licensePlate: vehicle.licensePlate.value,
        year: vehicle.year,
      },
      services: serviceLines,
      parts: partLines,
      totalAmount: serviceOrder.totalAmount,
      generatedAt: new Date(),
    };
  }
}

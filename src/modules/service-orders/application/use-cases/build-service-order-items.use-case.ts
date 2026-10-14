import { BusinessRuleError, DomainError, NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { PartItem } from '@service-orders/domain/entities/part-item.entity';
import { CheckPartsAvailabilityUseCase } from '@inventory/application/use-cases/check-parts-availability.use-case';
import { FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';

export interface ServiceOrderItemsInput {
  services?: { serviceId: string }[];
  parts?: { inventoryId: string; quantity: number }[];
}

export interface ServiceOrderItems {
  serviceItems: ServiceItem[];
  partItems: PartItem[];
}

type RequestedServices = NonNullable<ServiceOrderItemsInput['services']>;
type RequestedParts = NonNullable<ServiceOrderItemsInput['parts']>;
type PartsAvailability = Awaited<ReturnType<CheckPartsAvailabilityUseCase['execute']>>;

@Injectable()
export class BuildServiceOrderItemsUseCase {
  constructor(
    private readonly checkPartsAvailability: CheckPartsAvailabilityUseCase,
    private readonly findServicesByIdList: FindServicesByIdListUseCase,
  ) {}

  async execute(input: ServiceOrderItemsInput): Promise<ServiceOrderItems> {
    const services = input.services ?? [];
    const parts = input.parts ?? [];

    this.rejectRepeatedParts(parts);

    const [serviceItems, partItems] = await Promise.all([
      this.buildServiceItems(services),
      this.buildPartItems(parts),
    ]);
    return { serviceItems, partItems };
  }

  private async buildServiceItems(services: RequestedServices): Promise<ServiceItem[]> {
    if (services.length === 0) return [];

    const found = await this.findServicesByIdList.execute(services.map((item) => item.serviceId));
    return found.map((service) => ServiceItem.create(service.id, service.price.getValue()));
  }

  /**
   * Usa o estoque lógico em lote: já desconta o que outras OS em aberto reservaram,
   * para que a mesma peça não seja comprometida duas vezes.
   */
  private async buildPartItems(parts: RequestedParts): Promise<PartItem[]> {
    const availabilities = await this.checkPartsAvailability.execute(parts);
    this.assertAllPartsAvailable(availabilities);

    const partsById = new Map(
      availabilities.map((availability) => [
        availability.stockLevel.part.id,
        availability.stockLevel.part,
      ]),
    );

    return parts.map((item) => {
      const part = partsById.get(item.inventoryId);
      if (!part) throw new NotFoundError(`Part ${item.inventoryId} not found`);
      return PartItem.create(part.id, item.quantity, part.unitPrice, part.unitOfMeasure.value);
    });
  }

  private assertAllPartsAvailable(availabilities: PartsAvailability): void {
    const unavailable = availabilities.find((availability) => !availability.isAvailable);
    if (!unavailable) return;

    const { part, availableQuantity } = unavailable.stockLevel;
    throw new BusinessRuleError(
      `Unavailable quantity for part ${part.name}. Available: ${availableQuantity}, requested: ${unavailable.requestedQuantity}`,
    );
  }

  private rejectRepeatedParts(parts: RequestedParts): void {
    const inventoryIds = new Set<string>();

    for (const item of parts) {
      if (inventoryIds.has(item.inventoryId)) {
        throw new DomainError(
          `Part ${item.inventoryId} cannot be added more than once in the same operation`,
        );
      }
      inventoryIds.add(item.inventoryId);
    }
  }
}

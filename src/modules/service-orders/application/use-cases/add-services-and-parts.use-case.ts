import { DomainError, NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { PartItem } from '@service-orders/domain/entities/part-item.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { AddServicesAndPartsDto } from '@service-orders/presentation/dtos/add-services-and-parts.dto';
import { CheckPartsAvailabilityUseCase } from '@inventory/application/use-cases/check-parts-availability.use-case';
import { type StockLevel } from '@inventory/domain/value-objects/stock-level.vo';
import { FindServicesByIdListUseCase } from '@service/application/use-cases/find-services-by-id-list.use-case';
import { CalculateTotalAmountUseCase } from '@service-orders/application/use-cases/calculate-total-amount.use-case';
import { InsufficientStockError } from '@inventory/domain/errors/insufficient-stock.error';

/**
 * Além da OS atualizada, mostra as peças recém-adicionadas cujo estoque lógico
 * ficou abaixo do mínimo — o alerta que aparece no orçamento.
 */
export interface AddServicesAndPartsResult {
  serviceOrder: ServiceOrder;
  stockAlerts: StockLevel[];
}

@Injectable()
export class AddServicesAndPartsUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly checkPartsAvailability: CheckPartsAvailabilityUseCase,
    private readonly findServicesByIdList: FindServicesByIdListUseCase,
    private readonly calculateTotalAmount: CalculateTotalAmountUseCase,
  ) {}

  async execute(
    id: string,
    dto: AddServicesAndPartsDto,
    mechanicId: string,
  ): Promise<AddServicesAndPartsResult> {
    this.validatePartItems(dto);

    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');

    const serviceItemsPromise =
      dto.services.length > 0
        ? this.findServicesByIdList
            .execute(dto.services.map((item) => item.serviceId))
            .then((services) =>
              services.map((service) => ServiceItem.create(service.id, service.price.getValue())),
            )
        : Promise.resolve([]);

    // Estoque lógico em lote: já desconta o que outras OS em aberto reservaram,
    // para que a mesma peça não seja comprometida duas vezes.
    const partItemsPromise = this.checkPartsAvailability
      .execute(dto.parts)
      .then((availabilities) => {
        const unavailable = availabilities.find((availability) => !availability.isAvailable);
        if (unavailable) {
          const { part, availableQuantity } = unavailable.stockLevel;
          throw new InsufficientStockError(
            part.name,
            availableQuantity,
            unavailable.requestedQuantity,
          );
        }

        const partsById = new Map(
          availabilities.map((availability) => [
            availability.stockLevel.part.id,
            availability.stockLevel.part,
          ]),
        );

        return dto.parts.map((item) => {
          const part = partsById.get(item.inventoryId);
          if (!part) {
            throw new NotFoundError(`Part ${item.inventoryId} not found`);
          }
          return PartItem.create(part.id, item.quantity, part.unitPrice, part.unitOfMeasure.value);
        });
      });

    const [newServiceItems, newPartItems] = await Promise.all([
      serviceItemsPromise,
      partItemsPromise,
    ]);

    const totalAmount = await this.calculateTotalAmount.execute(
      [...serviceOrder.serviceItems, ...newServiceItems],
      [...serviceOrder.partItems, ...newPartItems],
    );

    serviceOrder.finishDiagnosis(mechanicId);
    serviceOrder.addServicesAndParts(newServiceItems, newPartItems, totalAmount);

    const savedServiceOrder = await this.serviceOrderRepository.save(serviceOrder);

    return {
      serviceOrder: savedServiceOrder,
      stockAlerts: await this.collectStockAlerts(newPartItems),
    };
  }

  /**
   * Calcula, depois de salvar a OS, quais peças recém-adicionadas
   * deixaram o estoque lógico abaixo do mínimo recomendado.
   */
  private async collectStockAlerts(partItems: PartItem[]): Promise<StockLevel[]> {
    const availabilities = await this.checkPartsAvailability.execute(
      partItems.map((item) => ({ inventoryId: item.inventoryId, quantity: item.quantity })),
    );

    return availabilities
      .map((availability) => availability.stockLevel)
      .filter((stockLevel) => stockLevel.isBelowMinimum());
  }

  private validatePartItems(dto: AddServicesAndPartsDto): void {
    const inventoryIds = new Set<string>();

    for (const item of dto.parts) {
      if (inventoryIds.has(item.inventoryId)) {
        throw new DomainError(
          `Part ${item.inventoryId} cannot be added more than once in the same operation`,
        );
      }
      inventoryIds.add(item.inventoryId);
    }
  }
}

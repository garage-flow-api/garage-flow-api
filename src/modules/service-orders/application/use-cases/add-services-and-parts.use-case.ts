import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { type PartItem } from '@service-orders/domain/entities/part-item.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { AddServicesAndPartsDto } from '@service-orders/presentation/dtos/add-services-and-parts.dto';
import { CheckPartsAvailabilityUseCase } from '@inventory/application/use-cases/check-parts-availability.use-case';
import { type StockLevel } from '@inventory/domain/value-objects/stock-level.vo';
import { CalculateTotalAmountUseCase } from '@service-orders/application/use-cases/calculate-total-amount.use-case';
import { BuildServiceOrderItemsUseCase } from '@service-orders/application/use-cases/build-service-order-items.use-case';

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
    private readonly buildServiceOrderItems: BuildServiceOrderItemsUseCase,
    private readonly checkPartsAvailability: CheckPartsAvailabilityUseCase,
    private readonly calculateTotalAmount: CalculateTotalAmountUseCase,
  ) {}

  async execute(
    id: string,
    dto: AddServicesAndPartsDto,
    mechanicId: string,
  ): Promise<AddServicesAndPartsResult> {
    const { serviceItems: newServiceItems, partItems: newPartItems } =
      await this.buildServiceOrderItems.execute(dto);

    const serviceOrder = await this.findServiceOrder(id);

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

  private async findServiceOrder(id: string): Promise<ServiceOrder> {
    const serviceOrder = await this.serviceOrderRepository.findById(id);
    if (!serviceOrder) throw new NotFoundError('Service order not found');
    return serviceOrder;
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
}

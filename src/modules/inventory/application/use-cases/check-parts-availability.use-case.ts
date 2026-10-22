import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { PartRepository } from '@inventory/domain/repositories/part.repository';
import { StockLevel } from '@inventory/domain/value-objects/stock-level.vo';
import { OPEN_SERVICE_ORDER_STATUSES } from '@service-orders/domain/value-objects/service-order-status.vo';

export interface RequestedPart {
  inventoryId: string;
  quantity: number;
}

export interface PartAvailability {
  stockLevel: StockLevel;
  /** Total pedido da peça, já somando linhas repetidas do mesmo item. */
  requestedQuantity: number;
  isAvailable: boolean;
}

/**
 * Confere, em lote, se o estoque lógico cobre as peças pedidas — duas consultas
 * no total, independente da quantidade de itens.
 */
@Injectable()
export class CheckPartsAvailabilityUseCase {
  constructor(private readonly partRepository: PartRepository) {}

  async execute(requestedParts: RequestedPart[]): Promise<PartAvailability[]> {
    if (requestedParts.length === 0) return [];

    const requestedByPart = new Map<string, number>();
    for (const item of requestedParts) {
      requestedByPart.set(
        item.inventoryId,
        (requestedByPart.get(item.inventoryId) ?? 0) + item.quantity,
      );
    }

    const partIds = [...requestedByPart.keys()];

    const [parts, reservedByPart] = await Promise.all([
      this.partRepository.findByIds(partIds),
      this.partRepository.findReservedQuantities(OPEN_SERVICE_ORDER_STATUSES, partIds),
    ]);

    const partsById = new Map(parts.map((part) => [part.id, part]));

    return partIds.map((partId) => {
      const part = partsById.get(partId);
      if (!part) {
        throw new NotFoundError(`Part ${partId} not found`);
      }

      const stockLevel = new StockLevel(part, reservedByPart.get(partId) ?? 0);
      const requestedQuantity = requestedByPart.get(partId) ?? 0;

      return {
        stockLevel,
        requestedQuantity,
        isAvailable: requestedQuantity <= stockLevel.availableQuantity,
      };
    });
  }
}

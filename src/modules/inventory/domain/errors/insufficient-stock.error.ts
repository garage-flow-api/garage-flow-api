import { BusinessRuleError } from '@common/errors/domain.error';

export class InsufficientStockError extends BusinessRuleError {
  constructor(partName: string, availableQuantity: number, requestedQuantity: number) {
    super(
      `Unavailable quantity for part ${partName}. Available: ${availableQuantity}, requested: ${requestedQuantity}`,
    );
  }
}

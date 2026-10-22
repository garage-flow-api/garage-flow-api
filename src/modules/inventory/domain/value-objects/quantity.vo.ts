import { BusinessRuleError, DomainError } from '@common/errors/domain.error';

export class Quantity {
  readonly value: number;

  constructor(value: number, allowNegative = false) {
    if (!allowNegative && value < 0) {
      throw new DomainError('Quantity cannot be negative');
    }
    this.value = value;
  }

  add(amount: number): Quantity {
    return new Quantity(this.value + amount);
  }

  subtract(amount: number): Quantity {
    if (this.value - amount < 0) {
      throw new BusinessRuleError('Insufficient stock');
    }
    return new Quantity(this.value - amount);
  }

  /**
   * Baixa que aceita resultado negativo. Usada apenas na baixa automática da OS.
   * Diferente do consumo manual, não bloqueia a finalização quando há
   * divergência de estoque; nesse caso, o saldo pode ficar negativo
   * para que a inconsistência seja identificada e tratada posteriormente.
   */
  subtractAllowingNegative(amount: number): Quantity {
    return new Quantity(this.value - amount, true);
  }

  toJSON() {
    return this.value;
  }
}

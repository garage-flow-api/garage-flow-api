import { DomainError } from '@common/errors/domain.error';

export class InvalidLicensePlateError extends DomainError {
  constructor(value: string) {
    super(`Invalid license plate: "${value}"`);
  }
}

export type LicensePlateFormat = 'OLD' | 'MERCOSUL';

/** Padrão brasileiro anterior ao Mercosul: 3 letras + 4 dígitos (ABC1234). */
const OLD_PATTERN = /^[A-Z]{3}\d{4}$/;

/** Padrão Mercosul: 3 letras + dígito + letra + 2 dígitos (ABC1D23). */
const MERCOSUL_PATTERN = /^[A-Z]{3}\d[A-Z]\d{2}$/;

/**
 * Value Object da placa do veículo.
 * Guarda a placa normalizada e garante que só existe instância válida.
 */
export class LicensePlate {
  private constructor(
    private readonly plate: string,
    private readonly kind: LicensePlateFormat,
  ) {}

  static create(value: string): LicensePlate {
    const normalized = normalize(value);

    if (OLD_PATTERN.test(normalized)) {
      return new LicensePlate(normalized, 'OLD');
    }

    if (MERCOSUL_PATTERN.test(normalized)) {
      return new LicensePlate(normalized, 'MERCOSUL');
    }

    throw new InvalidLicensePlateError(value);
  }

  static isValid(value: string): boolean {
    try {
      LicensePlate.create(value);
      return true;
    } catch {
      return false;
    }
  }

  /** Placa normalizada, sem separadores — formato usado para persistir. */
  get value(): string {
    return this.plate;
  }

  get type(): LicensePlateFormat {
    return this.kind;
  }

  isOld(): boolean {
    return this.kind === 'OLD';
  }

  isMercosul(): boolean {
    return this.kind === 'MERCOSUL';
  }

  /** Formato de exibição: o padrão antigo leva hífen, o Mercosul não. */
  format(): string {
    return this.isOld() ? `${this.plate.slice(0, 3)}-${this.plate.slice(3)}` : this.plate;
  }

  equals(other: LicensePlate): boolean {
    return this.plate === other.plate;
  }

  toString(): string {
    return this.plate;
  }
}

function normalize(value: string): string {
  return (value ?? '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
}

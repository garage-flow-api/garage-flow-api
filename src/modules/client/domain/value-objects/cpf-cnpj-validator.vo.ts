import { DomainError } from '@common/errors/domain.error';

export class InvalidCpfCnpjError extends DomainError {
  constructor(value: string) {
    super(`Invalid CPF/CNPJ: "${value}"`);
  }
}

export type CpfCnpjKind = 'CPF' | 'CNPJ';

const CPF_LENGTH = 11;
const CNPJ_LENGTH = 14;

const CNPJ_FIRST_DIGIT_WEIGHTS = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const CNPJ_SECOND_DIGIT_WEIGHTS = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

/**
 * Value Object do documento do cliente (CPF ou CNPJ).
 * Guarda apenas os dígitos e garante que só existe instância válida.
 */
export class CpfCnpj {
  private constructor(
    private readonly digits: string,
    private readonly kind: CpfCnpjKind,
  ) {}

  static create(value: string): CpfCnpj {
    const digits = onlyDigits(value);

    if (digits.length === CPF_LENGTH && isValidCpf(digits)) {
      return new CpfCnpj(digits, 'CPF');
    }

    if (digits.length === CNPJ_LENGTH && isValidCnpj(digits)) {
      return new CpfCnpj(digits, 'CNPJ');
    }

    throw new InvalidCpfCnpjError(value);
  }

  static isValid(value: string): boolean {
    try {
      CpfCnpj.create(value);
      return true;
    } catch {
      return false;
    }
  }

  /** Apenas dígitos — formato usado para persistir. */
  get value(): string {
    return this.digits;
  }

  get type(): CpfCnpjKind {
    return this.kind;
  }

  isCpf(): boolean {
    return this.kind === 'CPF';
  }

  isCnpj(): boolean {
    return this.kind === 'CNPJ';
  }

  /** Formato mascarado, para exibição. */
  format(): string {
    return this.isCpf()
      ? this.digits.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
      : this.digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  }

  equals(other: CpfCnpj): boolean {
    return this.digits === other.digits;
  }

  toString(): string {
    return this.digits;
  }
}

function onlyDigits(value: string): string {
  return (value ?? '').replace(/\D/g, '');
}

function hasRepeatedDigits(digits: string): boolean {
  return new Set(digits).size === 1;
}

/** Regra do módulo 11 compartilhada pelo CPF e pelo CNPJ. */
function checkDigitFromSum(sum: number): number {
  const remainder = sum % 11;
  return remainder < 2 ? 0 : 11 - remainder;
}

function isValidCpf(digits: string): boolean {
  if (hasRepeatedDigits(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);

  // 1º dígito usa pesos 10..2, o 2º usa 11..2 incluindo o dígito recém-conferido.
  for (let position = 9; position < CPF_LENGTH; position++) {
    let sum = 0;

    for (let index = 0; index < position; index++) {
      sum += numbers[index] * (position + 1 - index);
    }

    if (numbers[position] !== checkDigitFromSum(sum)) {
      return false;
    }
  }

  return true;
}

function isValidCnpj(digits: string): boolean {
  if (hasRepeatedDigits(digits)) {
    return false;
  }

  const numbers = digits.split('').map(Number);

  for (const weights of [CNPJ_FIRST_DIGIT_WEIGHTS, CNPJ_SECOND_DIGIT_WEIGHTS]) {
    const sum = weights.reduce((total, weight, index) => total + numbers[index] * weight, 0);

    if (numbers[weights.length] !== checkDigitFromSum(sum)) {
      return false;
    }
  }

  return true;
}

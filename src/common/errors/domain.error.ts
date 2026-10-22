export type DomainErrorCode =
  | 'INVALID_INPUT'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE_VIOLATION'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

export class DomainError extends Error {
  readonly code: DomainErrorCode = 'INVALID_INPUT';

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  override readonly code: DomainErrorCode = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  override readonly code: DomainErrorCode = 'CONFLICT';
}

export class BusinessRuleError extends DomainError {
  override readonly code: DomainErrorCode = 'BUSINESS_RULE_VIOLATION';
}

export class UnauthorizedError extends DomainError {
  override readonly code: DomainErrorCode = 'UNAUTHORIZED';
}

export class ForbiddenError extends DomainError {
  override readonly code: DomainErrorCode = 'FORBIDDEN';
}

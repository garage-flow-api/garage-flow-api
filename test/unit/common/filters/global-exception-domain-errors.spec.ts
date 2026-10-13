import { type ArgumentsHost, HttpStatus } from '@nestjs/common';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
} from '@common/errors/domain.error';

const buildHost = () => {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ method: 'GET', url: '/teste' }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
};

describe('GlobalExceptionFilter (erros de domínio)', () => {
  it.each([
    [new NotFoundError('não achou'), HttpStatus.NOT_FOUND],
    [new ConflictError('duplicado'), HttpStatus.CONFLICT],
    [new BusinessRuleError('regra violada'), HttpStatus.UNPROCESSABLE_ENTITY],
    [new DomainError('valor inválido'), HttpStatus.BAD_REQUEST],
  ])('%s deve responder com o status correto', (error, expectedStatus) => {
    const { host, status, json } = buildHost();

    new GlobalExceptionFilter().catch(error, host);

    expect(status).toHaveBeenCalledWith(expectedStatus);
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: expectedStatus, message: error.message }),
    );
  });
});

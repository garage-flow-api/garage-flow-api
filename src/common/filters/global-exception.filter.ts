import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import { DomainError, type DomainErrorCode } from '@common/errors/domain.error';

type HttpExceptionResponse = {
  message?: string | string[];
};

const HTTP_STATUS_BY_DOMAIN_CODE: Record<DomainErrorCode, HttpStatus> = {
  INVALID_INPUT: HttpStatus.BAD_REQUEST,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
  BUSINESS_RULE_VIOLATION: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
};
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const message = this.getHttpExceptionMessage(exception);

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(`${request.method} ${request.url} - ${status}`, exception.stack);
      } else {
        this.logger.warn(
          `${request.method} ${request.url} - ${status} - ${JSON.stringify(message)}`,
        );
      }

      response.status(status).json(this.createResponse(status, message, request));
      return;
    }

    if (exception instanceof DomainError) {
      const status = this.statusFor(exception);
      this.logger.warn(
        `${request.method} ${request.url} - ${status} - ${exception.name}: ${exception.message}`,
      );
      response.status(status).json(this.createResponse(status, exception.message, request));
      return;
    }

    this.logger.error(
      `${request.method} ${request.url} - Unexpected exception`,
      exception instanceof Error ? exception.stack : undefined,
    );
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(
        this.createResponse(HttpStatus.INTERNAL_SERVER_ERROR, 'Internal server error', request),
      );
  }

  private getHttpExceptionMessage(exception: HttpException): string | string[] {
    const exceptionResponse = exception.getResponse();

    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    const message = (exceptionResponse as HttpExceptionResponse).message;
    return message ?? exception.message;
  }

  private createResponse(statusCode: number, message: string | string[], request: Request) {
    return {
      statusCode,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
    };
  }

  private statusFor(error: DomainError): HttpStatus {
    return HTTP_STATUS_BY_DOMAIN_CODE[error.code];
  }
}

import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { type Request, type Response } from 'express';
import {
  BusinessRuleError,
  ConflictError,
  DomainError,
  NotFoundError,
  UnauthorizedError,
} from '@common/errors/domain.error';

type HttpExceptionResponse = {
  message?: string | string[];
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
    if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
    if (error instanceof ConflictError) return HttpStatus.CONFLICT;
    if (error instanceof BusinessRuleError) return HttpStatus.UNPROCESSABLE_ENTITY;
    if (error instanceof UnauthorizedError) return HttpStatus.UNAUTHORIZED;
    return HttpStatus.BAD_REQUEST;
  }
}

import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  type RawBodyRequest,
  UnauthorizedException,
} from '@nestjs/common';
import { type Request } from 'express';
import { isValidSignature } from '@service-orders/infrastructure/security/webhook-signature.util';

/**
 * Autentica o webhook de decisão do orçamento pela assinatura HMAC do corpo bruto.
 * Falha fechado: sem BUDGET_WEBHOOK_SECRET configurado, nenhuma chamada é aceita.
 */
@Injectable()
export class BudgetWebhookSignatureGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RawBodyRequest<Request>>();
    const secret = process.env.BUDGET_WEBHOOK_SECRET;
    const signature = request.header('x-signature');

    if (!secret || !request.rawBody || !isValidSignature(request.rawBody, signature, secret)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    return true;
  }
}

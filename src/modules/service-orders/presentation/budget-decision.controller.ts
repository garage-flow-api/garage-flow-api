import { Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiParam, ApiProduces, ApiTags } from '@nestjs/swagger';

import { NotFoundError } from '@common/errors/domain.error';
import { BudgetDecision } from '@service-orders/domain/value-objects/budget-decision.vo';
import { ProcessBudgetDecisionUseCase } from '@service-orders/application/use-cases/process-budget-decision.use-case';
import {
  type BudgetDecisionAction,
  verifyBudgetDecisionToken,
} from '@service-orders/infrastructure/security/budget-decision-token.util';

const LABEL: Record<BudgetDecisionAction, { verb: string; done: string }> = {
  approve: { verb: 'aprovar', done: 'aprovado' },
  reject: { verb: 'recusar', done: 'recusado' },
};

// Só textos fixos entram no HTML: não há entrada do usuário a escapar. O formulário não define
// "action", então o POST vai para a própria URL (funciona também atrás de proxy com prefixo).
function page(title: string, body: string, buttonLabel?: string): string {
  const formHtml = buttonLabel
    ? `<form method="post"><button type="submit">${buttonLabel}</button></form>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;text-align:center}
button{font-size:1rem;padding:.75rem 1.5rem;border:0;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer}</style>
</head><body><h1>${title}</h1><p>${body}</p>${formHtml}</body></html>`;
}

const INVALID = page('Link inválido', 'Este link é inválido ou expirou. Fale com a oficina.');

@ApiTags('Budget decisions')
@Controller('budget-decisions')
export class BudgetDecisionController {
  constructor(private readonly processBudgetDecision: ProcessBudgetDecisionUseCase) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Shows the confirmation page of the approve/reject link sent by e-mail',
    description:
      'Does not change the service order: only the POST registers the decision. The token is signed (HMAC) and expires in 7 days.',
  })
  @ApiParam({ name: 'token', description: 'Signed token from the e-mail link' })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'HTML page ("Link inválido" when the token is invalid or expired)',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  confirm(@Param('token') token: string): string {
    const payload = verifyBudgetDecisionToken(token);
    if (!payload) return INVALID;

    const { verb } = LABEL[payload.action];
    return page(
      `Deseja ${verb} o orçamento?`,
      'Confirme abaixo para registrar a sua decisão.',
      `Confirmar: ${verb} orçamento`,
    );
  }

  @Post(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Registers the decision of the e-mail link (approve or reject)',
    description:
      'Reuses the budget decision flow of the webhook: the first decision wins; repeated or opposite decisions are ignored.',
  })
  @ApiParam({ name: 'token', description: 'Signed token from the e-mail link' })
  @ApiProduces('text/html')
  @ApiOkResponse({
    description: 'HTML page with the result',
    content: { 'text/html': { schema: { type: 'string' } } },
  })
  async decide(@Param('token') token: string): Promise<string> {
    const payload = verifyBudgetDecisionToken(token);
    if (!payload) return INVALID;

    const decision =
      payload.action === 'approve' ? BudgetDecision.APPROVED : BudgetDecision.REJECTED;

    let processed: boolean;
    try {
      ({ processed } = await this.processBudgetDecision.execute(payload.serviceOrderId, decision));
    } catch (error) {
      // OS removida depois do envio do e-mail: mostra a página, e não um JSON de erro
      if (error instanceof NotFoundError) return INVALID;
      throw error;
    }

    if (!processed) {
      return page(
        'Decisão já registrada',
        'Esta ordem de serviço já teve uma decisão registrada ou não aguarda mais aprovação.',
      );
    }
    return page(`Orçamento ${LABEL[payload.action].done}`, 'Obrigado! A oficina foi avisada.');
  }
}

// src/modules/service-orders/presentation/budget-decision.controller.ts
import { Controller, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';

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

// Só textos fixos e o token já verificado (HMAC) entram no HTML: não há entrada do usuário a escapar.
function page(title: string, body: string, form?: { action: string; button: string }): string {
  const formHtml = form
    ? `<form method="post" action="${form.action}"><button type="submit">${form.button}</button></form>`
    : '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 16px;text-align:center}
button{font-size:1rem;padding:.75rem 1.5rem;border:0;border-radius:6px;background:#1d4ed8;color:#fff;cursor:pointer}</style>
</head><body><h1>${title}</h1><p>${body}</p>${formHtml}</body></html>`;
}

const INVALID = page('Link inválido', 'Este link é inválido ou expirou. Fale com a oficina.');

@ApiExcludeController()
@Controller('budget-decisions')
export class BudgetDecisionController {
  constructor(private readonly processBudgetDecision: ProcessBudgetDecisionUseCase) {}

  @Get(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  confirm(@Param('token') token: string): string {
    const payload = verifyBudgetDecisionToken(token);
    if (!payload) return INVALID;

    const { verb } = LABEL[payload.action];
    return page(`Deseja ${verb} o orçamento?`, 'Confirme abaixo para registrar a sua decisão.', {
      action: `/budget-decisions/${token}`,
      button: `Confirmar: ${verb} orçamento`,
    });
  }

  @Post(':token')
  @Header('Content-Type', 'text/html; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @HttpCode(200)
  async decide(@Param('token') token: string): Promise<string> {
    const payload = verifyBudgetDecisionToken(token);
    if (!payload) return INVALID;

    const decision =
      payload.action === 'approve' ? BudgetDecision.APPROVED : BudgetDecision.REJECTED;
    const { processed } = await this.processBudgetDecision.execute(
      payload.serviceOrderId,
      decision,
    );

    if (!processed) {
      return page(
        'Decisão já registrada',
        'Esta ordem de serviço já teve uma decisão registrada ou não aguarda mais aprovação.',
      );
    }
    return page(`Orçamento ${LABEL[payload.action].done}`, 'Obrigado! A oficina foi avisada.');
  }
}

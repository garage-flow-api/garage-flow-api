import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { ProcessBudgetDecisionUseCase } from '@service-orders/application/use-cases/process-budget-decision.use-case';
import { BudgetWebhookSignatureGuard } from '@service-orders/infrastructure/security/budget-webhook-signature.guard';
import { BudgetDecisionDto } from '@service-orders/presentation/dtos/budget-decision.dto';
import { BudgetDecisionResponseDto } from '@service-orders/presentation/dtos/budget-decision-response.dto';
import { ErrorResponseDto } from '@common/dtos/error-response.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
export class BudgetWebhookController {
  constructor(private readonly processBudgetDecision: ProcessBudgetDecisionUseCase) {}

  @Post('budget-decision')
  @HttpCode(HttpStatus.OK)
  @UseGuards(BudgetWebhookSignatureGuard)
  @ApiOperation({
    summary: 'Receives the external approval or rejection of a service order budget',
    description:
      'Not authenticated by JWT: the call is authenticated by the HMAC-SHA256 signature of the raw body in the X-Signature header. APPROVED moves the service order to execution; REJECTED cancels it and releases its parts. Repeated decisions, or decisions for a service order that is no longer awaiting approval, are ignored (processed: false).\n\n' +
      '**Signature:** `sha256=` followed by the hex HMAC-SHA256 of the exact bytes sent as the body, keyed with `BUDGET_WEBHOOK_SECRET`.\n\n' +
      'Node.js: `"sha256=" + createHmac("sha256", secret).update(body).digest("hex")`\n\n' +
      'Shell: `printf %s "$BODY" | openssl dgst -sha256 -hmac "$SECRET"` (prefix the hex result with `sha256=`)',
  })
  @ApiHeader({
    name: 'X-Signature',
    required: true,
    example: 'sha256=5d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c592',
    description:
      'sha256=<hex HMAC-SHA256 of the raw request body, keyed with BUDGET_WEBHOOK_SECRET>',
  })
  @ApiBody({
    type: BudgetDecisionDto,
    examples: {
      approved: {
        summary: 'Client approved the budget',
        value: { serviceOrderId: '3f6c1c0e-8c2e-4a8e-9b53-2f1f6a0d1c11', decision: 'APPROVED' },
      },
      rejected: {
        summary: 'Client rejected the budget',
        value: { serviceOrderId: '3f6c1c0e-8c2e-4a8e-9b53-2f1f6a0d1c11', decision: 'REJECTED' },
      },
    },
  })
  @ApiOkResponse({ type: BudgetDecisionResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Missing or invalid signature' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async receiveDecision(@Body() dto: BudgetDecisionDto): Promise<BudgetDecisionResponseDto> {
    return this.processBudgetDecision.execute(dto.serviceOrderId, dto.decision);
  }
}

import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import {
  ApiBadRequestResponse,
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
      'Not authenticated by JWT: the call is authenticated by the HMAC-SHA256 signature of the raw body in the X-Signature header. APPROVED moves the service order to execution; REJECTED cancels it and releases its parts. Repeated decisions, or decisions for a service order that is no longer awaiting approval, are ignored (processed: false).',
  })
  @ApiHeader({
    name: 'X-Signature',
    required: true,
    description:
      'sha256=<hex HMAC-SHA256 of the raw request body, keyed with BUDGET_WEBHOOK_SECRET>',
  })
  @ApiOkResponse({ type: BudgetDecisionResponseDto })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid payload' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto, description: 'Missing or invalid signature' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Service order not found' })
  async receiveDecision(@Body() dto: BudgetDecisionDto): Promise<BudgetDecisionResponseDto> {
    return this.processBudgetDecision.execute(dto.serviceOrderId, dto.decision);
  }
}

import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { BudgetDecision } from '@service-orders/domain/value-objects/budget-decision.vo';

export class BudgetDecisionDto {
  @ApiProperty({
    description: 'Service order ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  serviceOrderId!: string;

  @ApiProperty({ enum: BudgetDecision, example: BudgetDecision.APPROVED })
  @IsEnum(BudgetDecision)
  decision!: BudgetDecision;
}

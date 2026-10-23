import { ApiProperty } from '@nestjs/swagger';

export class BudgetDecisionResponseDto {
  @ApiProperty({
    description:
      'false when the decision was ignored because the service order is no longer awaiting approval',
    example: true,
  })
  processed!: boolean;
}

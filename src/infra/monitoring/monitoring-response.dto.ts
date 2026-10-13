import { ApiProperty } from '@nestjs/swagger';

export class MonitoringResponseDto {
  @ApiProperty({ description: 'Probe status', example: 'ok' })
  status!: string;

  @ApiProperty({
    description: 'When the check ran (ISO 8601)',
    example: '2026-08-30T12:00:00.000Z',
  })
  timestamp!: string;
}

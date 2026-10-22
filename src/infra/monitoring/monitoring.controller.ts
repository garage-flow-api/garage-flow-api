import { Controller, Get, HttpCode, HttpStatus, ServiceUnavailableException } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiOperation,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { ErrorResponseDto } from '@common/dtos/error-response.dto';
import { MonitoringResponseDto } from './monitoring-response.dto';
import { MonitoringService } from './monitoring.service';

@Controller()
@ApiTags('Monitoring')
export class MonitoringController {
  constructor(private readonly monitoringService: MonitoringService) {}

  @Get('health')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Checks API liveness',
  })
  @ApiOkResponse({
    type: MonitoringResponseDto,
    description: 'The API is running normally',
  })
  checkLiveness(): MonitoringResponseDto {
    return this.monitoringService.checkLiveness();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Checks API readiness including database availability',
  })
  @ApiOkResponse({
    type: MonitoringResponseDto,
    description: 'The API is ready to receive traffic',
  })
  @ApiServiceUnavailableResponse({
    type: ErrorResponseDto,
    description: 'The API is not ready because the database is unavailable',
  })
  async checkReadiness(): Promise<MonitoringResponseDto> {
    try {
      return await this.monitoringService.checkReadiness();
    } catch {
      throw new ServiceUnavailableException('API is not ready');
    }
  }
}

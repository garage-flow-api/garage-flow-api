import { ApiProperty } from '@nestjs/swagger';
import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import {
  PublicServiceOrderStatus,
  toPublicStatus,
} from '@service-orders/domain/value-objects/public-service-order-status.vo';

export class ServiceOrderTrackingResponseDto {
  @ApiProperty({
    description: 'Current status, as shown to the client',
    enum: PublicServiceOrderStatus,
    example: PublicServiceOrderStatus.EXECUTION,
  })
  status!: PublicServiceOrderStatus;

  @ApiProperty({ description: "Date of the service order's last update" })
  updatedAt!: Date;

  static fromEntity(entity: ServiceOrder): ServiceOrderTrackingResponseDto {
    const response = new ServiceOrderTrackingResponseDto();
    response.status = toPublicStatus(entity.status);
    response.updatedAt = entity.updatedAt;
    return response;
  }
}

import { ApiProperty, OmitType } from '@nestjs/swagger';
import { type ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import {
  PublicServiceOrderStatus,
  toPublicStatus,
} from '@service-orders/domain/value-objects/public-service-order-status.vo';
import { ServiceOrderResponseDto } from '@service-orders/presentation/dtos/service-order-response.dto';

/**
 * Resposta da consulta por ID: igual à OS completa, mas com o status nos termos do cliente
 */
export class ServiceOrderDetailResponseDto extends OmitType(ServiceOrderResponseDto, [
  'status',
] as const) {
  @ApiProperty({
    description: 'Current status, as shown to the client',
    enum: PublicServiceOrderStatus,
    example: PublicServiceOrderStatus.RECEIVED,
  })
  status!: PublicServiceOrderStatus;

  static fromEntity(entity: ServiceOrder): ServiceOrderDetailResponseDto {
    const response: ServiceOrderDetailResponseDto = Object.assign(
      new ServiceOrderDetailResponseDto(),
      ServiceOrderResponseDto.fromEntity(entity),
    );
    response.status = toPublicStatus(entity.status);
    return response;
  }
}

import { BusinessRuleError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { CreateServiceOrderDto } from '@service-orders/presentation/dtos/create-service-order.dto';
import { FindClientByCpfCnpjUseCase } from '@client/application/use-cases/find-client-by-cpf-cnpj.use-case';
import { FindVehicleByLicensePlateUseCase } from '@vehicle/application/use-cases/find-vehicle-by-license-plate.use-case';

@Injectable()
export class CreateServiceOrderUseCase {
  constructor(
    private readonly serviceOrderRepository: ServiceOrderRepository,
    private readonly findClientByCpfCnpj: FindClientByCpfCnpjUseCase,
    private readonly findVehicleByLicensePlate: FindVehicleByLicensePlateUseCase,
  ) {}

  async execute(dto: CreateServiceOrderDto): Promise<ServiceOrder> {
    const client = await this.findClientByCpfCnpj.execute(dto.clientCpfCnpj);

    const vehicle = await this.findVehicleByLicensePlate.execute(dto.licensePlate);
    if (vehicle.clientId !== client.id) {
      throw new BusinessRuleError('Vehicle does not belong to the informed client');
    }

    const serviceOrder = ServiceOrder.create(vehicle.id, dto.description, [], [], 0);

    return this.serviceOrderRepository.save(serviceOrder);
  }
}

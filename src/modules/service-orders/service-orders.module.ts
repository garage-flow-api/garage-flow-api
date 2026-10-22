import { Module } from '@nestjs/common';
import { ServiceOrdersController } from '@service-orders/presentation/service-orders.controller';
import { CreateServiceOrderUseCase } from '@service-orders/application/use-cases/create-service-order.use-case';
import { FindServiceOrderByIdUseCase } from '@service-orders/application/use-cases/find-service-order-by-id.use-case';
import { FindAllServiceOrdersUseCase } from '@service-orders/application/use-cases/find-all-service-orders.use-case';
import { UpdateServiceOrderUseCase } from '@service-orders/application/use-cases/update-service-order.use-case';
import { DeleteServiceOrderUseCase } from '@service-orders/application/use-cases/delete-service-order.use-case';
import { CalculateTotalAmountUseCase } from '@service-orders/application/use-cases/calculate-total-amount.use-case';
import { AddServicesAndPartsUseCase } from '@service-orders/application/use-cases/add-services-and-parts.use-case';
import { StartDiagnosisUseCase } from '@service-orders/application/use-cases/start-diagnosis.use-case';
import { FinishServiceUseCase } from '@service-orders/application/use-cases/finish-service.use-case';
import { DeliverServiceOrderUseCase } from '@service-orders/application/use-cases/deliver-service-order.use-case';
import { StartServiceUseCase } from '@service-orders/application/use-cases/start-service.use-case';
import { GenerateServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/generate-service-order-budget.use-case';
import { ApproveServiceOrderBudgetUseCase } from '@service-orders/application/use-cases/approve-service-order-budget.use-case';
import { CancelServiceOrderUseCase } from '@service-orders/application/use-cases/cancel-service-order.use-case';
import { FindServiceOrderByTrackingTokenUseCase } from '@service-orders/application/use-cases/find-service-order-by-tracking-token.use-case';
import { GetServiceOrderTrackingLinkUseCase } from '@service-orders/application/use-cases/get-service-order-tracking-link.use-case';
import { GetAverageExecutionTimeUseCase } from '@service-orders/application/use-cases/get-average-execution-time.use-case';
import { BuildServiceOrderItemsUseCase } from '@service-orders/application/use-cases/build-service-order-items.use-case';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';
import { PrismaServiceOrderRepository } from '@service-orders/infrastructure/prisma-service-order.repository';
import { ClientModule } from '@client/client.module';
import { VehicleModule } from '@vehicle/vehicle.module';
import { ServiceModule } from '@service/service.module';
import { InventoryModule } from '@inventory/inventory.module';

@Module({
  imports: [ClientModule, VehicleModule, ServiceModule, InventoryModule],
  controllers: [ServiceOrdersController],
  providers: [
    CreateServiceOrderUseCase,
    FindServiceOrderByIdUseCase,
    FindAllServiceOrdersUseCase,
    UpdateServiceOrderUseCase,
    DeleteServiceOrderUseCase,
    CalculateTotalAmountUseCase,
    AddServicesAndPartsUseCase,
    StartDiagnosisUseCase,
    FinishServiceUseCase,
    DeliverServiceOrderUseCase,
    StartServiceUseCase,
    GenerateServiceOrderBudgetUseCase,
    ApproveServiceOrderBudgetUseCase,
    CancelServiceOrderUseCase,
    FindServiceOrderByTrackingTokenUseCase,
    GetServiceOrderTrackingLinkUseCase,
    GetAverageExecutionTimeUseCase,
    BuildServiceOrderItemsUseCase,
    { provide: ServiceOrderRepository, useClass: PrismaServiceOrderRepository },
  ],
})
export class ServiceOrdersModule {}

import { Module } from '@nestjs/common';
import { MonitoringModule } from '@infra/monitoring/monitoring.module';
import { PrismaModule } from '@infra/database/prisma/prisma.module';
import { InventoryModule } from '@inventory/inventory.module';
import { ClientModule } from '@client/client.module';
import { VehicleModule } from '@vehicle/vehicle.module';
import { ServiceModule } from '@service/service.module';
import { AuthModule } from '@auth/auth.module';
import { ServiceOrdersModule } from '@service-orders/service-orders.module';

@Module({
  imports: [
    MonitoringModule,
    PrismaModule,
    AuthModule,
    ServiceModule,
    InventoryModule,
    ClientModule,
    VehicleModule,
    InventoryModule,
    ServiceOrdersModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}

import { Injectable } from '@nestjs/common';
import { Prisma } from '@generated/prisma/client';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import {
  type AverageExecutionTimeMetrics,
  ServiceOrderListItem,
  ServiceOrderRepository,
} from '@service-orders/domain/repositories/service-order.repository';
import { ServiceOrderMapper } from '@service-orders/infrastructure/service-order.mapper';
import { PartItem } from '@service-orders/domain/entities/part-item.entity';
import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { type ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';

@Injectable()
export class PrismaServiceOrderRepository implements ServiceOrderRepository {
  constructor(private readonly prisma: PrismaService) {}

  async save(serviceOrder: ServiceOrder): Promise<ServiceOrder> {
    const data = ServiceOrderMapper.toPersistence(serviceOrder);

    const raw = await this.prisma.$transaction(async (tx) => {
      await tx.serviceOrder.upsert({
        where: { id: serviceOrder.id },
        create: data,
        update: data,
      });

      await this.deleteAndCreateServiceItems(tx, serviceOrder.id, serviceOrder.serviceItems);
      await this.deleteAndCreatePartItems(tx, serviceOrder.id, serviceOrder.partItems);

      return tx.serviceOrder.findUniqueOrThrow({
        where: { id: serviceOrder.id },
        include: { services: true, inventory: { include: { inventory: true } } },
      });
    });
    return ServiceOrderMapper.toDomain(raw);
  }

  async findById(id: string): Promise<ServiceOrder | null> {
    const raw = await this.prisma.serviceOrder.findFirst({
      where: { id, deleted_at: null },
      include: { services: true, inventory: { include: { inventory: true } } },
    });
    if (!raw) return null;
    return ServiceOrderMapper.toDomain(raw);
  }

  async findAll(
    status?: ServiceOrderStatus,
    mechanicId?: string,
    excludedStatuses: ServiceOrderStatus[] = [],
  ): Promise<ServiceOrderListItem[]> {
    const raws = await this.prisma.serviceOrder.findMany({
      where: {
        deleted_at: null,
        ...this.buildStatusFilter(status, excludedStatuses),
        ...(mechanicId ? { mechanicId } : {}),
      },
      include: {
        services: true,
        inventory: { include: { inventory: true } },
        vehicle: { include: { client: true } },
      },
      orderBy: { created_at: 'asc' },
    });

    return raws.map((raw) => {
      const serviceOrder = ServiceOrderMapper.toDomain(raw);
      return {
        id: serviceOrder.id,
        vehicleId: serviceOrder.vehicleId,
        description: serviceOrder.description,
        mechanicId: serviceOrder.mechanicId,
        status: serviceOrder.status,
        approvedAt: serviceOrder.approvedAt,
        totalAmount: serviceOrder.totalAmount,
        serviceStartedAt: serviceOrder.serviceStartedAt,
        serviceFinishedAt: serviceOrder.serviceFinishedAt,
        serviceItems: serviceOrder.serviceItems,
        partItems: serviceOrder.partItems,
        vehicleLicensePlate: raw.vehicle.licensePlate,
        clientName: raw.vehicle.client.name,
        vehicleBrand: raw.vehicle.brand,
        vehicleModel: raw.vehicle.model,
      };
    });
  }

  async findAverageExecutionTime(from?: Date, to?: Date): Promise<AverageExecutionTimeMetrics> {
    const filters = [
      Prisma.sql`"deleted_at" IS NULL`,
      Prisma.sql`"status" IN ('FINISHED', 'DELIVERED')`,
      Prisma.sql`"service_started_at" IS NOT NULL`,
      Prisma.sql`"service_finished_at" IS NOT NULL`,
    ];
    if (from) filters.push(Prisma.sql`"service_finished_at" >= ${from}`);
    if (to) filters.push(Prisma.sql`"service_finished_at" < ${to}`);

    const [metrics] = await this.prisma.$queryRaw<Array<AverageExecutionTimeMetrics>>(Prisma.sql`
      SELECT
        AVG(EXTRACT(EPOCH FROM ("service_finished_at" - "service_started_at")) / 60)::float8 AS "averageExecutionTimeMinutes",
        COUNT(*)::int AS "completedServiceOrders"
      FROM "service_orders"
      WHERE ${Prisma.join(filters, ' AND ')}
    `);

    return metrics;
  }

  private async deleteAndCreateServiceItems(
    tx: Prisma.TransactionClient,
    serviceOrderId: string,
    serviceItems: ServiceItem[],
  ): Promise<void> {
    await tx.serviceOrderService.deleteMany({ where: { serviceOrderId } });
    if (serviceItems.length > 0) {
      await tx.serviceOrderService.createMany({
        data: serviceItems.map((item) => ({
          serviceId: item.serviceId,
          serviceOrderId,
          price: item.price,
        })),
      });
    }
  }

  private async deleteAndCreatePartItems(
    tx: Prisma.TransactionClient,
    serviceOrderId: string,
    partItems: PartItem[],
  ): Promise<void> {
    await tx.serviceOrderInventory.deleteMany({ where: { serviceOrderId } });
    if (partItems.length > 0) {
      await tx.serviceOrderInventory.createMany({
        data: partItems.map((item) => ({
          inventoryId: item.inventoryId,
          serviceOrderId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        })),
      });
    }
  }

  private buildStatusFilter(
    status: ServiceOrderStatus | undefined,
    excludedStatuses: ServiceOrderStatus[],
  ): Prisma.ServiceOrderWhereInput {
    if (status) return { status };
    if (excludedStatuses.length > 0) return { status: { notIn: excludedStatuses } };
    return {};
  }
}

import { randomUUID, type UUID } from 'node:crypto';
import { ServiceOrder } from '@service-orders/domain/entities/service-order.entity';
import { ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { PartItem } from '@service-orders/domain/entities/part-item.entity';
import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

/** Data fixa no passado para que `touch()` sempre produza um `updatedAt` maior. */
export const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

export interface MakeServiceOrderOverrides {
  id?: UUID;
  vehicleId?: string;
  description?: string;
  mechanicId?: string | null;
  status?: ServiceOrderStatus;
  approvedAt?: Date | null;
  totalAmount?: number;
  serviceItems?: ServiceItem[];
  partItems?: PartItem[];
  serviceStartedAt?: Date | null;
  serviceFinishedAt?: Date | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export function makeServiceOrder(overrides: MakeServiceOrderOverrides = {}): ServiceOrder {
  return ServiceOrder.reconstitute({
    id: overrides.id ?? randomUUID(),
    vehicleId: overrides.vehicleId ?? randomUUID(),
    description: overrides.description ?? 'Ruído no motor',
    mechanicId: overrides.mechanicId ?? null,
    status: overrides.status ?? ServiceOrderStatus.RECEIVED,
    approvedAt: overrides.approvedAt ?? null,
    totalAmount: overrides.totalAmount ?? 0,
    serviceItems: overrides.serviceItems ?? [],
    partItems: overrides.partItems ?? [],
    serviceStartedAt: overrides.serviceStartedAt ?? null,
    serviceFinishedAt: overrides.serviceFinishedAt ?? null,
    createdAt: overrides.createdAt ?? FIXED_DATE,
    updatedAt: overrides.updatedAt ?? FIXED_DATE,
    deletedAt: overrides.deletedAt ?? null,
  });
}

export function makeServiceItem(overrides: Partial<ServiceItem> = {}): ServiceItem {
  return ServiceItem.reconstitute({
    id: overrides.id ?? randomUUID(),
    serviceId: overrides.serviceId ?? randomUUID(),
    price: overrides.price ?? 100,
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  });
}

export function makePartItem(overrides: Partial<PartItem> = {}): PartItem {
  return PartItem.reconstitute({
    id: overrides.id ?? randomUUID(),
    inventoryId: overrides.inventoryId ?? randomUUID(),
    quantity: overrides.quantity ?? 1,
    unitPrice: overrides.unitPrice ?? 50,
    unitOfMeasure: overrides.unitOfMeasure ?? 'UNIT',
    createdAt: FIXED_DATE,
    updatedAt: FIXED_DATE,
  });
}

export function makeServiceOrderRepositoryMock(): jest.Mocked<ServiceOrderRepository> {
  return {
    save: jest.fn(),
    findById: jest.fn(),
    findAll: jest.fn(),
    findAverageExecutionTime: jest.fn(),
    lockForUpdate: jest.fn(),
  };
}

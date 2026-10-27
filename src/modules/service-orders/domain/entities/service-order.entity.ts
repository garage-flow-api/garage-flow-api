import { ServiceOrderStatus } from '@service-orders/domain/value-objects/service-order-status.vo';
import { type ServiceItem } from '@service-orders/domain/entities/service-item.entity';
import { type PartItem } from '@service-orders/domain/entities/part-item.entity';
import { BusinessRuleError, ForbiddenError } from '@common/errors/domain.error';
import {
  BaseDeletableEntity,
  type BaseDeletableEntityProps,
} from '@common/entities/base-deletable.entity';

export interface ServiceOrderProps extends BaseDeletableEntityProps {
  vehicleId: string;
  description: string;
  mechanicId: string | null;
  status: ServiceOrderStatus;
  approvedAt: Date | null;
  totalAmount: number;
  serviceItems: ServiceItem[];
  partItems: PartItem[];
  serviceStartedAt: Date | null;
  serviceFinishedAt: Date | null;
}

export interface UpdateServiceOrderProps {
  vehicleId?: string;
  mechanicId?: string | null;
  status?: ServiceOrderStatus;
  approvedAt?: Date | null;
}

const ALLOWED_TRANSITIONS: Record<ServiceOrderStatus, ServiceOrderStatus[]> = {
  [ServiceOrderStatus.RECEIVED]: [ServiceOrderStatus.IN_DIAGNOSIS, ServiceOrderStatus.CANCELED],
  [ServiceOrderStatus.IN_DIAGNOSIS]: [
    ServiceOrderStatus.FINISHED_DIAGNOSIS,
    ServiceOrderStatus.CANCELED,
  ],
  [ServiceOrderStatus.FINISHED_DIAGNOSIS]: [
    ServiceOrderStatus.AWAITING_APPROVAL,
    ServiceOrderStatus.CANCELED,
  ],
  [ServiceOrderStatus.AWAITING_APPROVAL]: [
    ServiceOrderStatus.AWAITING_EXECUTION,
    ServiceOrderStatus.CANCELED,
  ],
  [ServiceOrderStatus.AWAITING_EXECUTION]: [
    ServiceOrderStatus.IN_EXECUTION,
    ServiceOrderStatus.CANCELED,
  ],
  [ServiceOrderStatus.IN_EXECUTION]: [ServiceOrderStatus.FINISHED, ServiceOrderStatus.CANCELED],
  [ServiceOrderStatus.FINISHED]: [ServiceOrderStatus.DELIVERED],
  [ServiceOrderStatus.DELIVERED]: [],
  [ServiceOrderStatus.CANCELED]: [],
};

export class ServiceOrder extends BaseDeletableEntity {
  private _vehicleId: string;
  private readonly _description: string;
  private _mechanicId: string | null;
  private _status: ServiceOrderStatus;
  private _approvedAt: Date | null;
  private _totalAmount: number;
  private _serviceItems: ServiceItem[];
  private _partItems: PartItem[];
  private _serviceStartedAt: Date | null;
  private _serviceFinishedAt: Date | null;

  private constructor(props: ServiceOrderProps) {
    super(props);
    this._vehicleId = props.vehicleId;
    this._description = props.description;
    this._mechanicId = props.mechanicId;
    this._status = props.status;
    this._approvedAt = props.approvedAt;
    this._totalAmount = props.totalAmount;
    this._serviceItems = props.serviceItems;
    this._partItems = props.partItems;
    this._serviceStartedAt = props.serviceStartedAt;
    this._serviceFinishedAt = props.serviceFinishedAt;
  }

  static create(
    vehicleId: string,
    description: string,
    serviceItems: ServiceItem[],
    partItems: PartItem[],
    totalAmount: number,
  ): ServiceOrder {
    const now = new Date();

    return new ServiceOrder({
      id: crypto.randomUUID(),
      vehicleId,
      description,
      mechanicId: null,
      status: ServiceOrderStatus.RECEIVED,
      approvedAt: null,
      totalAmount,
      serviceItems,
      partItems,
      serviceStartedAt: null,
      serviceFinishedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static reconstitute(props: ServiceOrderProps): ServiceOrder {
    return new ServiceOrder(props);
  }

  get vehicleId(): string {
    return this._vehicleId;
  }

  get description(): string {
    return this._description;
  }

  get mechanicId(): string | null {
    return this._mechanicId;
  }

  get status(): ServiceOrderStatus {
    return this._status;
  }

  get approvedAt(): Date | null {
    return this._approvedAt;
  }

  get totalAmount(): number {
    return this._totalAmount;
  }

  get serviceItems(): ServiceItem[] {
    return this._serviceItems;
  }

  get partItems(): PartItem[] {
    return this._partItems;
  }

  get serviceStartedAt(): Date | null {
    return this._serviceStartedAt;
  }

  get serviceFinishedAt(): Date | null {
    return this._serviceFinishedAt;
  }

  updateStatus(newStatus: ServiceOrderStatus): void {
    this.assertCanTransitionTo(newStatus);
    this._status = newStatus;
    this.touch();
  }

  private assertCanTransitionTo(newStatus: ServiceOrderStatus): void {
    if (!ALLOWED_TRANSITIONS[this._status].includes(newStatus)) {
      throw new BusinessRuleError(
        `Invalid service order status transition: ${this._status} -> ${newStatus}`,
      );
    }
  }

  private assertAssignedMechanic(mechanicId: string, action: 'start' | 'finish'): void {
    if (this._mechanicId !== mechanicId) {
      throw new ForbiddenError(`Only the mechanic assigned to the service order can ${action} it`);
    }
  }

  canAccessBudget(): boolean {
    return ![ServiceOrderStatus.RECEIVED, ServiceOrderStatus.IN_DIAGNOSIS].includes(this._status);
  }

  startDiagnosis(mechanicId: string): void {
    this.updateStatus(ServiceOrderStatus.IN_DIAGNOSIS);
    this._mechanicId = mechanicId;
  }

  addServicesAndParts(
    serviceItems: ServiceItem[],
    partItems: PartItem[],
    totalAmount: number,
  ): void {
    this._serviceItems = [...this._serviceItems, ...serviceItems];
    this._partItems = [...this._partItems, ...partItems];
    this._totalAmount = totalAmount;
    this.touch();
  }

  finishDiagnosis(mechanicId: string): void {
    this.assertCanTransitionTo(ServiceOrderStatus.FINISHED_DIAGNOSIS);
    this.assertAssignedMechanic(mechanicId, 'finish');
    this.updateStatus(ServiceOrderStatus.FINISHED_DIAGNOSIS);
  }

  submitBudgetForApproval(): void {
    this.updateStatus(ServiceOrderStatus.AWAITING_APPROVAL);
  }

  approveBudget(approvedAt = new Date()): void {
    this.updateStatus(ServiceOrderStatus.AWAITING_EXECUTION);
    this._approvedAt = approvedAt;
  }

  cancelService(): void {
    this.updateStatus(ServiceOrderStatus.CANCELED);
    this._approvedAt = null;
  }

  startService(mechanicId: string, startedAt = new Date()): void {
    this.assertCanTransitionTo(ServiceOrderStatus.IN_EXECUTION);
    this.assertAssignedMechanic(mechanicId, 'start');

    this.updateStatus(ServiceOrderStatus.IN_EXECUTION);
    this._serviceStartedAt = startedAt;
  }

  finishService(mechanicId: string, finishedAt = new Date()): void {
    this.assertCanTransitionTo(ServiceOrderStatus.FINISHED);
    this.assertAssignedMechanic(mechanicId, 'finish');

    this.updateStatus(ServiceOrderStatus.FINISHED);
    this._serviceFinishedAt = finishedAt;
  }

  deliver(): void {
    this.updateStatus(ServiceOrderStatus.DELIVERED);
  }

  update(props: UpdateServiceOrderProps): void {
    if (props.vehicleId !== undefined) this._vehicleId = props.vehicleId;
    if (props.mechanicId !== undefined) this._mechanicId = props.mechanicId;
    if (props.approvedAt !== undefined) this._approvedAt = props.approvedAt;
    if (props.status !== undefined) this.updateStatus(props.status);
    this.touch();
  }
}

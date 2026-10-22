import { DomainError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';
import { ServiceOrderRepository } from '@service-orders/domain/repositories/service-order.repository';

export interface AverageExecutionTimeQuery {
  from?: Date;
  to?: Date;
}

export interface AverageExecutionTimeResult {
  averageExecutionTimeMinutes: number;
  averageExecutionTimeFormatted: string;
  completedServiceOrders: number;
}

@Injectable()
export class GetAverageExecutionTimeUseCase {
  constructor(private readonly serviceOrderRepository: ServiceOrderRepository) {}

  async execute(query: AverageExecutionTimeQuery): Promise<AverageExecutionTimeResult> {
    const { from, to } = query;

    if (from && to && from > to) {
      throw new DomainError('FROM must be earlier than or equal to TO');
    }

    const metrics = await this.serviceOrderRepository.findAverageExecutionTime(
      from,
      to ? this.addOneDay(to) : undefined,
    );
    const average = metrics.averageExecutionTimeMinutes ?? 0;
    const averageExecutionTimeMinutes = Math.round(average * 10) / 10;

    return {
      averageExecutionTimeMinutes,
      averageExecutionTimeFormatted: this.formatMinutes(averageExecutionTimeMinutes),
      completedServiceOrders: metrics.completedServiceOrders,
    };
  }

  private addOneDay(date: Date): Date {
    const nextDay = new Date(date);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    return nextDay;
  }

  private formatMinutes(minutes: number): string {
    const roundedMinutes = Math.round(minutes);
    const hours = Math.floor(roundedMinutes / 60);
    const remainingMinutes = roundedMinutes % 60;
    if (hours === 0) return `${remainingMinutes}min`;
    return `${hours}h ${remainingMinutes}min`;
  }
}

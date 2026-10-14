import { Injectable } from '@nestjs/common';
import { TransactionRunner } from '@common/application/transaction-runner';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { PrismaTransactionContext } from '@infra/database/prisma/prisma-transaction-context';

@Injectable()
export class PrismaTransactionRunner extends TransactionRunner {
  constructor(
    private readonly prisma: PrismaService,
    private readonly context: PrismaTransactionContext,
  ) {
    super();
  }

  run<T>(work: () => Promise<T>): Promise<T> {
    if (this.context.current) return work();
    return this.prisma.$transaction((tx) => this.context.run(tx, work));
  }
}

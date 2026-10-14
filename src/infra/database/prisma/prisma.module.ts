import { Global, Module } from '@nestjs/common';
import { TransactionRunner } from '@common/application/transaction-runner';
import { PrismaService } from './prisma.service';
import { PrismaTransactionContext } from './prisma-transaction-context';
import { PrismaTransactionRunner } from './prisma-transaction-runner';

@Global()
@Module({
  providers: [
    PrismaService,
    PrismaTransactionContext,
    PrismaTransactionRunner,
    { provide: TransactionRunner, useExisting: PrismaTransactionRunner },
  ],
  exports: [PrismaService, PrismaTransactionContext, TransactionRunner],
})
export class PrismaModule {}

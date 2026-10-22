import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { type Prisma } from '@generated/prisma/client';

@Injectable()
export class PrismaTransactionContext {
  private readonly storage = new AsyncLocalStorage<Prisma.TransactionClient>();

  get current(): Prisma.TransactionClient | undefined {
    return this.storage.getStore();
  }

  run<T>(tx: Prisma.TransactionClient, work: () => Promise<T>): Promise<T> {
    return this.storage.run(tx, work);
  }
}

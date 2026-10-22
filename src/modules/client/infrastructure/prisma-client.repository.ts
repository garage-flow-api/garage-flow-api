import { Injectable } from '@nestjs/common';
import { type Prisma } from '@generated/prisma/client';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { PrismaTransactionContext } from '@infra/database/prisma/prisma-transaction-context';
import { ClientRepository } from '@client/domain/repositories/client.repository';
import { ClientEntity } from '@client/domain/entities/client.entity';
import { ClientMapper } from '@client/infrastructure/client.mapper';

@Injectable()
export class PrismaClientRepository implements ClientRepository {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactionContext: PrismaTransactionContext,
  ) {}

  /** Usa a transação corrente, se houver; senão, o cliente Prisma normal. */
  private get db(): Prisma.TransactionClient {
    return this.transactionContext.current ?? this.prisma;
  }

  async create(client: ClientEntity): Promise<ClientEntity> {
    const raw = await this.db.client.create({
      data: ClientMapper.toPrisma(client),
    });
    return ClientMapper.toDomain(raw);
  }

  async findAll(): Promise<ClientEntity[]> {
    const raws = await this.db.client.findMany({
      where: { deleted_at: null },
    });
    return raws.map(ClientMapper.toDomain);
  }

  async findById(id: string): Promise<ClientEntity | null> {
    const raw = await this.db.client.findFirst({
      where: { id, deleted_at: null },
    });
    if (!raw) return null;
    return ClientMapper.toDomain(raw);
  }

  async findByCpfCnpj(cpfCnpj: string): Promise<ClientEntity | null> {
    const raw = await this.db.client.findFirst({
      where: { cpfCnpj, deleted_at: null },
    });
    if (!raw) return null;
    return ClientMapper.toDomain(raw);
  }

  async update(client: ClientEntity): Promise<ClientEntity> {
    const raw = await this.db.client.update({
      where: { id: client.id },
      data: ClientMapper.toPrisma(client),
    });
    return ClientMapper.toDomain(raw);
  }

  async findByPhone(phone: string): Promise<ClientEntity | null> {
    const raw = await this.db.client.findUnique({ where: { phone } });
    return raw ? ClientMapper.toDomain(raw) : null; // use o mesmo mapper do findByCpfCnpj
  }
}

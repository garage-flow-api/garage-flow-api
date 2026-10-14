import { ConflictError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';
import { ClientRepository } from '@client/domain/repositories/client.repository';
import { ClientEntity } from '@client/domain/entities/client.entity';
import { CpfCnpj } from '@client/domain/value-objects/cpf-cnpj-validator.vo';

export interface CreateClientInput {
  cpfCnpj: string;
  name: string;
  phone: string;
  address: string;
  email?: string | null;
}

@Injectable()
export class CreateClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(input: CreateClientInput): Promise<ClientEntity> {
    const cpfCnpj = CpfCnpj.create(input.cpfCnpj);

    const clientWithSamePhone = await this.clientRepository.findByPhone(input.phone);
    if (clientWithSamePhone) {
      throw new ConflictError('Phone already registered for another client');
    }

    const existing = await this.clientRepository.findByCpfCnpj(cpfCnpj.value);
    if (existing) {
      throw new ConflictError(`Client with CPF/CNPJ ${cpfCnpj.format()} already exists`);
    }

    const now = new Date();

    const client = ClientEntity.create({
      id: randomUUID(),
      cpfCnpj,
      name: input.name,
      phone: input.phone,
      address: input.address,
      email: input.email,
      createdAt: now,
      updatedAt: now,
    });

    return this.clientRepository.create(client);
  }
}

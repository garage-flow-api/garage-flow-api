import { DomainError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ClientRepository } from '@client/domain/repositories/client.repository';
import { ClientEntity } from '@client/domain/entities/client.entity';
import { CpfCnpj } from '@client/domain/value-objects/cpf-cnpj-validator.vo';
import { CreateClientUseCase } from './create-client.use-case';

export interface EnsureClientInput {
  cpfCnpj: string;
  name?: string;
  phone?: string;
  address?: string;
  email?: string | null;
}

@Injectable()
export class EnsureClientUseCase {
  constructor(
    private readonly clientRepository: ClientRepository,
    private readonly createClient: CreateClientUseCase,
  ) {}

  async execute(input: EnsureClientInput): Promise<ClientEntity> {
    const cpfCnpj = CpfCnpj.create(input.cpfCnpj);

    const existing = await this.clientRepository.findByCpfCnpj(cpfCnpj.value);
    if (existing) return existing;

    const { name, phone, address } = input;
    if (!name || !phone || !address) {
      throw new DomainError(
        'name, phone and address are required when the client is not registered yet',
      );
    }

    return this.createClient.execute({
      cpfCnpj: input.cpfCnpj,
      name,
      phone,
      address,
      email: input.email,
    });
  }
}

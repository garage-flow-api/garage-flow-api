import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';
import { ClientRepository } from '@client/domain/repositories/client.repository';
import { ClientEntity } from '@client/domain/entities/client.entity';
import { CpfCnpj } from '@client/domain/value-objects/cpf-cnpj-validator.vo';

@Injectable()
export class FindClientByCpfCnpjUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(cpfCnpj: string): Promise<ClientEntity> {
    const normalized = CpfCnpj.create(cpfCnpj);
    const client = await this.clientRepository.findByCpfCnpj(normalized.value);
    if (!client) throw new NotFoundError('Client not found');
    return client;
  }
}

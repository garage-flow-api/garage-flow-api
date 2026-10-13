import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ClientRepository } from '@client/domain/repositories/client.repository';
import { ClientEntity, type UpdateClientProps } from '@client/domain/entities/client.entity';

@Injectable()
export class UpdateClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(id: string, input: UpdateClientProps): Promise<ClientEntity> {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundError(`Client with id ${id} not found`);
    }

    client.update(input);

    return this.clientRepository.update(client);
  }
}

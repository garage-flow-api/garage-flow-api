import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { ClientRepository } from '@client/domain/repositories/client.repository';

@Injectable()
export class DeleteClientUseCase {
  constructor(private readonly clientRepository: ClientRepository) {}

  async execute(id: string): Promise<void> {
    const client = await this.clientRepository.findById(id);
    if (!client) {
      throw new NotFoundError(`Client with id ${id} not found`);
    }

    client.softDelete();
    await this.clientRepository.update(client);
  }
}

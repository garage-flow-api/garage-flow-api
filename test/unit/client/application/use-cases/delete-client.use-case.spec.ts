import { NotFoundError } from '@common/errors/domain.error';

import { DeleteClientUseCase } from '@client/application/use-cases/delete-client.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { type ClientEntity } from '@client/domain/entities/client.entity';
import { makeClient, makeClientRepositoryMock } from '../../client.factory';

describe('DeleteClientUseCase', () => {
  let repository: jest.Mocked<ClientRepository>;
  let useCase: DeleteClientUseCase;

  beforeEach(() => {
    repository = makeClientRepositoryMock();
    repository.update.mockImplementation((client: ClientEntity) => Promise.resolve(client));
    useCase = new DeleteClientUseCase(repository);
  });

  it('faz soft delete e persiste em vez de apagar', async () => {
    const client = makeClient();
    repository.findById.mockResolvedValue(client);

    await useCase.execute(client.id);

    expect(client.isDeleted).toBe(true);
    expect(client.deletedAt).toBeInstanceOf(Date);
    expect(repository.update).toHaveBeenCalledWith(client);
  });

  it('lança 404 e não persiste quando o cliente não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

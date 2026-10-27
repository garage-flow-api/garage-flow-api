import { NotFoundError } from '@common/errors/domain.error';

import { FindClientByIdUseCase } from '@client/application/use-cases/find-client-by-id.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { makeClient, makeClientRepositoryMock } from '../../client.factory';

describe('FindClientByIdUseCase', () => {
  let repository: jest.Mocked<ClientRepository>;
  let useCase: FindClientByIdUseCase;

  beforeEach(() => {
    repository = makeClientRepositoryMock();
    useCase = new FindClientByIdUseCase(repository);
  });

  it('devolve o cliente encontrado', async () => {
    const client = makeClient();
    repository.findById.mockResolvedValue(client);

    await expect(useCase.execute(client.id)).resolves.toBe(client);
    expect(repository.findById).toHaveBeenCalledWith(client.id);
  });

  it('lança 404 quando o cliente não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente')).rejects.toThrow(NotFoundError);
  });
});

import { NotFoundError } from '@common/errors/domain.error';

import { UpdateClientUseCase } from '@client/application/use-cases/update-client.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { type ClientEntity } from '@client/domain/entities/client.entity';
import { makeClient, makeClientRepositoryMock } from '../../client.factory';

describe('UpdateClientUseCase', () => {
  let repository: jest.Mocked<ClientRepository>;
  let useCase: UpdateClientUseCase;

  beforeEach(() => {
    repository = makeClientRepositoryMock();
    repository.update.mockImplementation((client: ClientEntity) => Promise.resolve(client));
    useCase = new UpdateClientUseCase(repository);
  });

  it('aplica as alterações e persiste', async () => {
    const client = makeClient();
    repository.findById.mockResolvedValue(client);

    const updated = await useCase.execute(client.id, { name: 'Maria Souza', phone: '11888887777' });

    expect(updated.name).toBe('Maria Souza');
    expect(updated.phone).toBe('11888887777');
    expect(updated.address).toBe('Rua das Flores, 123');
    expect(repository.update).toHaveBeenCalledWith(client);
  });

  it('mantém o documento inalterado', async () => {
    const client = makeClient();
    repository.findById.mockResolvedValue(client);

    const updated = await useCase.execute(client.id, { name: 'Maria Souza' });

    expect(updated.cpfCnpj.value).toBe('52998224725');
  });

  it('lança 404 e não persiste quando o cliente não existe', async () => {
    repository.findById.mockResolvedValue(null);

    await expect(useCase.execute('inexistente', { name: 'Maria' })).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });
});

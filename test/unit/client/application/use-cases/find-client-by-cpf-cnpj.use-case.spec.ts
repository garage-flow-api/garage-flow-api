import { NotFoundError } from '@common/errors/domain.error';

import { FindClientByCpfCnpjUseCase } from '@client/application/use-cases/find-client-by-cpf-cnpj.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { InvalidCpfCnpjError } from '@client/domain/value-objects/cpf-cnpj-validator.vo';
import { makeClient, makeClientRepositoryMock } from '../../client.factory';

describe('FindClientByCpfCnpjUseCase', () => {
  let repository: jest.Mocked<ClientRepository>;
  let useCase: FindClientByCpfCnpjUseCase;

  beforeEach(() => {
    repository = makeClientRepositoryMock();
    useCase = new FindClientByCpfCnpjUseCase(repository);
  });

  it('devolve o cliente encontrado ao informar apenas os dígitos', async () => {
    const client = makeClient({ cpfCnpj: '52998224725' });
    repository.findByCpfCnpj.mockResolvedValue(client);

    await expect(useCase.execute('52998224725')).resolves.toBe(client);
    expect(repository.findByCpfCnpj).toHaveBeenCalledWith('52998224725');
  });

  it('normaliza o CPF/CNPJ com pontuação antes de consultar o repositório', async () => {
    const client = makeClient({ cpfCnpj: '52998224725' });
    repository.findByCpfCnpj.mockResolvedValue(client);

    await expect(useCase.execute('529.982.247-25')).resolves.toBe(client);
    expect(repository.findByCpfCnpj).toHaveBeenCalledWith('52998224725');
  });

  it('lança 404 quando o cliente não existe', async () => {
    repository.findByCpfCnpj.mockResolvedValue(null);

    await expect(useCase.execute('52998224725')).rejects.toThrow(NotFoundError);
  });

  it('lança 400 quando o CPF/CNPJ é inválido', async () => {
    await expect(useCase.execute('123')).rejects.toThrow(InvalidCpfCnpjError);
    expect(repository.findByCpfCnpj).not.toHaveBeenCalled();
  });
});

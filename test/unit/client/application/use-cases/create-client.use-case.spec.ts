import { ConflictError } from '@common/errors/domain.error';

import { CreateClientUseCase } from '@client/application/use-cases/create-client.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { type ClientEntity } from '@client/domain/entities/client.entity';
import { InvalidCpfCnpjError } from '@client/domain/value-objects/cpf-cnpj-validator.vo';
import { makeClient, makeClientRepositoryMock } from '../../client.factory';

describe('CreateClientUseCase', () => {
  let repository: jest.Mocked<ClientRepository>;
  let useCase: CreateClientUseCase;

  const input = {
    cpfCnpj: '529.982.247-25',
    name: 'João da Silva',
    phone: '11999998888',
    address: 'Rua das Flores, 123',
    email: 'joao@email.com',
  };

  beforeEach(() => {
    repository = makeClientRepositoryMock();
    repository.create.mockImplementation((client: ClientEntity) => Promise.resolve(client));
    repository.findByCpfCnpj.mockResolvedValue(null);

    useCase = new CreateClientUseCase(repository);
  });

  it('cria o cliente e persiste apenas os dígitos do documento', async () => {
    const client = await useCase.execute(input);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(client.cpfCnpj.value).toBe('52998224725');
    expect(client.cpfCnpj.type).toBe('CPF');
    expect(client.name).toBe(input.name);
    expect(client.id).toEqual(expect.any(String));
    expect(client.deletedAt).toBeNull();
  });

  it('consulta duplicidade usando o documento normalizado', async () => {
    await useCase.execute(input);

    expect(repository.findByCpfCnpj).toHaveBeenCalledWith('52998224725');
  });

  it('guarda email nulo quando não informado', async () => {
    const client = await useCase.execute({ ...input, email: undefined });

    expect(client.email).toBeNull();
  });

  it('rejeita CPF/CNPJ inválido com 400 antes de tocar o repositório', async () => {
    await expect(useCase.execute({ ...input, cpfCnpj: '11111111111' })).rejects.toThrow(
      InvalidCpfCnpjError,
    );
    expect(repository.findByCpfCnpj).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejeita documento já cadastrado com 409', async () => {
    repository.findByCpfCnpj.mockResolvedValue({} as ClientEntity);

    await expect(useCase.execute(input)).rejects.toThrow(ConflictError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('deve lançar ConflictError se o telefone já estiver cadastrado', async () => {
    repository.findByPhone.mockResolvedValue(makeClient());

    await expect(useCase.execute(input)).rejects.toThrow(ConflictError);
    expect(repository.create).not.toHaveBeenCalled();
  });
});

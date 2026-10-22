import { DomainError } from '@common/errors/domain.error';
import { EnsureClientUseCase } from '@client/application/use-cases/ensure-client.use-case';
import { type CreateClientUseCase } from '@client/application/use-cases/create-client.use-case';
import { type ClientRepository } from '@client/domain/repositories/client.repository';
import { type ClientEntity } from '@client/domain/entities/client.entity';

describe('EnsureClientUseCase', () => {
  let repository: { findByCpfCnpj: jest.Mock };
  let createClient: { execute: jest.Mock };
  let useCase: EnsureClientUseCase;

  const cpfCnpj = '123.456.789-09';
  const existingClient = { id: 'client-1' } as ClientEntity;
  const newClient = { id: 'client-2' } as ClientEntity;

  beforeEach(() => {
    repository = { findByCpfCnpj: jest.fn().mockResolvedValue(null) };
    createClient = { execute: jest.fn().mockResolvedValue(newClient) };
    useCase = new EnsureClientUseCase(
      repository as unknown as ClientRepository,
      createClient as unknown as CreateClientUseCase,
    );
  });

  it('reaproveita o cliente existente sem cadastrar outro', async () => {
    repository.findByCpfCnpj.mockResolvedValue(existingClient);

    await expect(useCase.execute({ cpfCnpj })).resolves.toBe(existingClient);
    expect(createClient.execute).not.toHaveBeenCalled();
  });

  it('cadastra o cliente quando o CPF/CNPJ ainda não existe', async () => {
    const input = { cpfCnpj, name: 'João', phone: '11999999999', address: 'Rua A, 1' };

    await expect(useCase.execute(input)).resolves.toBe(newClient);
    expect(createClient.execute).toHaveBeenCalledWith(expect.objectContaining(input));
  });

  it.each(['name', 'phone', 'address'])('rejeita cliente novo sem %s', async (missing) => {
    const input: Record<string, string> = {
      cpfCnpj,
      name: 'João',
      phone: '11999999999',
      address: 'Rua A, 1',
    };
    delete input[missing];

    await expect(useCase.execute(input as never)).rejects.toThrow(DomainError);
    expect(createClient.execute).not.toHaveBeenCalled();
  });

  it('rejeita CPF/CNPJ inválido sem consultar o banco', async () => {
    await expect(useCase.execute({ cpfCnpj: '123' })).rejects.toThrow(DomainError);
    expect(repository.findByCpfCnpj).not.toHaveBeenCalled();
  });
});

import { randomUUID } from 'crypto';
import { ClientEntity } from '@client/domain/entities/client.entity';
import { CpfCnpj } from '@client/domain/value-objects/cpf-cnpj-validator.vo';
import { type ClientRepository } from '@client/domain/repositories/client.repository';

/** Data fixa no passado para que `touch()` sempre produza um `updatedAt` maior. */
export const FIXED_DATE = new Date('2026-01-01T00:00:00.000Z');

export interface MakeClientOverrides {
  id?: string;
  cpfCnpj?: string;
  name?: string;
  phone?: string;
  address?: string;
  email?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
  deletedAt?: Date | null;
}

export function makeClient(overrides: MakeClientOverrides = {}): ClientEntity {
  return ClientEntity.create({
    id: overrides.id ?? randomUUID(),
    cpfCnpj: CpfCnpj.create(overrides.cpfCnpj ?? '52998224725'),
    name: overrides.name ?? 'João da Silva',
    phone: overrides.phone ?? '11999998888',
    address: overrides.address ?? 'Rua das Flores, 123',
    email: overrides.email === undefined ? 'joao@email.com' : overrides.email,
    createdAt: overrides.createdAt ?? FIXED_DATE,
    updatedAt: overrides.updatedAt ?? FIXED_DATE,
    deletedAt: overrides.deletedAt ?? null,
  });
}

export function makeClientRepositoryMock(): jest.Mocked<ClientRepository> {
  return {
    create: jest.fn(),
    findAll: jest.fn(),
    findById: jest.fn(),
    findByCpfCnpj: jest.fn(),
    update: jest.fn(),
    findByPhone: jest.fn(),
  };
}

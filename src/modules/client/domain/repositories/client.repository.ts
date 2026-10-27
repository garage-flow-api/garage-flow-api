import { type ClientEntity } from '@client/domain/entities/client.entity';

export abstract class ClientRepository {
  abstract create(client: ClientEntity): Promise<ClientEntity>;
  abstract findAll(): Promise<ClientEntity[]>;
  abstract findById(id: string): Promise<ClientEntity | null>;
  abstract findByCpfCnpj(cpfCnpj: string): Promise<ClientEntity | null>;
  abstract update(client: ClientEntity): Promise<ClientEntity>;
  abstract findByPhone(phone: string): Promise<ClientEntity | null>;
}

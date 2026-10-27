import { Module } from '@nestjs/common';
import { ClientController } from '@client/presentation/client.controller';
import { CreateClientUseCase } from '@client/application/use-cases/create-client.use-case';
import { FindAllClientsUseCase } from '@client/application/use-cases/find-all-clients.use-case';
import { FindClientByIdUseCase } from '@client/application/use-cases/find-client-by-id.use-case';
import { UpdateClientUseCase } from '@client/application/use-cases/update-client.use-case';
import { DeleteClientUseCase } from '@client/application/use-cases/delete-client.use-case';
import { ClientRepository } from '@client/domain/repositories/client.repository';
import { PrismaClientRepository } from '@client/infrastructure/prisma-client.repository';
import { FindClientByCpfCnpjUseCase } from '@client/application/use-cases/find-client-by-cpf-cnpj.use-case';
import { PrismaService } from '@infra/database/prisma/prisma.service';
import { EnsureClientUseCase } from './application/use-cases/ensure-client.use-case';

@Module({
  controllers: [ClientController],
  providers: [
    PrismaService,
    {
      provide: ClientRepository,
      useClass: PrismaClientRepository,
    },
    CreateClientUseCase,
    FindAllClientsUseCase,
    FindClientByIdUseCase,
    UpdateClientUseCase,
    DeleteClientUseCase,
    FindClientByCpfCnpjUseCase,
    EnsureClientUseCase,
  ],
  exports: [
    ClientRepository,
    FindClientByIdUseCase,
    FindAllClientsUseCase,
    FindClientByCpfCnpjUseCase,
    EnsureClientUseCase,
  ],
})
export class ClientModule {}

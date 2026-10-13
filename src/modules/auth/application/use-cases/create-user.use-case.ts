import { ConflictError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { randomUUID } from 'node:crypto';

import { User, UserRole } from '@auth/domain/entities/user.entity';

import { UserRepository } from '@auth/domain/repositories/user.repository';

import { BcryptPasswordHasher } from '@auth/infrastructure/security/bcrypt-password-hasher';

interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

@Injectable()
export class CreateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: BcryptPasswordHasher,
  ) {}

  async execute(input: CreateUserInput): Promise<User> {
    const existingUser = await this.userRepository.findByEmail(input.email);

    if (existingUser) {
      throw new ConflictError('User already exists');
    }

    const passwordHash = await this.passwordHasher.hash(input.password);

    const now = new Date();

    const user = User.create({
      id: randomUUID(),
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    });

    return this.userRepository.create(user);
  }
}

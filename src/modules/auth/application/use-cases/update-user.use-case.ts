import { ConflictError, NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { User, UserRole } from '@auth/domain/entities/user.entity';

import { UserRepository } from '@auth/domain/repositories/user.repository';

import { BcryptPasswordHasher } from '@auth/infrastructure/security/bcrypt-password-hasher';

interface UpdateUserInput {
  id: string;
  name?: string;
  email?: string;
  password?: string;
  role?: UserRole;
}

@Injectable()
export class UpdateUserUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: BcryptPasswordHasher,
  ) {}

  async execute(input: UpdateUserInput): Promise<User> {
    const user = await this.userRepository.findById(input.id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (input.email !== undefined) {
      const existingUser = await this.userRepository.findByEmail(input.email);

      if (existingUser) {
        throw new ConflictError('User already exists');
      }
    }

    const passwordHash =
      input.password !== undefined ? await this.passwordHasher.hash(input.password) : undefined;

    user.update({
      name: input.name,
      email: input.email,
      role: input.role,
      passwordHash,
    });

    return this.userRepository.update(user);
  }
}

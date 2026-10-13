import { NotFoundError, UnauthorizedError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { JwtService } from '@nestjs/jwt';

import { User } from '@auth/domain/entities/user.entity';
import { UserRepository } from '@auth/domain/repositories/user.repository';
import { BcryptPasswordHasher } from '@auth/infrastructure/security/bcrypt-password-hasher';

interface LoginInput {
  email: string;
  password: string;
}

export interface LoginOutput {
  access_token: string;
  user: User;
}

@Injectable()
export class LoginUseCase {
  constructor(
    private readonly userRepository: UserRepository,
    private readonly passwordHasher: BcryptPasswordHasher,
    private readonly jwtService: JwtService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    const user = await this.userRepository.findByEmail(input.email);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    const isPasswordValid = await this.passwordHasher.compare(input.password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const access_token = this.jwtService.sign({
      sub: user.id,
      role: user.role,
    });

    return {
      access_token,
      user,
    };
  }
}

import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { User } from '@auth/domain/entities/user.entity';
import { UserRepository } from '@auth/domain/repositories/user.repository';

@Injectable()
export class GetUserByEmailUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(email: string): Promise<User> {
    const user = await this.userRepository.findByEmail(email);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    return user;
  }
}

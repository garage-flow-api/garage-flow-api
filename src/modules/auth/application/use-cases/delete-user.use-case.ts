import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { UserRepository } from '@auth/domain/repositories/user.repository';

@Injectable()
export class DeleteUserUseCase {
  constructor(private readonly userRepository: UserRepository) {}

  async execute(id: string): Promise<void> {
    const user = await this.userRepository.findById(id);

    if (!user) {
      throw new NotFoundError('User not found');
    }

    user.softDelete();
    await this.userRepository.update(user);
  }
}

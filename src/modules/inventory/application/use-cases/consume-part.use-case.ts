import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { Part } from '@inventory/domain/entities/part.entity';
import { PartRepository } from '@inventory/domain/repositories/part.repository';

@Injectable()
export class ConsumePartUseCase {
  constructor(private readonly partRepository: PartRepository) {}

  async execute(id: string, quantityUsed: number): Promise<Part> {
    const part = await this.partRepository.findById(id);
    if (!part) throw new NotFoundError('Part not found');

    part.consume(quantityUsed);
    await this.partRepository.save(part);
    return part;
  }
}

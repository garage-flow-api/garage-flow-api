import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { Part } from '@inventory/domain/entities/part.entity';
import { PartRepository } from '@inventory/domain/repositories/part.repository';

@Injectable()
export class FindPartsByIdListUseCase {
  constructor(private readonly partRepository: PartRepository) {}

  async execute(idList: string[]): Promise<Part[]> {
    const parts = await this.partRepository.findByIdList(idList);
    if (!parts || parts.length === 0) {
      throw new NotFoundError(`No parts found with ids ${idList.join(', ')}`);
    }
    return parts;
  }
}

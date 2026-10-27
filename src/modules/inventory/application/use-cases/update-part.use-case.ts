import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { Part } from '@inventory/domain/entities/part.entity';
import { PartRepository } from '@inventory/domain/repositories/part.repository';
import { Quantity } from '@inventory/domain/value-objects/quantity.vo';
import { UpdatePartDto } from '@inventory/presentation/dtos/update-part.dto';

@Injectable()
export class UpdatePartUseCase {
  constructor(private readonly partRepository: PartRepository) {}

  async execute(id: string, dto: UpdatePartDto): Promise<Part> {
    const part = await this.partRepository.findById(id);
    if (!part) throw new NotFoundError('Part not found');

    part.updateDetails(
      dto.name,
      dto.unitPrice,
      dto.minQuantity === undefined ? undefined : new Quantity(dto.minQuantity),
    );
    await this.partRepository.save(part);
    return part;
  }
}

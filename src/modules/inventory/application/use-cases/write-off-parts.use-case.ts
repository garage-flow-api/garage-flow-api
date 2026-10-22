import { NotFoundError } from '@common/errors/domain.error';
import { Injectable } from '@nestjs/common';

import { Part } from '@inventory/domain/entities/part.entity';
import { PartRepository } from '@inventory/domain/repositories/part.repository';

export interface PartWriteOff {
  inventoryId: string;
  quantity: number;
}

/**
 * Baixa definitiva de peças no estoque, usada quando o serviço é finalizado.
 * Carrega todas as peças antes de gravar qualquer uma, para não deixar baixa
 * pela metade se algum id não existir.
 */
@Injectable()
export class WriteOffPartsUseCase {
  constructor(private readonly partRepository: PartRepository) {}

  async execute(items: PartWriteOff[]): Promise<Part[]> {
    if (items.length === 0) return [];

    const parts = await Promise.all(
      items.map(async (item) => {
        const part = await this.partRepository.findById(item.inventoryId);
        if (!part) {
          throw new NotFoundError(`Part ${item.inventoryId} not found`);
        }
        return { part, quantity: item.quantity };
      }),
    );

    for (const { part, quantity } of parts) {
      part.writeOff(quantity);
    }

    await Promise.all(parts.map(({ part }) => this.partRepository.save(part)));

    return parts.map(({ part }) => part);
  }
}

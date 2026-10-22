import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { CreatePartUseCase } from '@inventory/application/use-cases/create-part.use-case';
import { RestockPartUseCase } from '@inventory/application/use-cases/restock-part.use-case';
import { ConsumePartUseCase } from '@inventory/application/use-cases/consume-part.use-case';
import { ListPartsUseCase } from '@inventory/application/use-cases/list-parts.use-case';
import { ListLowStockPartsUseCase } from '@inventory/application/use-cases/list-low-stock-parts.use-case';
import { UpdatePartUseCase } from '@inventory/application/use-cases/update-part.use-case';
import { DeletePartUseCase } from '@inventory/application/use-cases/delete-part.use-case';
import { CreatePartDto } from '@inventory/presentation/dtos/create-part.dto';
import { RestockPartDto } from '@inventory/presentation/dtos/restock-part.dto';
import { UpdatePartDto } from '@inventory/presentation/dtos/update-part.dto';
import { ConsumePartDto } from '@inventory/presentation/dtos/consume-part.dto';
import { LowStockPartResponseDto } from '@inventory/presentation/dtos/low-stock-part-response.dto';
import { PartResponseDto } from '@inventory/presentation/dtos/part-response.dto';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dtos/error-response.dto';

@ApiTags('inventory')
@Controller('inventory')
export class InventoryController {
  constructor(
    private readonly createPart: CreatePartUseCase,
    private readonly restockPart: RestockPartUseCase,
    private readonly consumePart: ConsumePartUseCase,
    private readonly listParts: ListPartsUseCase,
    private readonly listLowStockParts: ListLowStockPartsUseCase,
    private readonly updatePart: UpdatePartUseCase,
    private readonly deletePart: DeletePartUseCase,
  ) {}

  @Post()
  @ApiAuth('ADMIN', 'STOCK_CLERK')
  @ApiOperation({
    summary: 'Creates a new inventory item',
  })
  @ApiCreatedResponse({ type: PartResponseDto, description: 'Inventory item created successfully' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid inventory item payload' })
  async create(@Body() dto: CreatePartDto): Promise<PartResponseDto> {
    const part = await this.createPart.execute(dto);
    return PartResponseDto.fromEntity(part);
  }

  @Get()
  @ApiAuth()
  @ApiOperation({
    summary: 'List all inventory items',
  })
  @ApiOkResponse({ type: [PartResponseDto], description: 'Inventory items returned successfully' })
  async findAll(): Promise<PartResponseDto[]> {
    const parts = await this.listParts.execute();
    return parts.map(PartResponseDto.fromEntity);
  }

  @Get('low-stock')
  @ApiAuth('ADMIN', 'STOCK_CLERK')
  @ApiOperation({
    summary: 'Lists inventory items whose logical stock is below the configured minimum',
    description:
      'Logical stock subtracts from the physical quantity everything already committed to ' +
      'service orders that are still open (RECEIVED, IN_DIAGNOSIS, AWAITING_APPROVAL, IN_EXECUTION).',
  })
  @ApiOkResponse({ type: [LowStockPartResponseDto] })
  async findLowStock(): Promise<LowStockPartResponseDto[]> {
    const lowStockParts = await this.listLowStockParts.execute();
    return lowStockParts.map(LowStockPartResponseDto.fromStockLevel);
  }

  @Patch(':id')
  @ApiAuth('ADMIN', 'STOCK_CLERK')
  @ApiOperation({
    summary: 'Updates an inventory item by ID',
  })
  @ApiOkResponse({ type: PartResponseDto, description: 'Inventory item updated successfully' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid inventory item payload' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Inventory item not found' })
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePartDto,
  ): Promise<PartResponseDto> {
    const part = await this.updatePart.execute(id, dto);
    return PartResponseDto.fromEntity(part);
  }

  @Patch(':id/restock')
  @ApiAuth('ADMIN', 'STOCK_CLERK')
  @ApiOperation({
    summary: 'Adds quantity to an inventory item',
  })
  @ApiOkResponse({ type: PartResponseDto, description: 'Inventory item restocked successfully' })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Invalid restock quantity' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Inventory item not found' })
  async restock(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RestockPartDto,
  ): Promise<PartResponseDto> {
    const part = await this.restockPart.execute(id, dto.quantity);
    return PartResponseDto.fromEntity(part);
  }

  @Patch(':id/consume')
  @ApiAuth('ADMIN', 'STOCK_CLERK')
  @ApiOperation({
    summary: 'Consumes quantity from an inventory item',
  })
  @ApiOkResponse({ type: PartResponseDto, description: 'Inventory item consumed successfully' })
  @ApiBadRequestResponse({
    type: ErrorResponseDto,
    description: 'Invalid quantity',
  })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Inventory item not found' })
  @ApiUnprocessableEntityResponse({
    type: ErrorResponseDto,
    description: 'Insufficient stock',
  })
  async consume(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConsumePartDto,
  ): Promise<PartResponseDto> {
    const part = await this.consumePart.execute(id, dto.quantity);
    return PartResponseDto.fromEntity(part);
  }

  @Delete(':id')
  @ApiAuth('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Deletes an inventory item by ID',
  })
  @ApiNoContentResponse({ description: 'Inventory item deleted successfully' })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'Inventory item not found' })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deletePart.execute(id);
  }
}

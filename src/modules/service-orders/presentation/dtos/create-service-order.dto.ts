import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { AddServicesAndPartsDto } from './add-services-and-parts.dto';

export class ClientInputDto {
  @ApiProperty({ example: '123.456.789-09', description: "Client's CPF or CNPJ" })
  @IsString()
  @IsNotEmpty()
  cpfCnpj!: string;

  @ApiPropertyOptional({
    example: 'João da Silva',
    description: 'Required when the client is not registered yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiPropertyOptional({
    example: '11999999999',
    description: 'Required when the client is not registered yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @ApiPropertyOptional({
    example: 'Rua das Flores, 100',
    description: 'Required when the client is not registered yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  address?: string;

  @ApiPropertyOptional({ example: 'joao@example.com' })
  @IsOptional()
  @IsEmail()
  email?: string;
}

export class VehicleInputDto {
  @ApiProperty({ example: 'ABC1D23', description: "Vehicle's license plate" })
  @IsString()
  @IsNotEmpty()
  licensePlate!: string;

  @ApiPropertyOptional({
    example: 'Fiat',
    description: 'Required when the vehicle is not registered yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  brand?: string;

  @ApiPropertyOptional({
    example: 'Uno',
    description: 'Required when the vehicle is not registered yet',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  model?: string;

  @ApiPropertyOptional({
    example: 2020,
    description: 'Required when the vehicle is not registered yet',
  })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  year?: number;
}

export class CreateServiceOrderDto extends PartialType(AddServicesAndPartsDto) {
  @ApiProperty({ type: ClientInputDto })
  @ValidateNested()
  @Type(() => ClientInputDto)
  client!: ClientInputDto;

  @ApiProperty({ type: VehicleInputDto })
  @ValidateNested()
  @Type(() => VehicleInputDto)
  vehicle!: VehicleInputDto;

  @ApiProperty({
    example: 'Barulho estranho ao freiar e vibração no volante em alta velocidade',
    description: 'Client complaint reported when the service order was opened',
  })
  @IsString()
  @IsNotEmpty()
  description!: string;
}

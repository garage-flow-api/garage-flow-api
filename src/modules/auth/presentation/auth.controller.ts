import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { CreateUserUseCase } from '@auth/application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '@auth/application/use-cases/delete-user.use-case';
import { GetUserByEmailUseCase } from '@auth/application/use-cases/get-user-by-email.use-case';
import { ListUsersUseCase } from '@auth/application/use-cases/list-users.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login-user.use-case';
import { UpdateUserUseCase } from '@auth/application/use-cases/update-user.use-case';
import { ParseEmailPipe } from '@common/pipes/parse-email.pipe';

import { CreateUserDto } from './dto/create-user.dto';
import { LoginDto } from './dto/login-user.dto';
import { LoginResponseDto } from './dto/login-user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { type UserRole } from '@auth/domain/entities/user.entity';
import { UserRole as PrismaUserRole } from '@generated/prisma/enums';
import { ApiAuth } from '@common/decorators/api-auth.decorator';
import { ErrorResponseDto } from '@common/dtos/error-response.dto';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly createUserUseCase: CreateUserUseCase,
    private readonly updateUserUseCase: UpdateUserUseCase,
    private readonly deleteUserUseCase: DeleteUserUseCase,
    private readonly loginUseCase: LoginUseCase,
    private readonly listUsersUseCase: ListUsersUseCase,
    private readonly getUserByEmailUseCase: GetUserByEmailUseCase,
  ) {}

  @Post('users')
  @ApiAuth('ADMIN')
  @ApiOperation({
    summary: 'Create a user',
  })
  @ApiCreatedResponse({
    type: UserResponseDto,
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'User already exists',
  })
  async createUser(@Body() dto: CreateUserDto): Promise<UserResponseDto> {
    const user = await this.createUserUseCase.execute(dto);

    return UserResponseDto.fromDomain(user);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login user and generate JWT token',
  })
  @ApiOkResponse({
    type: LoginResponseDto,
  })
  @ApiUnauthorizedResponse({
    type: ErrorResponseDto,
    description: 'Invalid email or password',
  })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    const { access_token, user } = await this.loginUseCase.execute({
      email: dto.email,
      password: dto.password,
    });

    return LoginResponseDto.create(access_token, user);
  }

  @Get('users')
  @ApiAuth()
  @ApiOperation({
    summary: 'List all users',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['ADMIN', 'MECHANIC', 'SERVICE_ADVISOR', 'STOCK_CLERK'],
    description: 'Filter users by role. Use MECHANIC to populate mechanic selectors.',
  })
  @ApiOkResponse({
    type: [UserResponseDto],
  })
  async listUsers(
    @Query('role', new ParseEnumPipe(PrismaUserRole, { optional: true })) role?: UserRole,
  ): Promise<UserResponseDto[]> {
    const users = role
      ? await this.listUsersUseCase.execute(role)
      : await this.listUsersUseCase.execute();

    return users.map(UserResponseDto.fromDomain);
  }

  @Get('users/:email')
  @ApiAuth()
  @ApiOperation({
    summary: 'Get a user by email',
  })
  @ApiOkResponse({
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'User not found',
  })
  async getUserByEmail(@Param('email', ParseEmailPipe) email: string): Promise<UserResponseDto> {
    const user = await this.getUserByEmailUseCase.execute(email);

    return UserResponseDto.fromDomain(user);
  }

  @Patch('users/:id')
  @ApiAuth('ADMIN')
  @ApiOperation({
    summary: 'Update a user',
  })
  @ApiOkResponse({
    type: UserResponseDto,
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'User not found',
  })
  @ApiConflictResponse({
    type: ErrorResponseDto,
    description: 'Another user already uses this email',
  })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const user = await this.updateUserUseCase.execute({
      id,
      ...dto,
    });

    return UserResponseDto.fromDomain(user);
  }

  @Delete('users/:id')
  @ApiAuth('ADMIN')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft delete a user',
  })
  @ApiNoContentResponse({
    description: 'User successfully deleted',
  })
  @ApiNotFoundResponse({
    type: ErrorResponseDto,
    description: 'User not found',
  })
  async deleteUser(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.deleteUserUseCase.execute(id);
  }
}

import { ConflictError, NotFoundError, UnauthorizedError } from '@common/errors/domain.error';

import { type JwtService } from '@nestjs/jwt';

import { User } from '@auth/domain/entities/user.entity';
import { type UserRepository } from '@auth/domain/repositories/user.repository';
import { type BcryptPasswordHasher } from '@auth/infrastructure/security/bcrypt-password-hasher';

import { CreateUserUseCase } from '@auth/application/use-cases/create-user.use-case';
import { DeleteUserUseCase } from '@auth/application/use-cases/delete-user.use-case';
import { GetUserByEmailUseCase } from '@auth/application/use-cases/get-user-by-email.use-case';
import { ListUsersUseCase } from '@auth/application/use-cases/list-users.use-case';
import { LoginUseCase } from '@auth/application/use-cases/login-user.use-case';
import { UpdateUserUseCase } from '@auth/application/use-cases/update-user.use-case';

describe('Auth Use Cases', () => {
  let repository: jest.Mocked<UserRepository>;
  let passwordHasher: jest.Mocked<BcryptPasswordHasher>;
  let jwtService: jest.Mocked<JwtService>;

  const createUser = () => {
    const now = new Date();

    return User.create({
      id: 'user-id',
      name: 'John Doe',
      email: 'john@example.com',
      passwordHash: 'hashed-password',
      role: 'MECHANIC',
      createdAt: now,
      updatedAt: now,
    });
  };

  beforeEach(() => {
    repository = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findByEmail: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    };

    passwordHasher = {
      hash: jest.fn(),
      compare: jest.fn(),
    } as unknown as jest.Mocked<BcryptPasswordHasher>;

    jwtService = {
      sign: jest.fn(),
    } as unknown as jest.Mocked<JwtService>;
  });

  describe('CreateUserUseCase', () => {
    it('should create a user', async () => {
      const user = createUser();
      repository.findByEmail.mockResolvedValue(null);
      passwordHasher.hash.mockResolvedValue('hashed-password');
      repository.create.mockResolvedValue(user);

      const useCase = new CreateUserUseCase(repository, passwordHasher);

      const result = await useCase.execute({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password',
        role: 'MECHANIC',
      });

      expect(passwordHasher.hash).toHaveBeenCalledWith('password');
      expect(repository.create).toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('should not create an existing user', async () => {
      repository.findByEmail.mockResolvedValue(createUser());

      const useCase = new CreateUserUseCase(repository, passwordHasher);

      const promise = useCase.execute({
        name: 'John Doe',
        email: 'john@example.com',
        password: 'password',
        role: 'MECHANIC',
      });

      await expect(promise).rejects.toThrow(ConflictError);
      await expect(promise).rejects.toThrow('User already exists');

      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('DeleteUserUseCase', () => {
    it('should soft delete a user', async () => {
      const user = createUser();
      repository.findById.mockResolvedValue(user);

      const useCase = new DeleteUserUseCase(repository);

      await useCase.execute(user.id);

      expect(user.isDeleted).toBe(true);
      expect(repository.update).toHaveBeenCalledWith(user);
    });

    it('should throw when user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      const useCase = new DeleteUserUseCase(repository);

      await expect(useCase.execute('user-id')).rejects.toThrow(NotFoundError);
    });
  });

  describe('GetUserByEmailUseCase', () => {
    it('should return the user', async () => {
      const user = createUser();
      repository.findByEmail.mockResolvedValue(user);

      const useCase = new GetUserByEmailUseCase(repository);

      await expect(useCase.execute(user.email)).resolves.toBe(user);
    });

    it('should throw when user does not exist', async () => {
      repository.findByEmail.mockResolvedValue(null);

      const useCase = new GetUserByEmailUseCase(repository);

      await expect(useCase.execute('unknown@email.com')).rejects.toThrow(NotFoundError);
    });
  });

  describe('ListUsersUseCase', () => {
    it('should return all users', async () => {
      const users = [createUser(), createUser()];
      repository.findAll.mockResolvedValue(users);

      const useCase = new ListUsersUseCase(repository);

      await expect(useCase.execute()).resolves.toBe(users);
      expect(repository.findAll).toHaveBeenCalledTimes(1);
    });
  });

  describe('LoginUseCase', () => {
    it('should login a user', async () => {
      const user = createUser();
      repository.findByEmail.mockResolvedValue(user);
      passwordHasher.compare.mockResolvedValue(true);
      jwtService.sign.mockReturnValue('jwt-token');

      const useCase = new LoginUseCase(repository, passwordHasher, jwtService);

      const result = await useCase.execute({
        email: user.email,
        password: 'password',
      });

      expect(passwordHasher.compare).toHaveBeenCalledWith('password', user.passwordHash);
      expect(jwtService.sign).toHaveBeenCalledWith({
        sub: user.id,
        role: user.role,
      });
      expect(result).toEqual({
        access_token: 'jwt-token',
        user,
      });
    });

    it('should reject invalid credentials', async () => {
      repository.findByEmail.mockResolvedValue(createUser());
      passwordHasher.compare.mockResolvedValue(false);

      const useCase = new LoginUseCase(repository, passwordHasher, jwtService);

      await expect(
        useCase.execute({
          email: 'john@example.com',
          password: 'wrong',
        }),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('UpdateUserUseCase', () => {
    it('should update user data', async () => {
      const user = createUser();
      repository.findById.mockResolvedValue(user);
      passwordHasher.hash.mockResolvedValue('new-hash');
      repository.update.mockResolvedValue(user);

      const useCase = new UpdateUserUseCase(repository, passwordHasher);

      const result = await useCase.execute({
        id: user.id,
        name: 'Jane Doe',
        email: 'jane@example.com',
        password: 'new-password',
        role: 'ADMIN',
      });

      expect(user.name).toBe('Jane Doe');
      expect(user.email).toBe('jane@example.com');
      expect(user.role).toBe('ADMIN');
      expect(user.passwordHash).toBe('new-hash');
      expect(repository.update).toHaveBeenCalledWith(user);
      expect(result).toBe(user);
    });

    it('should throw when user does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      const useCase = new UpdateUserUseCase(repository, passwordHasher);

      await expect(useCase.execute({ id: 'unknown-id', name: 'Jane Doe' })).rejects.toThrow(
        NotFoundError,
      );
    });
  });
});

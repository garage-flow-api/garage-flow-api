# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Garage Flow API — a NestJS/TypeScript backend for a mechanic-shop management system (PostgreSQL + Prisma). Single monolith, organized as bounded contexts with DDD layering. Comments/docs in the repo are mostly in Portuguese; code identifiers are in English.

## Commands

```bash
# Install & DB
npx prisma generate                 # regenerate the Prisma client into generated/prisma (run after schema.prisma changes or a fresh clone)
npm run db:migrate:dev              # create/apply a dev migration
npm run db:migrate:deploy           # apply pending migrations (prod)
npx prisma studio                   # data browser at localhost:5555 (requires DB running)

# Run
docker compose -f docker-compose.development.yaml up --build   # Postgres + API w/ hot reload, runs migrations+seed
npm run start:dev                   # API only, requires DB reachable via DATABASE_URL
npm run start:debug                 # with --inspect on 0.0.0.0:9229

# Quality gates (all three also run on `git push` via Husky)
npm run format:check / npm run format
npm run lint:check    / npm run lint
npm test                            # unit tests (test/unit/**/*.spec.ts)
npm run test:e2e                    # e2e tests, separate jest config (test/jest-e2e.json)
npm run test:cov

# Single test file / single test
npx jest --setupFiles dotenv/config test/unit/client/application/use-cases/create-client.use-case.spec.ts
npx jest --setupFiles dotenv/config -t "should create a client"
```

Integration tests live under `test/integration/**`. Most mock Prisma/use-cases entirely (no DB needed); the ones that exercise real Prisma/Postgres (e.g. `service-orders.controller.spec.ts`) do so against an ephemeral Postgres container started per-file via `testcontainers` (`test/support/postgres-test-container.ts`), migrated automatically and torn down in `afterAll` — no manually running `DATABASE_URL` is required, but Docker must be available. Each test truncates all tables in `beforeEach` (`test/support/truncate-database.ts`) and creates its own fixtures, so tests are atomic and order-independent. `npm run test:e2e` still expects a real reachable `DATABASE_URL` (and needs `test/jest-e2e.json`, which does not currently exist in this repo).

## Architecture

DDD in a layered monolith. Each bounded context lives under `src/modules/<name>/` with four layers:

```
src/modules/<name>/
├── domain/           # entities, value objects, repository interfaces (abstract classes) — no framework/Prisma imports
├── application/      # use-cases (one class per operation), orchestrate domain + repository
├── infrastructure/   # Prisma-backed repository implementation + mapper (domain entity <-> Prisma model)
└── presentation/     # NestJS controller + request/response DTOs (class-validator / class-transformer / Swagger)
```

Contexts (actual folder names, singular): `auth`, `client`, `vehicle`, `service`, `service-orders`, `inventory`. (README describes these as "Clients/Vehicles/..." — the code uses singular directory names.) Cross-cutting code lives outside `modules/`:

- `src/common/` — `BaseEntity` (shared id/timestamps/soft-delete), global `GlobalExceptionFilter`, shared pipes/decorators/guards.
- `src/infra/` — `PrismaModule`/`PrismaService` (DB access) and the `health` module; infrastructure not owned by a single bounded context.

### Path aliases

TS path aliases (`tsconfig.json`) and Jest `moduleNameMapper` (`package.json`) both define `@common/*`, `@auth/*`, `@client/*`, `@vehicle/*`, `@service/*`, `@service-orders/*`, `@inventory/*`, `@infra/*`, `@generated/prisma/*`. Always import via these aliases rather than relative paths across module boundaries; keep both configs in sync if a new context or alias is added.

### Domain entity pattern

Entities extend `BaseEntity` (`src/common/entities/base.entity.ts`): private constructor + static `create(props)` factory, all fields private with getters, mutations go through explicit methods (e.g. `update(...)`) that call `protected touch()` to bump `updatedAt`. Deletion is soft (`softDelete()` sets `deletedAt`); repositories filter `deleted_at: null` on reads. Value objects (e.g. `CpfCnpj`, `ServicePrice`, `Quantity`, `LicensePlate`) validate in their own `create()` and throw domain-specific error classes (e.g. `InvalidCpfCnpjError`).

### Error flow

Domain and application code throw `DomainError` or one of its subclasses from `src/common/errors/domain.error.ts` — never Nest `*Exception`s (an ESLint `no-restricted-imports` rule blocks them in `domain/` and `application/`). Value objects throw their own subclasses (e.g. `InvalidCpfCnpjError`, `InvalidLicensePlateError`). These propagate uncaught by default: `GlobalExceptionFilter` (`src/common/filters/global-exception.filter.ts`, registered in `main.ts`) is a catch-all — `HttpException`s pass through as-is, and a `DomainError` is answered with the domain message and a status chosen by its class:

| Error class | HTTP status |
|---|---|
| `NotFoundError` | 404 |
| `ConflictError` | 409 |
| `BusinessRuleError` | 422 |
| `UnauthorizedError` | 401 |
| `DomainError` and any other subclass | 400 |

Anything else becomes a 500 with a generic message. A use-case only adds its own `try/catch` when it needs to *change* that default outcome — e.g. `find-service-order-by-tracking-token.use-case.ts` turns the `InvalidTrackingTokenError` (400 by default) into a `NotFoundError` (404).

### Repository pattern

Each context defines an abstract repository class in `domain/repositories/`; `infrastructure/` provides a `Prisma*Repository` implementation. Modules wire the interface to the implementation via Nest's `useClass` provider (`{ provide: XRepository, useClass: PrismaXRepository }`) so use-cases depend only on the abstract type. A `*.mapper.ts` in `infrastructure/` converts between the Prisma model and the domain entity (`toDomain`/`toPrisma`).

### Auth & authorization

JWT-based (`@nestjs/passport` + `passport-jwt`). `JwtAuthGuard` (wraps Passport's `AuthGuard('jwt')`) authenticates; `RolesGuard` + `@Roles(...)` decorator (reading `UserRole` from `auth/domain/entities/user.entity.ts`) authorize. Controllers apply both explicitly per-route with `@UseGuards(JwtAuthGuard, RolesGuard)` and `@Roles(...)` — there is no global guard, so new protected endpoints must add these annotations themselves. Swagger auth is documented via `@ApiBearerAuth('access-token')`.

### Tests

Test tree under `test/` mirrors `src/modules/<name>/<layer>/...`, split into `test/unit/` (isolated, mocked dependencies) and `test/integration/` (real Prisma/Postgres, may span multiple contexts for cross-context flows). `*.factory.ts` files (e.g. `test/unit/client/client.factory.ts`) build fixture entities for reuse across specs.

You SHOULD NOT run tests unless specifically asked to, the user should decide if he wants to run the tests manually or not.

## Conventions

- Prettier: single quotes, semicolons, trailing commas, 100-char width, 2-space indent — enforced by `format:check` and Husky pre-push.
- ESLint: no `any`, `consistent-type-imports` (inline `import { type X }`), `eqeqeq`, `curly` on all blocks, unused vars must be prefixed `_`, and `max-lines-per-function` (80, warns) for non-test files.
- Prisma-generated client is emitted to `generated/prisma` (gitignored-style output dir, imported via `@generated/prisma/*`), not `node_modules/@prisma/client` — regenerate with `npx prisma generate` whenever `prisma/schema.prisma` changes.
- ESlint and Prettier should NOT be validated in prompts unless specifically asked
- Coverage: the tests should cover AT LEAST 80% of all lines of code

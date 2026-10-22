import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';

type SwaggerOperation = {
  get(key: string): string;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  configureGlobalBehavior(app);
  configureSwagger(app);

  await app.listen(process.env.PORT ?? 3000);
}

function configureGlobalBehavior(app: INestApplication): void {
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
}

function configureSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Garage Flow API')
    .setDescription('Garage Flow API')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Enter your JWT token',
      },
      'access-token',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document, {
    swaggerOptions: { operationsSorter: compareOperationsByMethodThenPath },
  });
}

/**
 * Ordena o Swagger por método (POST, GET, PUT, PATCH, DELETE) e depois por caminho.
 */
function compareOperationsByMethodThenPath(a: SwaggerOperation, b: SwaggerOperation): number {
  const methodOrder: Record<string, number> = {
    post: 1,
    get: 2,
    put: 3,
    patch: 4,
    delete: 5,
  };

  const methodDiff = methodOrder[a.get('method')] - methodOrder[b.get('method')];
  if (methodDiff !== 0) return methodDiff;

  return a.get('path').localeCompare(b.get('path'));
}

void bootstrap();

import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from '@common/filters/global-exception.filter';

type SwaggerOperation = {
  get(key: string): string;
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.useGlobalFilters(new GlobalExceptionFilter());

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

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
    swaggerOptions: {
      operationsSorter: (a: SwaggerOperation, b: SwaggerOperation) => {
        const methodOrder: Record<string, number> = {
          post: 1,
          get: 2,
          put: 3,
          patch: 4,
          delete: 5,
        };

        const methodA = a.get('method');
        const methodB = b.get('method');

        const methodDiff = methodOrder[methodA] - methodOrder[methodB];

        if (methodDiff !== 0) {
          return methodDiff;
        }

        return a.get('path').localeCompare(b.get('path'));
      },
    },
  });

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();

import 'reflect-metadata';
import { type INestApplication, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { config } from './config';

(BigInt.prototype as unknown as { toJSON: () => string }).toJSON = function () {
  return this.toString();
};

export async function createApp(opts: { logger?: boolean } = {}): Promise<INestApplication> {
  const c = config();
  const app = await NestFactory.create(AppModule, {
    logger: opts.logger === false ? false : ['log', 'warn', 'error'],
    bodyParser: false,
  });
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  app.use(cookieParser());
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.enableCors({ origin: c.WEB_ORIGIN.split(','), credentials: true });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  const doc = new DocumentBuilder()
    .setTitle('MediSchool — SGEE API')
    .setDescription('Sistema de Gestión de Enfermería Escolar. Errores en application/problem+json. POST críticos requieren Idempotency-Key.')
    .setVersion('1.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, doc, { operationIdFactory: (controller, method) => `${controller.replace('Controller', '')}_${method}` });
  (document as { openapi: string }).openapi = '3.1.0';
  SwaggerModule.setup('api/docs', app, document, { jsonDocumentUrl: 'api/openapi.json' });
  return app;
}

export async function start() {
  const c = config();
  process.env.TZ ||= 'America/Bogota';
  const app = await createApp();
  await app.listen(c.API_PORT, '0.0.0.0');
  Logger.log(`API http://localhost:${c.API_PORT}/api/v1 — docs /api/docs`, 'Bootstrap');
}

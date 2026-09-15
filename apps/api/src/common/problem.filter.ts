import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import { dbErrorCode } from '@sgee/db';
import type { Request, Response } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';

const TITLES: Record<number, string> = {
  400: 'Solicitud inválida',
  401: 'No autenticado',
  403: 'Prohibido',
  404: 'No encontrado',
  409: 'Conflicto',
  413: 'Archivo demasiado grande',
  415: 'Tipo de archivo no permitido',
  422: 'Datos inválidos',
  423: 'Bloqueado',
  429: 'Demasiadas solicitudes',
  500: 'Error interno',
  502: 'Servicio externo no disponible',
};

@Catch()
export class ProblemFilter implements ExceptionFilter {
  private readonly logger = new Logger('Problem');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request & { meta?: { requestId?: string } }>();
    if (!res || typeof res.status !== 'function') throw exception;

    let status = 500;
    let body: Record<string, unknown> = { code: 'INTERNAL_ERROR', detail: 'Ocurrió un error inesperado.' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const r = exception.getResponse();
      if (typeof r === 'string') body = { code: codeFor(status), detail: r };
      else {
        const o = r as Record<string, unknown>;
        body = {
          ...o,
          code: o.code ?? codeFor(status),
          detail: o.detail ?? (Array.isArray(o.message) ? o.message.join(', ') : o.message) ?? TITLES[status],
        };
        delete body.message;
        delete body.statusCode;
        delete body.error;
      }
    } else if (exception instanceof ZodError) {
      status = 422;
      body = {
        code: 'VALIDATION_ERROR',
        detail: 'Datos inválidos.',
        errors: exception.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      };
    } else {
      const db = dbErrorCode(exception);
      if (db === 'IMMUTABLE') {
        status = 409;
        body = { code: 'IMMUTABLE_RECORD', detail: 'El registro clínico está cerrado o anulado y no puede modificarse. Use una adenda o la anulación.' };
      } else if (db === 'INVALID_TRANSITION') {
        status = 409;
        body = { code: 'INVALID_TRANSITION', detail: 'Transición de estado no permitida.' };
      } else if (db === 'UNIQUE') {
        status = 409;
        body = { code: 'DUPLICATE', detail: 'Ya existe un registro con esos datos.' };
      } else if (db === 'CHECK' || db === 'FOREIGN_KEY') {
        status = 422;
        body = { code: 'INTEGRITY_ERROR', detail: 'Los datos no cumplen las reglas de integridad.' };
      }
    }

    const referenceId = req?.meta?.requestId ?? randomUUID();
    if (status >= 500) {
      this.logger.error(`[${referenceId}] ${(exception as Error)?.stack ?? String(exception)}`);
    }

    res
      .status(status)
      .type('application/problem+json')
      .json({
        type: `https://sgee.docs/errors/${String(body.code).toLowerCase()}`,
        title: TITLES[status] ?? 'Error',
        status,
        ...body,
        instance: req?.originalUrl,
        referenceId,
      });
  }
}

function codeFor(status: number) {
  return (
    { 400: 'BAD_REQUEST', 401: 'UNAUTHORIZED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 413: 'PAYLOAD_TOO_LARGE', 429: 'RATE_LIMITED' }[status] ??
    'ERROR'
  );
}

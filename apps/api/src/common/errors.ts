import { HttpException } from '@nestjs/common';

/** HttpException rendered as application/problem+json by ProblemFilter. */
export class Problem extends HttpException {
  constructor(status: number, code: string, detail: string, extra: Record<string, unknown> = {}) {
    super({ code, detail, ...extra }, status);
  }
}

export const notFound = (what = 'Recurso') => new Problem(404, 'NOT_FOUND', `${what} no encontrado.`);
export const forbidden = (detail = 'No tiene permiso para realizar esta acción.') => new Problem(403, 'FORBIDDEN', detail);
export const badRequest = (code: string, detail: string, extra?: Record<string, unknown>) => new Problem(400, code, detail, extra);
export const conflict = (code: string, detail: string, extra?: Record<string, unknown>) => new Problem(409, code, detail, extra);
export const unprocessable = (code: string, detail: string, extra?: Record<string, unknown>) => new Problem(422, code, detail, extra);
export const unauthorized = (detail = 'Sesión inválida o expirada.') => new Problem(401, 'UNAUTHORIZED', detail);

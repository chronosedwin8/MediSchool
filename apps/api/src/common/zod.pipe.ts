import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { Problem } from './errors';

export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): z.infer<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new Problem(422, 'VALIDATION_ERROR', 'Datos inválidos.', {
        errors: result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    return result.data;
  }
}

export const zp = <T extends ZodTypeAny>(schema: T) => new ZodPipe(schema);

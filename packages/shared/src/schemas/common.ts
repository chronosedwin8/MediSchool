import { z } from 'zod';

export const uuid = z.string().uuid();
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha YYYY-MM-DD');
export const dateLike = z.union([z.string().datetime({ offset: true }), isoDate, z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/)]);
export const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Hora HH:mm');
export const trimmed = (min = 1, max = 500) => z.string().trim().min(min).max(max);
export const optionalText = (max = 4000) => z.string().trim().max(max).optional().nullable();

export const paginationQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const dateRangeQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
});

export type Paginated<T> = { items: T[]; nextCursor: string | null };

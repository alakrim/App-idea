import type { ZodType } from 'zod';

export interface JsonColumnLocation {
  table: string;
  column: string;
  id: string;
}

/** Thrown when a stored JSON column is not valid JSON or does not match its zod schema. */
export class DbValidationError extends Error {
  readonly table: string;
  readonly column: string;
  readonly rowId: string;

  constructor(location: JsonColumnLocation, reason: string) {
    super(`Invalid ${location.table}.${location.column} for row ${location.id}: ${reason}`);
    this.name = 'DbValidationError';
    this.table = location.table;
    this.column = location.column;
    this.rowId = location.id;
  }
}

/** Parses and validates a JSON text column read from the database. Never trust stored JSON. */
export function parseJsonColumn<T>(
  schema: ZodType<T>,
  raw: string,
  location: JsonColumnLocation,
): T {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new DbValidationError(location, 'not valid JSON');
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    throw new DbValidationError(location, result.error.issues[0]?.message ?? 'schema mismatch');
  }
  return result.data;
}

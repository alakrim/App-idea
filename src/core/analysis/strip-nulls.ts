/**
 * The type of T after `stripNulls`: every key whose value may be null becomes an optional key with
 * the non-null type, at every depth. Keys that can never be null are unchanged.
 */
export type NoNulls<T> = T extends readonly (infer U)[]
  ? NoNulls<U>[]
  : T extends object
    ? { [K in keyof T as null extends T[K] ? never : K]: NoNulls<T[K]> } & {
        [K in keyof T as null extends T[K] ? K : never]?: NoNulls<Exclude<T[K], null>>;
      }
    : T;

function dropNulls(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropNulls);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== null)
        .map(([key, v]) => [key, dropNulls(v)]),
    );
  }
  return value;
}

/**
 * Post-parse normalization for LLM output. Strict json_schema mode requires every key and uses
 * null for "nothing to say", so the parsed reply has nulls. Domain types use absent keys instead.
 */
export function stripNulls<T>(value: T): NoNulls<T> {
  return dropNulls(value) as NoNulls<T>;
}

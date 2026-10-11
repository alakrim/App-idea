/**
 * Lists every place in a JSON Schema that breaks strict json_schema mode: an object whose
 * `required` is not exactly its property keys, or whose `additionalProperties` is not false.
 * Returns the JSON paths of the offending objects, so an empty array means the schema passes.
 */
export function strictViolations(schema: unknown, path = '$'): string[] {
  if (Array.isArray(schema)) {
    return schema.flatMap((item, i) => strictViolations(item, `${path}[${i}]`));
  }
  if (schema === null || typeof schema !== 'object') return [];

  const node = schema as Record<string, unknown>;
  const out: string[] = [];
  const { properties } = node;
  if (properties !== null && typeof properties === 'object') {
    const keys = Object.keys(properties).sort();
    const required = Array.isArray(node.required) ? node.required.map(String).sort() : [];
    if (JSON.stringify(required) !== JSON.stringify(keys)) {
      out.push(`${path}: required ${JSON.stringify(required)} is not the keys ${JSON.stringify(keys)}`);
    }
    if (node.additionalProperties !== false) out.push(`${path}: additionalProperties is not false`);
    for (const [key, value] of Object.entries(properties)) {
      out.push(...strictViolations(value, `${path}.properties.${key}`));
    }
  }
  if (node.items !== undefined) out.push(...strictViolations(node.items, `${path}.items`));
  for (const combinator of ['anyOf', 'oneOf', 'allOf'] as const) {
    out.push(...strictViolations(node[combinator], `${path}.${combinator}`));
  }
  return out;
}

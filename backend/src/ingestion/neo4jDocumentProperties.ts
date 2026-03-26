/**
 * Neo4j node/relationship properties must be primitives, temporal types, points,
 * or homogeneous lists of primitives — not arbitrary nested maps (SAP JSON uses
 * structures like creationTime: { hours, minutes, seconds }).
 *
 * This converts a JSON-like document into a flat map safe for `SET n += $props`.
 * Nested objects and complex arrays are stored as JSON strings under their
 * original keys so UIs can JSON.parse when needed.
 */
export function documentPropertiesForNeo4j(doc: unknown): Record<string, unknown> {
  if (doc === null || typeof doc !== "object") {
    return {};
  }
  if (Array.isArray(doc)) {
    return {};
  }
  const input = doc as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [rawKey, value] of Object.entries(input)) {
    if (!isValidNeo4jPropertyKey(rawKey)) continue;
    const coerced = coerceNeo4jPropertyValue(value);
    if (coerced !== undefined) {
      out[rawKey] = coerced;
    }
  }
  return out;
}

/** Neo4j: names are unicode letters, digits, underscore; context-sensitive reserved words avoided by SAP keys. */
function isValidNeo4jPropertyKey(k: string): boolean {
  return k.length > 0 && /^[\p{L}_][\p{L}\p{N}_]*$/u.test(k);
}

function coerceNeo4jPropertyValue(value: unknown): unknown | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const t = typeof value;
  if (t === "string" || t === "boolean") {
    return value;
  }
  if (t === "number") {
    if (!Number.isFinite(value)) return undefined;
    return value;
  }
  if (t === "bigint") {
    return value.toString();
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [];
    }
    const primitives = value.map(arrayElementToNeo4jPrimitive);
    if (primitives.every((x) => x !== undefined)) {
      return primitives as (string | number | boolean)[];
    }
    return JSON.stringify(value);
  }
  if (t === "object") {
    return JSON.stringify(value);
  }
  return undefined;
}

function arrayElementToNeo4jPrimitive(
  el: unknown,
): string | number | boolean | undefined {
  if (el === null || el === undefined) return undefined;
  const t = typeof el;
  if (t === "string" || t === "boolean") return el;
  if (t === "number" && Number.isFinite(el)) return el;
  if (t === "bigint") return el.toString();
  if (el instanceof Date) return el.toISOString();
  return undefined;
}

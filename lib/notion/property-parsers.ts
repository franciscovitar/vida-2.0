/**
 * Extracción de valores planos desde propiedades crudas de Notion.
 * Sin dependencias del SDK; usado por los adaptadores genéricos y por
 * Projects Intelligence. Comportamiento idéntico al previamente definido
 * en `lib/notion/adapters.ts` (extracción sin cambios de semántica).
 */

export function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

export function richTextPlain(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  const rich = obj.rich_text;
  if (!Array.isArray(rich)) {
    const title = obj.title;
    if (!Array.isArray(title)) return null;
    const text = title
      .map((part) => {
        const p = asRecord(part);
        return typeof p?.plain_text === 'string' ? p.plain_text : '';
      })
      .join('')
      .trim();
    return text === '' ? null : text;
  }
  const text = rich
    .map((part) => {
      const p = asRecord(part);
      return typeof p?.plain_text === 'string' ? p.plain_text : '';
    })
    .join('')
    .trim();
  return text === '' ? null : text;
}

export function titlePlain(prop: unknown): string {
  return richTextPlain(prop) ?? 'Sin título';
}

export function selectName(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  const select = asRecord(obj.select) ?? asRecord(obj.status);
  if (!select) return null;
  return typeof select.name === 'string' ? select.name : null;
}

export function dateStart(prop: unknown): string | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  const date = asRecord(obj.date);
  if (!date || typeof date.start !== 'string') return null;
  return date.start.slice(0, 10);
}

export function relationIds(prop: unknown): string[] {
  const obj = asRecord(prop);
  if (!obj || !Array.isArray(obj.relation)) return [];
  const ids: string[] = [];
  for (const item of obj.relation) {
    const rel = asRecord(item);
    if (rel && typeof rel.id === 'string') ids.push(rel.id);
  }
  return ids;
}

export function inList<T extends string>(value: string | null, list: readonly T[]): T | null {
  if (!value) return null;
  return (list as readonly string[]).includes(value) ? (value as T) : null;
}

/** Valor numérico de una propiedad `number`. `null` si está ausente o no es numérico. */
export function numberValue(prop: unknown): number | null {
  const obj = asRecord(prop);
  if (!obj) return null;
  return typeof obj.number === 'number' ? obj.number : null;
}

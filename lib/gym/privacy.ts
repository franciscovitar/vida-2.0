/**
 * Privacidad del módulo Gimnasio (sin leer Journaling ni datos clínicos).
 */
const JOURNALING_PATTERN = /journal|diario\s+personal|reflexi[oó]n\s+privada/i;
const CLINICAL_PATTERN =
  /diagn[oó]stico|historial\s+cl[ií]nico|sexualidad|v[ií]nculo\s+privado|nota\s+m[eé]dica/i;
const FINANCE_PATTERN = /cuenta\s+bancaria|cuit|cbu|tarjeta\s+\d/i;

export function isGymExcludedText(text: string | null | undefined): boolean {
  if (!text) return false;
  return JOURNALING_PATTERN.test(text) || CLINICAL_PATTERN.test(text) || FINANCE_PATTERN.test(text);
}

export function sanitizeGymNote(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (isGymExcludedText(trimmed)) return null;
  return trimmed;
}

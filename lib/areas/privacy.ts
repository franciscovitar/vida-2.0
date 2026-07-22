/**
 * Privacidad del panel de Áreas: exclusiones tipadas (sin leer Journaling).
 */
import type { AreaSlug } from '@/types/areas';
import type { NotionProject, NotionTask } from '@/types/notion';

const JOURNALING_PATTERN = /journal|diario\s+personal|reflexi[oó]n\s+privada/i;
const SENSITIVE_CONTACT_PATTERN = /@|tel[eé]fono|whatsapp|\+\d{6,}|cliente\s*:\s*\w+/i;
const CLINICAL_PATTERN = /diagn[oó]stico|historial\s+cl[ií]nico|sexualidad|v[ií]nculo\s+privado/i;
const FINANCE_PATTERN = /cuenta\s+bancaria|cuit|cbu|tarjeta\s+\d/i;

export function isJournalingRelated(text: string | null | undefined): boolean {
  if (!text) return false;
  return JOURNALING_PATTERN.test(text);
}

export function looksLikeThirdPartySensitive(text: string | null | undefined): boolean {
  if (!text) return false;
  return SENSITIVE_CONTACT_PATTERN.test(text);
}

export function looksLikeClinicalPrivate(text: string | null | undefined): boolean {
  if (!text) return false;
  return CLINICAL_PATTERN.test(text);
}

export function looksLikePrivateFinance(text: string | null | undefined): boolean {
  if (!text) return false;
  return FINANCE_PATTERN.test(text);
}

export function sanitizePublicNote(text: string | null, slug: AreaSlug): string | null {
  if (!text) return null;
  if (isJournalingRelated(text)) return null;
  if (slug === 'genova-trabajo' && looksLikeThirdPartySensitive(text)) return null;
  if (slug === 'salud' && looksLikeClinicalPrivate(text)) return null;
  if (
    slug === 'vida-personal' &&
    (looksLikePrivateFinance(text) || looksLikeClinicalPrivate(text))
  ) {
    return null;
  }
  return text;
}

export function isExcludedProject(project: NotionProject, slug: AreaSlug): boolean {
  if (isJournalingRelated(project.name) || isJournalingRelated(project.expectedResult)) {
    return true;
  }
  if (slug === 'vida-personal' && isJournalingRelated(project.nextAction)) return true;
  if (slug === 'genova-trabajo' && looksLikeThirdPartySensitive(project.blocker)) return true;
  return false;
}

export function isExcludedTask(task: NotionTask, slug: AreaSlug): boolean {
  if (isJournalingRelated(task.title) || isJournalingRelated(task.note)) return true;
  if (slug === 'salud' && looksLikeClinicalPrivate(task.note)) return true;
  if (slug === 'genova-trabajo' && looksLikeThirdPartySensitive(task.note)) return true;
  if (slug === 'vida-personal' && looksLikePrivateFinance(task.note)) return true;
  return false;
}

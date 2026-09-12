import type { MediaKind } from '@/types/media';

type ExperienceProfile = Record<string, unknown>;

export interface AgeFeelSignal {
  score: number;
  label: string;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function baseAgeFeel(year: number): number {
  if (year >= 2020) return 0.5;
  if (year >= 2015) return 1.2;
  if (year >= 2010) return 2;
  if (year >= 2000) return 3;
  if (year >= 1990) return 4.3;
  if (year >= 1980) return 5.8;
  if (year >= 1970) return 7;
  if (year >= 1960) return 8;
  return 9;
}

function parseProfile(raw: string | null): ExperienceProfile | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? (parsed as ExperienceProfile)
      : null;
  } catch {
    return null;
  }
}

function profileAdjustment(profile: ExperienceProfile | null): number {
  if (!profile) return 0;

  let adjustment = 0;
  const pace = profile.pace;
  const visual = profile.visual_emphasis;
  const dialogue = profile.dialogue_emphasis;

  if (pace === 'fast') adjustment -= 0.45;
  if (pace === 'slow') adjustment += 0.45;
  if (visual === 'high') adjustment -= 0.35;
  if (visual === 'low') adjustment += 0.35;
  if (dialogue === 'high') adjustment += 0.15;

  return adjustment;
}

function ageFeelLabel(score: number): string {
  if (score <= 1.5) return 'Se siente muy actual';
  if (score <= 3) return 'Se siente actual';
  if (score <= 4.5) return 'Se siente ligeramente de época';
  if (score <= 6.5) return 'Se siente de época';
  if (score <= 8) return 'Se siente bastante de época';
  return 'Se siente muy de época';
}

/**
 * Señal heurística de presentación: estima cuánto "se siente de época" una
 * película usando año + rasgos pre-view del Perfil experiencia. No afirma una
 * propiedad objetiva y no se persiste. Series quedan neutrales hasta tener una
 * calibración específica.
 */
export function deriveAgeFeel(
  medium: MediaKind,
  year: number | null,
  rawExperienceProfile: string | null,
): AgeFeelSignal | null {
  if (medium !== 'movie' || year === null) return null;
  const score = clamp(baseAgeFeel(year) + profileAdjustment(parseProfile(rawExperienceProfile)), 0, 10);
  const rounded = Math.round(score * 100) / 100;
  return { score: rounded, label: ageFeelLabel(rounded) };
}

/**
 * Preferencia declarada del usuario: cuando una película se siente claramente
 * de época, reduce suavemente su afinidad esperada. 0–2.5 es neutral; la
 * penalización crece de forma continua y queda acotada en -0.9.
 */
export function ageFeelAffinityAdjustment(ageFeelScore: number | null): number {
  if (ageFeelScore === null || ageFeelScore <= 2.5) return 0;
  return -Math.min(0.9, (ageFeelScore - 2.5) * 0.14);
}

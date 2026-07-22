/**
 * Normalización ContentPage → GymRoutine (pura, fixtures).
 */
import { isGymExcludedText, sanitizeGymNote } from '@/lib/gym/privacy';
import type { ContentBlock, ContentPage } from '@/types/content';
import type {
  GymExercisePrescription,
  GymParseWarning,
  GymRoutine,
  GymWorkoutDay,
} from '@/types/gym';

function opaqueKey(prefix: string, seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return `${prefix}-${hash.toString(36)}`;
}

function plainText(block: ContentBlock): string {
  return block.text
    .map((part) => part.plain)
    .join('')
    .trim();
}

function isHeading(type: ContentBlock['type']): type is 'heading_1' | 'heading_2' | 'heading_3' {
  return type === 'heading_1' || type === 'heading_2' || type === 'heading_3';
}

function isListItem(type: ContentBlock['type']): boolean {
  return type === 'bulleted_list_item' || type === 'numbered_list_item' || type === 'to_do';
}

function isNoteBlock(type: ContentBlock['type']): boolean {
  return type === 'quote' || type === 'callout';
}

function looksLikeDayLabel(label: string): boolean {
  return /d[ií]a\s*\d|day\s*\d|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|push|pull|legs|upper|lower|\b[ab]\b|full\s*body|tren\s*(superior|inferior)/i.test(
    label,
  );
}

export type ParsedPrescription = {
  name: string;
  sets: number | null;
  reps: string | null;
  rest: string | null;
  targetRir: string | null;
  targetRpe: string | null;
  structured: boolean;
};

/** Extrae series/reps/descanso/RIR/RPE sin inventar valores ausentes. */
export function parseExercisePrescriptionText(raw: string): ParsedPrescription {
  const text = raw.trim();
  let sets: number | null = null;
  let reps: string | null = null;
  let rest: string | null = null;
  let targetRir: string | null = null;
  let targetRpe: string | null = null;

  const setsReps =
    text.match(/(\d+)\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)/i) ??
    text.match(/(\d+)\s*series?\s*(?:de\s*)?(\d+(?:\s*[-–]\s*\d+)?)/i);
  if (setsReps) {
    sets = Number(setsReps[1]);
    reps = setsReps[2]!.replace(/\s+/g, '');
  }

  const restMatch = text.match(/descanso\s*:?\s*(\d+)\s*(s|seg|segs|min|mins|m)?/i);
  if (restMatch) {
    const unit = (restMatch[2] ?? 's').toLowerCase();
    const n = restMatch[1]!;
    rest = unit.startsWith('m') ? `${n} min` : `${n} s`;
  }

  const rirMatch = text.match(/rir\s*:?\s*(\d+)/i);
  if (rirMatch) targetRir = rirMatch[1]!;

  const rpeMatch = text.match(/rpe\s*:?\s*(\d+(?:\.\d+)?)/i);
  if (rpeMatch) targetRpe = rpeMatch[1]!;

  let name = text
    .replace(/(\d+)\s*[x×]\s*(\d+(?:\s*[-–]\s*\d+)?)/gi, ' ')
    .replace(/(\d+)\s*series?\s*(?:de\s*)?(\d+(?:\s*[-–]\s*\d+)?)/gi, ' ')
    .replace(/descanso\s*:?\s*\d+\s*(s|seg|segs|min|mins|m)?/gi, ' ')
    .replace(/rir\s*:?\s*\d+/gi, ' ')
    .replace(/rpe\s*:?\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(/[–—|-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!name) name = text;

  const structured = sets !== null || reps !== null || rest !== null;
  return { name, sets, reps, rest, targetRir, targetRpe, structured };
}

export type ParseRoutineResult = {
  routine: GymRoutine;
  warnings: GymParseWarning[];
  /** true cuando conviene mostrar también el renderer documental. */
  documentaryFallback: boolean;
};

type DayDraft = {
  label: string;
  notes: string[];
  exercises: GymExercisePrescription[];
};

function flushDays(drafts: DayDraft[]): GymWorkoutDay[] {
  return drafts.map((day, index) => ({
    key: opaqueKey('day', `${index}-${day.label}`),
    label: day.label,
    order: index + 1,
    notes: day.notes,
    exercises: day.exercises,
  }));
}

/**
 * Transforma bloques normalizados en rutina estructurada.
 * Si la confianza es baja, marca documentaryFallback.
 */
export function parseGymRoutineFromContentPage(page: ContentPage): ParseRoutineResult {
  const warnings: GymParseWarning[] = [];
  const rootNotes: string[] = [];
  const days: DayDraft[] = [];
  let currentDay: DayDraft | null = null;
  let unstructuredCount = 0;

  const ensureDay = (label: string): DayDraft => {
    if (!currentDay) {
      currentDay = { label, notes: [], exercises: [] };
      days.push(currentDay);
    }
    return currentDay;
  };

  const addExercise = (raw: string, orderSeed: number) => {
    if (isGymExcludedText(raw)) return;
    const parsed = parseExercisePrescriptionText(raw);
    const day = ensureDay('General');
    const exercise: GymExercisePrescription = {
      key: opaqueKey('ex', `${day.label}-${orderSeed}-${parsed.name}`),
      name: parsed.name,
      order: day.exercises.length + 1,
      sets: parsed.sets,
      reps: parsed.reps,
      rest: parsed.rest,
      targetRir: parsed.targetRir,
      targetRpe: parsed.targetRpe,
      notes: null,
      rawText: raw,
    };
    if (!parsed.structured) {
      warnings.push({
        code: 'exercise-without-prescription',
        message: 'Ejercicio sin prescripción estructurable; se conserva el texto original.',
        subject: parsed.name,
      });
    }
    day.exercises.push(exercise);
  };

  const walk = (blocks: readonly ContentBlock[]) => {
    for (const block of blocks) {
      const text = plainText(block);
      if (text && isGymExcludedText(text)) continue;

      if (isHeading(block.type)) {
        if (!text) continue;
        const level = block.type === 'heading_1' ? 1 : block.type === 'heading_2' ? 2 : 3;
        if (level <= 2 || looksLikeDayLabel(text) || !currentDay) {
          currentDay = { label: text, notes: [], exercises: [] };
          days.push(currentDay);
        } else {
          // Encabezado secundario como nota de bloque.
          const note = sanitizeGymNote(text);
          if (note) ensureDay('General').notes.push(note);
        }
        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (isListItem(block.type)) {
        if (text) addExercise(text, days.length * 100 + (currentDay?.exercises.length ?? 0));
        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (isNoteBlock(block.type)) {
        const note = sanitizeGymNote(text);
        if (note) {
          if (currentDay) currentDay.notes.push(note);
          else rootNotes.push(note);
        }
        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (block.type === 'paragraph') {
        const note = sanitizeGymNote(text);
        if (note) {
          if (currentDay) currentDay.notes.push(note);
          else rootNotes.push(note);
        }
        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (block.type === 'unsupported' || block.type === 'code' || block.type === 'bookmark') {
        unstructuredCount += 1;
        warnings.push({
          code: 'unstructured-block',
          message: 'Bloque no interpretable; se conserva vía vista documental si hace falta.',
          subject: block.type,
        });
      }

      if (block.children.length > 0) walk(block.children);
    }
  };

  walk(page.blocks);

  const workoutDays = flushDays(days);
  const totalExercises = workoutDays.reduce((sum, day) => sum + day.exercises.length, 0);
  const detectableDays = workoutDays.filter((day) => day.exercises.length > 0);

  if (detectableDays.length === 0) {
    warnings.push({
      code: 'routine-without-days',
      message: 'No se detectaron días de entrenamiento estructurados.',
      subject: page.title,
    });
  }

  const confident = detectableDays.length > 0 && totalExercises > 0;
  const documentaryFallback = !confident || unstructuredCount > 2;

  if (documentaryFallback) {
    warnings.push({
      code: 'documentary-fallback',
      message: 'La rutina se muestra también en formato documental por baja confianza estructural.',
      subject: page.title,
    });
  }

  const routine: GymRoutine = {
    name: page.title,
    lastUpdatedAt: page.lastEditedAt,
    sourceLabel: 'Notion (Registro Web)',
    presentation: confident ? 'structured' : 'documentary',
    days: confident ? workoutDays : [],
    notes: rootNotes,
  };

  return { routine, warnings, documentaryFallback };
}

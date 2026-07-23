/**
 * Normalización ContentPage → GymRoutine (pura, fixtures).
 */
import { isGymExcludedText, sanitizeGymNote } from '@/lib/gym/privacy';
import type { ContentBlock, ContentPage } from '@/types/content';
import type {
  GymExercisePrescription,
  GymParseWarning,
  GymRoutine,
  GymRoutineSection,
  GymRoutineSectionKind,
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

function headingLevel(type: ContentBlock['type']): 1 | 2 | 3 | null {
  if (type === 'heading_1') return 1;
  if (type === 'heading_2') return 2;
  if (type === 'heading_3') return 3;
  return null;
}

function isListItem(type: ContentBlock['type']): boolean {
  return type === 'bulleted_list_item' || type === 'numbered_list_item' || type === 'to_do';
}

function isNoteBlock(type: ContentBlock['type']): boolean {
  return type === 'quote' || type === 'callout';
}

function looksLikeDayLabel(label: string): boolean {
  return /(?:^|\b)d[ií]a\s*\d|day\s*\d|lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo|push|pull|legs|upper|lower|full\s*body|tren\s*(?:superior|inferior)/i.test(
    label,
  );
}

function isWeightsSection(label: string): boolean {
  return /rutina\s+de\s+pesas|entrenamiento\s+de\s+fuerza|fuerza\s+y\s+pesas/i.test(label);
}

function supplementalKind(label: string): GymRoutineSectionKind {
  if (/movilidad|entrada\s+en\s+calor|calentamiento/i.test(label)) return 'mobility';
  if (
    /despu[eé]s\s+del\s+gimnasio|recuperaci[oó]n|estiramiento|descarga\s+de\s+zonas/i.test(label)
  ) {
    return 'recovery';
  }
  if (/cardio|aer[oó]bico|zona\s*2|f[uú]tbol/i.test(label)) return 'cardio';
  if (/descarga|planificaci[oó]n|ciclo|progresi[oó]n/i.test(label)) return 'planning';
  return 'notes';
}

function normalizeRange(value: string): string {
  return value.replace(/\s+/g, '').replace(/[–/]/g, '-');
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
  const text = raw.trim().replace(/^\d+[.)]\s*/, '');
  let sets: number | null = null;
  let reps: string | null = null;
  let rest: string | null = null;
  let targetRir: string | null = null;
  let targetRpe: string | null = null;

  const repToken = String.raw`\d+(?:\s*(?:[-–/]|a)\s*\d+)?`;
  const setsReps = text.match(
    new RegExp(`(\\d+)\\s*[x×]\\s*(${repToken})(?:\\s*(por lado|por pierna))?`, 'i'),
  );
  const seriesReps = text.match(new RegExp(`(\\d+)\\s+series?\\s+(?:de\\s+)?(${repToken})`, 'i'));
  const seriesOnly = text.match(/(?:^|[—–-]\s*)(\d+)\s+series?\b/i);
  const carries = text.match(
    /(?:^|[—–-]\s*)(\d+)\s+caminatas?\s+de\s+(\d+(?:\s*[-–/]\s*\d+)?)\s*s/i,
  );

  if (setsReps) {
    sets = Number(setsReps[1]);
    reps = normalizeRange(setsReps[2]!);
    if (setsReps[3]) reps = `${reps} ${setsReps[3]!.toLowerCase()}`;
  } else if (seriesReps) {
    sets = Number(seriesReps[1]);
    reps = normalizeRange(seriesReps[2]!);
  } else if (carries) {
    sets = Number(carries[1]);
    reps = `${normalizeRange(carries[2]!)} s`;
  } else if (seriesOnly) {
    sets = Number(seriesOnly[1]);
  }

  if (sets === null && reps === null) {
    const duration = text.match(
      /(?:^|[—–-]\s*)(\d+(?:\s*[-–/]\s*\d+)?)\s*(s|seg(?:undos?)?|min(?:utos?)?)(?:\s+(por lado|por pierna))?/i,
    );
    if (duration) {
      const unit = duration[2]!.toLowerCase().startsWith('m') ? 'min' : 's';
      reps = `${normalizeRange(duration[1]!)} ${unit}${duration[3] ? ` ${duration[3]!.toLowerCase()}` : ''}`;
    }
  }

  const restMatch = text.match(
    /descanso\s*:?\s*(\d+(?:\s*[-–/]\s*\d+)?)\s*(s|seg|segs|min|mins|m)?/i,
  );
  if (restMatch) {
    const unit = (restMatch[2] ?? 's').toLowerCase();
    const n = normalizeRange(restMatch[1]!);
    rest = unit.startsWith('m') ? `${n} min` : `${n} s`;
  }

  const rirMatch = text.match(/rir\s*:?\s*(\d+(?:\s*[-–/]\s*\d+)?)/i);
  if (rirMatch) targetRir = normalizeRange(rirMatch[1]!);

  const rpeMatch = text.match(/rpe\s*:?\s*(\d+(?:\.\d+)?)/i);
  if (rpeMatch) targetRpe = rpeMatch[1]!;

  let name = text
    .replace(
      new RegExp(
        `(?:\\s*[—–-]\\s*)?(\\d+)\\s*[x×]\\s*(${repToken})(?:\\s*(?:por lado|por pierna))?`,
        'gi',
      ),
      ' ',
    )
    .replace(new RegExp(`(?:\\s*[—–-]\\s*)?\\d+\\s+series?\\s+(?:de\\s+)?${repToken}`, 'gi'), ' ')
    .replace(/(?:\s*[—–-]\s*)?\d+\s+caminatas?\s+de\s+\d+(?:\s*[-–/]\s*\d+)?\s*s/gi, ' ')
    .replace(/(?:\s*[—–-]\s*)?\d+\s+series?\b/gi, ' ')
    .replace(
      /(?:\s*[—–-]\s*)?\d+(?:\s*[-–/]\s*\d+)?\s*(?:s|seg(?:undos?)?|min(?:utos?)?)(?:\s+(?:por lado|por pierna))?/gi,
      ' ',
    )
    .replace(/descanso\s*:?\s*\d+(?:\s*[-–/]\s*\d+)?\s*(?:s|seg|segs|min|mins|m)?/gi, ' ')
    .replace(/rir\s*:?\s*\d+(?:\s*[-–/]\s*\d+)?/gi, ' ')
    .replace(/rpe\s*:?\s*\d+(?:\.\d+)?/gi, ' ')
    .replace(/\s*[—–-]\s*\.?\s*$/g, ' ')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.]+$/, '');

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

type SupplementalDraft = {
  label: string;
  kind: GymRoutineSectionKind;
  descriptionParts: string[];
  items: string[];
  subsection: string | null;
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

function flushSupplementalSections(drafts: SupplementalDraft[]): GymRoutineSection[] {
  return drafts
    .filter((section) => section.descriptionParts.length > 0 || section.items.length > 0)
    .map((section, index) => ({
      key: opaqueKey('section', `${index}-${section.label}`),
      label: section.label,
      kind: section.kind,
      order: index + 1,
      description: section.descriptionParts.length > 0 ? section.descriptionParts.join(' ') : null,
      items: section.items,
    }));
}

/**
 * Transforma bloques normalizados en rutina estructurada.
 * Solo los encabezados que representan días se convierten en días de pesas;
 * movilidad, cardio y descarga se conservan como secciones complementarias.
 */
export function parseGymRoutineFromContentPage(page: ContentPage): ParseRoutineResult {
  const warnings: GymParseWarning[] = [];
  const rootNotes: string[] = [];
  const days: DayDraft[] = [];
  const supplemental: SupplementalDraft[] = [];
  let currentDay: DayDraft | null = null;
  let currentSupplemental: SupplementalDraft | null = null;
  let inWeightsSection = false;
  let currentExerciseSubsection: string | null = null;
  let unstructuredCount = 0;

  const startDay = (label: string): DayDraft => {
    currentDay = { label, notes: [], exercises: [] };
    days.push(currentDay);
    currentExerciseSubsection = null;
    return currentDay;
  };

  const startSupplemental = (label: string): SupplementalDraft => {
    currentSupplemental = {
      label,
      kind: supplementalKind(label),
      descriptionParts: [],
      items: [],
      subsection: null,
    };
    supplemental.push(currentSupplemental);
    currentDay = null;
    currentExerciseSubsection = null;
    return currentSupplemental;
  };

  const addExercise = (raw: string) => {
    if (!currentDay || isGymExcludedText(raw)) return;
    const parsed = parseExercisePrescriptionText(raw);
    const exercise: GymExercisePrescription = {
      key: opaqueKey('ex', `${currentDay.label}-${currentDay.exercises.length}-${parsed.name}`),
      name: parsed.name,
      order: currentDay.exercises.length + 1,
      sets: parsed.sets,
      reps: parsed.reps,
      rest: parsed.rest,
      targetRir: parsed.targetRir,
      targetRpe: parsed.targetRpe,
      notes: currentExerciseSubsection,
      rawText: raw,
    };
    if (!parsed.structured) {
      warnings.push({
        code: 'exercise-without-prescription',
        message: 'Ejercicio sin prescripción estructurable; se conserva el texto original.',
        subject: parsed.name,
      });
    }
    currentDay.exercises.push(exercise);
  };

  const addSupplementalText = (raw: string, asItem: boolean) => {
    const note = sanitizeGymNote(raw);
    if (!note || !currentSupplemental) return;
    const prefix = currentSupplemental.subsection ? `${currentSupplemental.subsection}: ` : '';
    if (asItem) currentSupplemental.items.push(`${prefix}${note}`);
    else currentSupplemental.descriptionParts.push(`${prefix}${note}`);
  };

  const walk = (blocks: readonly ContentBlock[]) => {
    for (const block of blocks) {
      const text = plainText(block);
      if (text && isGymExcludedText(text)) continue;

      if (isHeading(block.type)) {
        if (!text) continue;
        const level = headingLevel(block.type)!;

        if (level === 1) {
          if (looksLikeDayLabel(text)) {
            inWeightsSection = true;
            currentSupplemental = null;
            startDay(text);
          } else {
            inWeightsSection = isWeightsSection(text);
            currentDay = null;
            currentExerciseSubsection = null;
            if (inWeightsSection) {
              currentSupplemental = null;
            } else if (/objetivo\s+general/i.test(text)) {
              currentSupplemental = null;
            } else {
              startSupplemental(text);
            }
          }
        } else if (inWeightsSection && looksLikeDayLabel(text)) {
          startDay(text);
        } else if (inWeightsSection && currentDay) {
          currentExerciseSubsection = text;
          const note = sanitizeGymNote(text);
          if (note) currentDay.notes.push(note);
        } else if (currentSupplemental) {
          currentSupplemental.subsection = text;
        } else if (looksLikeDayLabel(text)) {
          // Compatibilidad con documentos antiguos sin encabezado “Rutina de pesas”.
          inWeightsSection = true;
          startDay(text);
        } else {
          const note = sanitizeGymNote(text);
          if (note) rootNotes.push(note);
        }

        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (isListItem(block.type)) {
        if (text) {
          if (inWeightsSection && currentDay) addExercise(text);
          else if (currentSupplemental) addSupplementalText(text, true);
          else {
            const note = sanitizeGymNote(text);
            if (note) rootNotes.push(note);
          }
        }
        if (block.children.length > 0) walk(block.children);
        continue;
      }

      if (isNoteBlock(block.type) || block.type === 'paragraph') {
        const note = sanitizeGymNote(text);
        if (note) {
          if (inWeightsSection && currentDay) currentDay.notes.push(note);
          else if (currentSupplemental) addSupplementalText(note, false);
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

  const workoutDays = flushDays(days).filter((day) => day.exercises.length > 0);
  const totalExercises = workoutDays.reduce((sum, day) => sum + day.exercises.length, 0);

  if (workoutDays.length === 0) {
    warnings.push({
      code: 'routine-without-days',
      message: 'No se detectaron días de entrenamiento estructurados.',
      subject: page.title,
    });
  }

  const confident = workoutDays.length > 0 && totalExercises > 0;
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
    supplementalSections: flushSupplementalSections(supplemental),
  };

  return { routine, warnings, documentaryFallback };
}

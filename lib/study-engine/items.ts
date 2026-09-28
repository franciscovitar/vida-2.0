import type { RichContentBlock } from './rich-content';

export type StudyItemType = 'recall' | 'cloze' | 'mcq' | 'typed' | 'image';
export type StudyOperation = 'recall' | 'explain' | 'discriminate';

interface BaseStudyItem {
  id: string;
  version: number;
  subjectId: string;
  conceptId: string;
  operation: StudyOperation;
  channel?: 'theoretical' | 'practical' | 'integrative';
  itemType: StudyItemType;
  prompt: string;
  answer: string;
  explanation: string;
  richContent?: readonly RichContentBlock[];
}

export interface RecallStudyItem extends BaseStudyItem {
  itemType: 'recall';
}

export interface TextStudyItem extends BaseStudyItem {
  itemType: 'cloze' | 'typed';
  acceptedAnswers: readonly string[];
  placeholder?: string;
}

export interface McqStudyItem extends BaseStudyItem {
  itemType: 'mcq';
  options: readonly {
    id: string;
    label: string;
  }[];
  correctOptionId: string;
}

export type StudyVisualKey = 'ownership' | 'evidence';

export interface ImageStudyItem extends BaseStudyItem {
  itemType: 'image';
  visual: StudyVisualKey;
  acceptedAnswers: readonly string[];
  placeholder?: string;
}

export type StudyItem = RecallStudyItem | TextStudyItem | McqStudyItem | ImageStudyItem;

export const STUDY_ENGINE_DEMO_ITEMS: readonly StudyItem[] = [
  {
    id: 'demo-fsrs-role',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.fsrs-role',
    operation: 'explain',
    itemType: 'recall',
    prompt: '¿Qué decide FSRS y qué decide Learning OS?',
    answer:
      'FSRS decide cuándo vuelve una memoria; Learning OS decide qué actividad conviene practicar.',
    explanation:
      'Separar scheduling de mastery evita que recordar una tarjeta familiar se confunda con estar listo para transferir el concepto.',
    richContent: [
      {
        kind: 'markdown',
        markdown:
          '**Regla de arquitectura:** FSRS programa memoria; Learning OS interpreta evidencia.',
      },
      {
        kind: 'html',
        html: '<p style="font-weight: 600; color: currentColor">Contenido HTML allowlisted</p><svg viewBox="0 0 120 24" aria-label="Línea segura"><line x1="4" y1="12" x2="116" y2="12" stroke="currentColor" stroke-width="2"></line></svg>',
      },
      {
        kind: 'code',
        language: 'text',
        code: 'scheduling_owner = ANKI | STUDY_ENGINE',
      },
      {
        kind: 'math',
        tex: 'priority ∝ weakness × forgetting risk',
      },
    ],
  },
  {
    id: 'demo-mastery-owner',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.mastery-owner',
    operation: 'recall',
    itemType: 'cloze',
    prompt: 'Completá: el dueño de mastery y readiness es ____.',
    acceptedAnswers: ['Learning OS', 'learning os'],
    placeholder: 'Escribí el sistema...',
    answer: 'Learning OS',
    explanation:
      'Study Engine ejecuta práctica y registra evidencia, pero no crea un segundo mastery model.',
  },
  {
    id: 'demo-response-time',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.response-time',
    operation: 'discriminate',
    itemType: 'mcq',
    prompt: 'En V1, ¿qué hace el tiempo de respuesta?',
    options: [
      { id: 'a', label: 'Modifica directamente el intervalo FSRS.' },
      { id: 'b', label: 'Se guarda como evidencia contextual.' },
      { id: 'c', label: 'Reemplaza correctness cuando la respuesta es rápida.' },
    ],
    correctOptionId: 'b',
    answer: 'Se guarda como evidencia contextual.',
    explanation:
      'El tiempo está confundido por lectura, cálculo, dispositivo y distracción; no altera FSRS directamente en V1.',
  },
  {
    id: 'demo-again',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.fsrs-rating',
    operation: 'recall',
    itemType: 'typed',
    prompt: '¿Qué rating representa un fallo de recuperación?',
    acceptedAnswers: ['Again', 'otra vez'],
    placeholder: 'Rating...',
    answer: 'Again',
    explanation: 'Hard sigue siendo una recuperación exitosa, aunque haya costado.',
  },
  {
    id: 'demo-ownership-image',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.ownership',
    operation: 'discriminate',
    itemType: 'image',
    prompt: 'En el diagrama, ¿qué sistema conserva el scheduling de una tarjeta Anki existente?',
    visual: 'ownership',
    acceptedAnswers: ['Anki'],
    placeholder: 'Sistema...',
    answer: 'Anki',
    explanation:
      'Las tarjetas existentes siguen siendo ANKI-owned hasta una migración explícita; Learning OS consume evidencia sin adueñarse del scheduling.',
  },
  {
    id: 'demo-freshness',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.freshness',
    operation: 'explain',
    itemType: 'recall',
    prompt: '¿Por qué una Study Item no puede ser “fresh” para siempre?',
    answer:
      'Porque freshness depende de la exposición del alumno en cada intento, no de la pregunta como objeto.',
    explanation:
      'La misma pregunta puede ser nueva hoy y familiar mañana. Por eso se registra seen_before/freshness en el intento.',
  },
  {
    id: 'demo-single-owner',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.single-owner',
    operation: 'recall',
    itemType: 'cloze',
    prompt: 'Completá: cada review unit tiene exactamente ____ scheduling owner.',
    acceptedAnswers: ['uno', '1', 'un'],
    placeholder: 'Cantidad...',
    answer: 'uno',
    explanation: 'El owner puede ser ANKI o STUDY_ENGINE, pero nunca ambos a la vez.',
  },
  {
    id: 'demo-default-owner',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.anki-default',
    operation: 'discriminate',
    itemType: 'mcq',
    prompt: '¿Cuál es el ownership por defecto de una tarjeta que ya existe en Anki?',
    options: [
      { id: 'a', label: 'STUDY_ENGINE' },
      { id: 'b', label: 'LEARNING_OS' },
      { id: 'c', label: 'ANKI' },
    ],
    correctOptionId: 'c',
    answer: 'ANKI',
    explanation:
      'La coexistencia gradual evita doble scheduling y permite migrar solo cuando convenga.',
  },
  {
    id: 'demo-attempt-event',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.attempt-event',
    operation: 'recall',
    itemType: 'typed',
    prompt:
      '¿Qué característica debe tener el historial de intentos para no reescribir lo que pasó?',
    acceptedAnswers: ['append-only', 'append only', 'inmutable', 'inmutable append-only'],
    placeholder: 'Propiedad...',
    answer: 'append-only',
    explanation:
      'Los intentos son eventos inmutables. Las reconciliaciones o estados derivados se agregan sin borrar la historia.',
  },
  {
    id: 'demo-evidence-image',
    version: 1,
    subjectId: 'study-engine-demo',
    conceptId: 'study-engine.evidence-strength',
    operation: 'discriminate',
    itemType: 'image',
    prompt:
      'Según el diagrama, ¿qué evidencia muestra mayor transferencia que una tarjeta familiar?',
    visual: 'evidence',
    acceptedAnswers: ['transfer', 'transferencia'],
    placeholder: 'Nivel...',
    answer: 'Transfer',
    explanation:
      'La recuperación familiar sigue siendo útil, pero una tarea de transferencia independiente aporta evidencia más fuerte sobre aplicación.',
  },
];

export function normalizeStudyAnswer(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .replace(/[.,;:!?]/g, '')
    .trim()
    .replace(/\s+/g, ' ');
}

export function evaluateStudyResponse(item: StudyItem, response: string): boolean | null {
  if (item.itemType === 'recall') return null;
  if (item.itemType === 'mcq') return response === item.correctOptionId;

  const normalized = normalizeStudyAnswer(response);
  return item.acceptedAnswers.some((answer) => normalizeStudyAnswer(answer) === normalized);
}

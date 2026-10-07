import type { PersonalPurchaseState } from './types';

export const LEGACY_PERSONAL_SHOPPING_NOTION_PAGE_ID =
  '39808627-4b6f-8151-a7c9-c77bb4be1307';

export interface LegacyPersonalPurchaseSeed {
  sourceRef: string;
  title: string;
  state: Extract<PersonalPurchaseState, 'BUY' | 'RESEARCH' | 'REPLENISH'>;
  notes?: string;
}

const source = (section: string, index: number) =>
  `notion:${LEGACY_PERSONAL_SHOPPING_NOTION_PAGE_ID}:${section}:${String(index).padStart(2, '0')}`;

export const LEGACY_PERSONAL_PURCHASE_SEED: readonly LegacyPersonalPurchaseSeed[] = [
  { sourceRef: source('buy', 1), title: 'Prensa para ajo y limón.', state: 'BUY' },
  { sourceRef: source('buy', 2), title: 'Cinta.', state: 'BUY' },
  { sourceRef: source('buy', 3), title: 'Delantal de cocina.', state: 'BUY' },
  { sourceRef: source('buy', 4), title: 'Pinza de depilar.', state: 'BUY' },
  { sourceRef: source('buy', 5), title: 'Perfilador de cejas.', state: 'BUY' },
  { sourceRef: source('buy', 6), title: 'Pilas.', state: 'BUY' },
  { sourceRef: source('buy', 7), title: 'Pegamento para madera.', state: 'BUY' },
  {
    sourceRef: source('buy', 8),
    title: '7 frascos para freezer de entre 100 y 250 ml.',
    state: 'BUY',
  },
  { sourceRef: source('buy', 9), title: 'Medias largas de fútbol.', state: 'BUY' },
  { sourceRef: source('buy', 10), title: 'Inflador para pelota.', state: 'BUY' },
  { sourceRef: source('buy', 11), title: 'Short deportivo.', state: 'BUY' },
  { sourceRef: source('buy', 12), title: 'Perfume para la ropa.', state: 'BUY' },

  { sourceRef: source('research', 1), title: 'Báscula inteligente.', state: 'RESEARCH' },
  {
    sourceRef: source('research', 2),
    title: 'Almohadón respaldo tipo sillón para cama.',
    state: 'RESEARCH',
  },
  { sourceRef: source('research', 3), title: 'Gorra.', state: 'RESEARCH' },
  { sourceRef: source('research', 4), title: 'Purificador de aire.', state: 'RESEARCH' },
  { sourceRef: source('research', 5), title: 'Olla a presión.', state: 'RESEARCH' },
  { sourceRef: source('research', 6), title: 'Foam roller.', state: 'RESEARCH' },
  { sourceRef: source('research', 7), title: 'Escritorio.', state: 'RESEARCH' },
  { sourceRef: source('research', 8), title: 'Robot aspirador.', state: 'RESEARCH' },
  { sourceRef: source('research', 9), title: 'Colchón.', state: 'RESEARCH' },
  {
    sourceRef: source('research', 10),
    title: 'Multiprocesadora o picadora.',
    state: 'RESEARCH',
  },
  { sourceRef: source('research', 11), title: 'Kindle.', state: 'RESEARCH' },
  { sourceRef: source('research', 12), title: 'Pizarra.', state: 'RESEARCH' },
  { sourceRef: source('research', 13), title: 'Enchufes inteligentes.', state: 'RESEARCH' },
  { sourceRef: source('research', 14), title: 'Envasadora al vacío.', state: 'RESEARCH' },
  {
    sourceRef: source('research', 15),
    title: 'Caja con temporizador para guardar el celular.',
    state: 'RESEARCH',
  },
  {
    sourceRef: source('research', 16),
    title: 'Soporte o solución para elevar notebook/pantalla y evitar mirar constantemente hacia abajo.',
    state: 'RESEARCH',
  },
  {
    sourceRef: source('research', 17),
    title: 'Luz adecuada para cortarse el pelo con mejor visibilidad.',
    state: 'RESEARCH',
  },
  {
    sourceRef: source('research', 18),
    title:
      'Objetos o accesorios posturales: investigar sólo si resuelven una necesidad concreta y no sustituyen ergonomía, movimiento o fortalecimiento.',
    state: 'RESEARCH',
  },
  {
    sourceRef: source('research', 19),
    title: 'Solución para neutralizar el olor del baño después de usarlo.',
    state: 'RESEARCH',
    notes:
      'Alternativas registradas en el origen: Spray neutralizador; Gotas para colocar antes de usar el inodoro; Ventilación; Absorbedor de olores; Alternativas económicas y fáciles de conseguir.',
  },
] as const;

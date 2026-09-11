import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  attachProvisionalPersonalFit,
  movieEraHandicap,
  parseExperienceProfile,
  type PersonalFitScoringRow,
} from '@/lib/media/personal-fit';
import type { MediaTitleView } from '@/types/media';

function movie(key: string, overrides: Partial<MediaTitleView> = {}): MediaTitleView {
  return {
    key,
    medium: 'movie',
    title: key,
    originalTitle: null,
    year: 2000,
    state: 'Por ver',
    bankTier: 'B',
    pool: 'Operativo',
    radar: false,
    rating: null,
    creator: 'Director base',
    genres: ['Drama', 'Thriller'],
    countries: ['Estados Unidos'],
    runtimeMinutes: 115,
    seasons: null,
    affinity: null,
    personalFitEstimate: null,
    cinephileValue: 8,
    culturalImpact: 8,
    generalScore: null,
    whyForMe: null,
    spoilerFreeSummary: null,
    whatToExpect: null,
    experienceConfidence: null,
    ...overrides,
  };
}

function row(
  key: string,
  overrides: Partial<MediaTitleView> = {},
  experience: unknown = null,
): PersonalFitScoringRow {
  return {
    view: movie(key, overrides),
    experienceProfile: parseExperienceProfile(experience),
  };
}

const richProfile = {
  character_focus: 'high',
  character_complexity: 'high',
  emotional_intensity: 'high',
  pace: 'variable',
  narrative_complexity: 'high',
  ambiguity: 'high',
  mystery_drive: 'high',
  dialogue_emphasis: 'high',
  multi_thread: true,
  moral_complexity: 'high',
  strategy_politics: 'high',
  dark_humor: 'medium',
  horror_mode: 'psychological',
  romance_mode: 'grounded',
  music_emphasis: 'high',
  visual_emphasis: 'medium',
  twist_style: 'fair_setup',
  internal_coherence: 'high',
  originality_signal: 'high',
  formula_risk: 'low',
};

const genericProfile = {
  ...richProfile,
  character_focus: 'low',
  character_complexity: 'low',
  emotional_intensity: 'low',
  narrative_complexity: 'low',
  ambiguity: 'low',
  mystery_drive: 'low',
  dialogue_emphasis: 'low',
  moral_complexity: 'low',
  strategy_politics: 'low',
  internal_coherence: 'low',
  originality_signal: 'low',
  formula_risk: 'high',
  romance_mode: 'melodramatic',
  twist_style: 'reveal_driven',
};

test('handicap temporal es leve, sólo pre-1990 y no penaliza 2010+', () => {
  assert.equal(movieEraHandicap(2026), 0);
  assert.equal(movieEraHandicap(2015), 0);
  assert.equal(movieEraHandicap(2010), 0);
  assert.equal(movieEraHandicap(2000), 0);
  assert.equal(movieEraHandicap(1990), 0);
  assert.equal(movieEraHandicap(1985), -0.08);
  assert.equal(movieEraHandicap(1975), -0.16);
  assert.equal(movieEraHandicap(1940), -0.4);
  assert.equal(movieEraHandicap(1920), -0.4);
  assert.equal(movieEraHandicap(null), 0);
});

test('Perfil experiencia se parsea de forma cerrada y un JSON inválido queda fuera', () => {
  const parsed = parseExperienceProfile(JSON.stringify(richProfile));
  assert.equal(parsed?.character_complexity, 'high');
  assert.equal(parsed?.formula_risk, 'low');
  assert.equal(parsed?.twist_style, 'fair_setup');
  assert.equal(parseExperienceProfile('{no-json'), null);
  assert.equal(parseExperienceProfile(['high']), null);
});

test('afinidad provisional usa historial observado pero nunca reemplaza una Nota real', () => {
  const rows = [
    row('vista-1', { state: 'Vista', rating: 9, year: 2001 }),
    row('vista-2', { state: 'Vista', rating: 8.5, year: 1999, creator: 'Otro' }),
    row('vista-3', { state: 'Vista', rating: 8, year: 2004, genres: ['Drama'] }),
    row('candidata', { year: 2003 }, richProfile),
  ];

  const result = attachProvisionalPersonalFit(rows);
  const observed = result.find((item) => item.key === 'vista-1');
  const candidate = result.find((item) => item.key === 'candidata');

  assert.equal(observed?.rating, 9);
  assert.equal(observed?.personalFitEstimate, null);
  assert.ok(candidate?.personalFitEstimate !== null);
  assert.ok((candidate?.personalFitEstimate ?? 0) >= 0);
  assert.ok((candidate?.personalFitEstimate ?? 11) <= 10);
});

test('el test de gustos mueve la estimación sin convertirla en una Nota observada', () => {
  const history = [
    row('vista-1', { state: 'Vista', rating: 8.5, year: 2001 }),
    row('vista-2', { state: 'Vista', rating: 8, year: 1999, creator: 'Otro A' }),
    row('vista-3', { state: 'Vista', rating: 7.5, year: 2004, creator: 'Otro B' }),
    row('vista-4', { state: 'Vista', rating: 9, year: 2007, creator: 'Otro C' }),
  ];
  const result = attachProvisionalPersonalFit([
    ...history,
    row('rica', { year: 2005 }, richProfile),
    row('generica', { year: 2005 }, genericProfile),
  ]);

  const rich = result.find((item) => item.key === 'rica');
  const generic = result.find((item) => item.key === 'generica');
  assert.ok((rich?.personalFitEstimate ?? 0) > (generic?.personalFitEstimate ?? 10));
  assert.equal(rich?.rating, null);
  assert.equal(generic?.rating, null);
});

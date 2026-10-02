import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseProfessionalSnapshot } from '@/lib/professional/contract';
import { buildProfessionalLearningHandoffPrompt } from '@/lib/professional/learning-handoff';

const snapshotPath = join(process.cwd(), 'data', 'generated', 'professional-snapshot.json');

function snapshot() {
  const parsed = parseProfessionalSnapshot(JSON.parse(readFileSync(snapshotPath, 'utf8')));
  assert.ok(parsed);
  return parsed;
}

test('PRO-HANDOFF-01. HUMAN_CORE exige intento propio antes de feedback', () => {
  const parsed = snapshot();
  const item = parsed.growth.items.find((entry) => entry.ownershipLane === 'HUMAN_CORE');
  assert.ok(item);

  const prompt = buildProfessionalLearningHandoffPrompt(item, parsed.growth.targetRoleFamily);

  assert.match(prompt, /Adaptive Learning Runtime canónico/);
  assert.match(prompt, /ATTEMPT_FIRST/);
  assert.match(prompt, /Primero pedime decidir, explicar o diagnosticar/);
  assert.match(prompt, /un escenario práctico por vez/i);
  assert.match(prompt, /variante fresca o de transferencia/i);
  assert.match(prompt, /no cambies mi ownership lane/i);
});

test('PRO-HANDOFF-02. HUMAN_PLUS_AI permite ejecución asistida pero exige verificación humana', () => {
  const parsed = snapshot();
  const item = parsed.growth.items.find((entry) => entry.ownershipLane === 'HUMAN_PLUS_AI');
  assert.ok(item);

  const prompt = buildProfessionalLearningHandoffPrompt(item, parsed.growth.targetRoleFamily);

  assert.match(prompt, /AI_ASSISTED_EXECUTION_WITH_HUMAN_VERIFICATION/);
  assert.match(prompt, /Podés ayudarme a ejecutar o bosquejar/);
  assert.match(prompt, /exigime interpretar la evidencia/);
  assert.match(prompt, /Qué tengo que poder demostrar/);
  assert.match(prompt, /Regla de evidencia fresca/);
});

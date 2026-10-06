import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseProfessionalOfferVariants } from '@/lib/professional/offer-variants-contract';

const root = join(process.cwd(), 'data', 'generated');

function generatedText(name: string): string {
  return readFileSync(join(root, name), 'utf8');
}

function repoText(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('PRO-V2-01. planes y limites gratis quedan separados', () => {
  const raw = generatedText('professional-offer-variants.json');
  const parsed = parseProfessionalOfferVariants(JSON.parse(raw));

  assert.ok(parsed);
  assert.equal(parsed.offers.length, 14);

  const free = parsed.offers.filter((offer) => offer.accessClass === 'FREE');
  assert.ok(free.length >= 3);

  for (const offer of free) {
    assert.equal(offer.headlinePriceUsdMonthly, 0);
    assert.ok(offer.keyLimit.length >= 20);
  }

  const plansByProduct = new Map<string, Set<string>>();
  for (const offer of parsed.offers) {
    const key = `${offer.provider}::${offer.product}`;
    const plans = plansByProduct.get(key) ?? new Set<string>();
    plans.add(offer.plan);
    plansByProduct.set(key, plans);
  }

  const hasMultiplePlans = [...plansByProduct.values()].some((plans) => plans.size > 1);
  assert.equal(hasMultiplePlans, true);
});

test('PRO-V2-02. comparacion no inventa un ganador', () => {
  const raw = generatedText('professional-offer-variants.json');
  const parsed = parseProfessionalOfferVariants(JSON.parse(raw));

  assert.ok(parsed);
  const group = parsed.comparisonGroups[0];
  assert.equal(group?.rankingStatus, 'COMPARISON_ONLY');
  assert.ok((group?.rankingReason.length ?? 0) > 20);
});

test('PRO-V2-03. Inteligencia queda absorbida por Profesional', () => {
  const nav = repoText('lib/constants/navigation.ts');
  const redirect = repoText('app/(app)/inteligencia/page.tsx');
  const toolsPage = repoText('app/(app)/professional/herramientas/page.tsx');
  const component = repoText('components/professional/ProfessionalTools.tsx');

  assert.equal(nav.includes("label: 'Inteligencia'"), false);
  assert.equal(redirect.includes("redirect('/professional')"), true);
  assert.equal(toolsPage.includes('getProfessionalToolsPageData'), true);
  assert.equal(component.includes('Límite principal'), true);
  assert.equal(component.includes('Gratis'), true);
});

test('PRO-V2-04. Panorama reemplaza el dashboard largo sin borrar su implementación', () => {
  const route = repoText('app/(app)/professional/page.tsx');
  const panorama = repoText('components/professional/ProfessionalPanorama.tsx');
  const legacyDashboard = repoText('components/professional/ProfessionalDashboard.tsx');

  assert.match(route, /ProfessionalPanorama/);
  assert.doesNotMatch(route, /<ProfessionalDashboard/);
  assert.match(panorama, /Tu panorama profesional/);
  assert.match(panorama, /Qué cambió \/ qué se confirma/);
  assert.match(panorama, /Qué conviene hacer ahora/);
  assert.match(legacyDashboard, /Crecimiento \/ Huecos a llenar/);
});

test('PRO-V2-05. Panorama usa datos canónicos existentes y mantiene la portada acotada', () => {
  const panorama = repoText('components/professional/ProfessionalPanorama.tsx');

  assert.match(panorama, /snapshot\.nowMoves\.slice\(0, 3\)/);
  assert.match(panorama, /snapshot\.growth\.items\[0\]/);
  assert.match(panorama, /snapshot\.forecast\.direction/);
  assert.match(panorama, /snapshot\.market\.globalSignals\[0\]/);
  assert.match(panorama, /snapshot\.strongestEvidence\[0\]/);
  assert.doesNotMatch(panorama, /Math\.random|overall score|winner/i);
  assert.doesNotMatch(panorama, /\/professional\/(mercado|crecimiento|biblioteca)/);
});

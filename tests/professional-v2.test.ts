import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import { parseProfessionalOfferVariants } from '@/lib/professional/offer-variants-contract';

const root = join(process.cwd(), 'data', 'generated');

test('PRO-V2-01. comparador conserva planes como ofertas distintas y límites Free visibles', () => {
  const parsed = parseProfessionalOfferVariants(
    JSON.parse(readFileSync(join(root, 'professional-offer-variants.json'), 'utf8')),
  );

  assert.ok(parsed);
  assert.equal(parsed.offers.length, 14);

  const free = parsed.offers.filter((offer) => offer.accessClass === 'FREE');
  assert.ok(free.length >= 3);
  assert.equal(
    free.every((offer) => offer.headlinePriceUsdMonthly === 0 && offer.keyLimit.length >= 20),
    true,
  );

  const products = new Map<string, Set<string>>();
  for (const offer of parsed.offers) {
    const key = `${offer.provider}::${offer.product}`;
    const plans = products.get(key) ?? new Set<string>();
    plans.add(offer.plan);
    products.set(key, plans);
  }
  assert.equal([...products.values()].some((plans) => plans.size > 1), true);
});

test('PRO-V2-02. primera comparación no inventa un ganador sin evidencia suficiente', () => {
  const parsed = parseProfessionalOfferVariants(
    JSON.parse(readFileSync(join(root, 'professional-offer-variants.json'), 'utf8')),
  );
  assert.ok(parsed);
  assert.equal(parsed.comparisonGroups[0]?.rankingStatus, 'COMPARISON_ONLY');
  assert.match(parsed.comparisonGroups[0]?.rankingReason ?? '', /evidence|evidencia|controlled/i);
});

test('PRO-V2-03. navegación absorbe Inteligencia y expone Herramientas', () => {
  const primaryNav = readFileSync(join(process.cwd(), 'lib/constants/navigation.ts'), 'utf8');
  const redirect = readFileSync(join(process.cwd(), 'app/(app)/inteligencia/page.tsx'), 'utf8');
  const toolsPage = readFileSync(
    join(process.cwd(), 'app/(app)/professional/herramientas/page.tsx'),
    'utf8',
  );
  const component = readFileSync(
    join(process.cwd(), 'components/professional/ProfessionalTools.tsx'),
    'utf8',
  );

  assert.doesNotMatch(primaryNav, /label: 'Inteligencia'.*href: '\/inteligencia'/);
  assert.match(redirect, /redirect\('\/professional'\)/);
  assert.match(toolsPage, /getProfessionalToolsPageData/);
  assert.match(component, /Límite principal/);
  assert.match(component, /Gratis/);
  assert.match(component, /Todavía no publico un #1 universal/);
});

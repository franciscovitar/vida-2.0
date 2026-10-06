import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

import {
  parseProfessionalOfferVariants,
  resolveProfessionalOfferVariantsText,
} from '@/lib/professional/offer-variants-contract';
import { parseProfessionalMarketDetail } from '@/lib/professional/market-detail-contract';

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
  assert.match(route, /ProfessionalPanorama/);
  assert.doesNotMatch(route, /<ProfessionalDashboard/);
  assert.match(panorama, /Tu panorama profesional/);
  assert.match(panorama, /Qué cambió \/ qué se confirma/);
  assert.match(panorama, /Qué conviene hacer ahora/);
});

test('PRO-V2-05. Panorama usa datos canónicos existentes y mantiene la portada acotada', () => {
  const panorama = repoText('components/professional/ProfessionalPanorama.tsx');

  assert.match(panorama, /snapshot\.nowMoves\.slice\(0, 3\)/);
  assert.match(panorama, /snapshot\.growth\.items\[0\]/);
  assert.match(panorama, /snapshot\.forecast\.direction/);
  assert.match(panorama, /snapshot\.market\.globalSignals\[0\]/);
  assert.match(panorama, /DecisionBadge value="ACT"/);
  assert.match(panorama, /DecisionBadge value="NO_CHANGE"/);
  assert.match(panorama, /DecisionBadge value="WATCH"/);
  assert.doesNotMatch(panorama, /Math\.random|overall score|winner/i);
  assert.match(panorama, /href="\/professional\/biblioteca"/);
});

test('PRO-V2-06. Mercado tiene ruta propia y navegación primaria interna', () => {
  const nav = repoText('components/professional/ProfessionalNavigation.tsx');
  const route = repoText('app/(app)/professional/mercado/page.tsx');
  const source = repoText('lib/data/professional-intelligence-source.ts');

  assert.match(nav, /label: 'Mercado'/);
  assert.match(nav, /href: '\/professional\/mercado'/);
  assert.match(route, /ProfessionalMarket/);
  assert.match(route, /getProfessionalMarketPageData/);
  assert.match(source, /loadCareerResilience/);
});

test('PRO-V2-07. Mercado separa geografías y no inventa remote fit', () => {
  const market = repoText('components/professional/ProfessionalMarket.tsx');

  assert.match(market, /Argentina separada de referencias internacionales/);
  assert.match(market, /EE\.UU\. funciona como referencia estructural/);
  assert.match(market, /muestras remotas acotadas por rol objetivo/);
  assert.match(market, /no como censo ni como remote-fit score/);
  assert.doesNotMatch(market, /remoteScore|employabilityScore|overall score/i);
});

test('PRO-V2-08. Mercado conserva demanda, compensación y semántica cauta de IA', () => {
  const market = repoText('components/professional/ProfessionalMarket.tsx');

  assert.match(market, /market\.internationalBenchmarks\.map/);
  assert.match(market, /market\.argentinaSalaryRoles\.map/);
  assert.match(market, /resilience\.crossRoleFindings\.map/);
  assert.match(market, /No son probabilidades\s+personales de desempleo/);
  assert.match(market, /Escenario a 5 años/);
});

test('PRO-V2-09. Panorama enlaza sólo a superficies V2 ya existentes', () => {
  const panorama = repoText('components/professional/ProfessionalPanorama.tsx');

  assert.match(panorama, /href="\/professional\/mercado"/);
  assert.match(panorama, /href="\/professional\/herramientas"/);
  assert.match(panorama, /href="\/professional\/crecimiento"/);
  assert.match(panorama, /href="\/professional\/biblioteca"/);
});

test('PRO-V2-10. Crecimiento tiene ruta propia y conserva la cola canónica', () => {
  const nav = repoText('components/professional/ProfessionalNavigation.tsx');
  const route = repoText('app/(app)/professional/crecimiento/page.tsx');
  const growth = repoText('components/professional/ProfessionalGrowth.tsx');

  assert.match(nav, /label: 'Crecimiento'/);
  assert.match(route, /ProfessionalGrowth/);
  assert.match(growth, /growth\.items\.map/);
  assert.match(growth, /buildProfessionalLearningHandoffPrompt/);
  assert.match(growth, /Completar esta cola no equivale/);
});

test('PRO-V2-11. Crecimiento separa evidencia, ownership y perfil', () => {
  const growth = repoText('components/professional/ProfessionalGrowth.tsx');

  assert.match(growth, /snapshot\.strongestEvidence\.map/);
  assert.match(growth, /snapshot\.workSplit\.own\.map/);
  assert.match(growth, /snapshot\.workSplit\.withAi\.map/);
  assert.match(growth, /snapshot\.workSplit\.delegateToAi\.map/);
  assert.match(growth, /snapshot\.delegationFrontier\.examples\.map/);
  assert.match(growth, /snapshot\.profileFindings\.map/);
});

test('PRO-V2-12. Perfil no convierte evidencia en cambios públicos automáticos', () => {
  const growth = repoText('components/professional/ProfessionalGrowth.tsx');

  assert.match(growth, /No modifica automáticamente CV, LinkedIn ni perfiles/);
  assert.doesNotMatch(growth, /employabilityScore|masteryScore|hireProbability/i);
});

test('PRO-V2-13. Biblioteca completa las cinco superficies de Profesional V2', () => {
  const nav = repoText('components/professional/ProfessionalNavigation.tsx');
  const route = repoText('app/(app)/professional/biblioteca/page.tsx');
  const source = repoText('lib/data/professional-intelligence-source.ts');

  assert.match(nav, /label: 'Biblioteca'/);
  assert.match(route, /ProfessionalLibrary/);
  assert.match(route, /getProfessionalLibraryPageData/);
  assert.match(source, /loadIntelligenceEditorialSnapshot/);
  assert.match(source, /loadTechnologyLibrary/);
});

test('PRO-V2-14. Biblioteca mantiene archivo legacy y cero deuda de lectura', () => {
  const library = repoText('components/professional/ProfessionalLibrary.tsx');
  const legacyArchive = repoText('app/(app)/inteligencia/archivo/page.tsx');
  const legacyRedirect = repoText('app/(app)/inteligencia/page.tsx');

  assert.match(library, /article\.professionalRefs\.length > 0/);
  assert.match(library, /intelligenceArticleHref/);
  assert.match(library, /No hay backlog/);
  assert.match(library, /artículos sin leer/);
  assert.match(legacyArchive, /intelligenceArticleHref/);
  assert.match(legacyRedirect, /redirect\('\/professional'\)/);
});

test('PRO-V2-15. Biblioteca tecnológica es referencia progresiva y no adopción automática', () => {
  const library = repoText('components/professional/ProfessionalLibrary.tsx');

  assert.match(library, /spotlightIds/);
  assert.match(library, /slice\(0, 6\)/);
  assert.match(library, /Explorar biblioteca completa/);
  assert.match(library, /no implica instalarla, pagarla ni aprenderla/i);
  assert.doesNotMatch(library, /unreadCount|streakCount|readingDebt|backlogCount/i);
});

test('PRO-V2-16. Panorama explicita cambio, impacto, implicación y decisión', () => {
  const panorama = repoText('components/professional/ProfessionalPanorama.tsx');

  assert.match(panorama, /Qué cambió \/ se confirma:/);
  assert.match(panorama, /Por qué importa:/);
  assert.match(panorama, /Para vos:/);
  assert.match(panorama, /'ACT' \| 'TRY' \| 'LEARN' \| 'WATCH' \| 'IGNORE' \| 'NO_CHANGE'/);
  assert.match(panorama, /moveDecision/);
});

test('PRO-V2-17. Mercado deriva roles objetivo, skills y seniority desde PAS', () => {
  const raw = generatedText('professional-market-detail.json');
  const parsed = parseProfessionalMarketDetail(JSON.parse(raw));
  const market = repoText('components/professional/ProfessionalMarket.tsx');

  assert.ok(parsed);
  assert.deepEqual(parsed.targetRoleIds, ['software-engineer', 'full-stack-product-engineer']);
  assert.equal(parsed.roles.length, 9);
  assert.ok(parsed.skillSignals.length >= 3);
  assert.equal(parsed.seniorityContext.levels.Junior, '0 to <2 years');
  assert.match(market, /Roles objetivo y barrera de entrada/);
  assert.match(market, /Skills con señal de mercado/);
  assert.match(market, /No hay un “entry barrier score” universal/);
  assert.doesNotMatch(market, /hireProbability|roleLeaderboard|overall score/i);
});

test('PRO-V2-18. Herramientas tiene selector por tarea y falla cerrado si queda stale', () => {
  const raw = generatedText('professional-offer-variants.json');
  const stale = resolveProfessionalOfferVariantsText(raw, new Date('2026-11-01T12:00:00Z'));
  const tools = repoText('components/professional/ProfessionalTools.tsx');
  const route = repoText('app/(app)/professional/herramientas/page.tsx');

  assert.equal(stale.status, 'ready');
  assert.equal(stale.stale, true);
  assert.match(tools, /data\.status !== 'ready' \|\| !data\.snapshot \|\| data\.stale/);
  assert.match(tools, /snapshot\.comparisonGroups\.map/);
  assert.match(tools, /Comparadores por tarea/);
  assert.match(tools, /Comparación sin ranking/);
  assert.match(tools, /limitProvenanceLabel/);
  assert.match(route, /group\?: string/);
});

test('PRO-V2-19. Home carga sólo el snapshot que realmente renderiza', () => {
  const source = repoText('lib/data/professional-intelligence-source.ts');

  assert.match(
    source,
    /getProfessionalIntelligencePageData\(\)[\s\S]*return \{ professional: await loadProfessionalSnapshot\(\) \}/,
  );
});

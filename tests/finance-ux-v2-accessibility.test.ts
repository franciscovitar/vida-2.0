import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

const root = process.cwd();

function source(...parts: string[]): string {
  return readFileSync(path.join(root, ...parts), 'utf8');
}

const navigation = source('components', 'finance', 'FinanceNavigation.tsx');
const navigationStyles = source('components', 'finance', 'FinanceNavigation.module.scss');
const dashboard = source('components', 'finance', 'MonthlyFinanceDashboard.tsx');
const dashboardStyles = source('components', 'finance', 'MonthlyFinanceDashboard.module.scss');
const movements = source('components', 'finance', 'FinanceMovementsBrowser.tsx');
const movementStyles = source('components', 'finance', 'FinanceMovementsBrowser.module.scss');
const chart = source('components', 'finance', 'FinanceCashFlowChart.tsx');
const analysisPage = source('app', '(app)', 'finanzas', 'analisis', 'page.tsx');
const analysisStyles = source('app', '(app)', 'finanzas', 'analisis', 'page.module.scss');
const planPage = source('app', '(app)', 'finanzas', 'plan', 'page.tsx');
const planStyles = source('app', '(app)', 'finanzas', 'plan', 'page.module.scss');
const planningDraft = source('components', 'finance', 'PlanningDraftSandbox.tsx');
const dataPage = source('app', '(app)', 'finanzas', 'datos', 'page.tsx');
const dataStyles = source('app', '(app)', 'finanzas', 'datos', 'page.module.scss');
const irregularStyles = source('components', 'finance', 'IrregularIncomePlanner.module.scss');
const draftStyles = source('components', 'finance', 'PlanningDraftSandbox.module.scss');
const purchaseStyles = source('components', 'finance', 'PurchaseScenarioCalculator.module.scss');

test('FIN-UX-E1. navegación, filtros y formularios respetan targets táctiles de 44 px', () => {
  for (const styles of [
    navigationStyles,
    movementStyles,
    analysisStyles,
    planStyles,
    dataStyles,
    irregularStyles,
    draftStyles,
    purchaseStyles,
  ]) {
    assert.match(styles, /min-height: 44px/);
    assert.equal(styles.includes('overflow-x: scroll'), false);
  }
});

test('FIN-UX-E2. los detalles interactivos conservan foco visible', () => {
  assert.match(dashboardStyles, /\.explain summary:focus-visible/);
  assert.match(movementStyles, /\.advanced summary:focus-visible/);
  assert.match(planStyles, /\.disclosure > summary:focus-visible/);
  assert.match(dataStyles, /\.disclosure > summary:focus-visible/);
  assert.match(analysisStyles, /\.disclosure > summary:focus-visible/);
});

test('FIN-UX-E3. el progreso mensual comunica valor y contexto sin depender del color', () => {
  assert.match(dashboard, /role="progressbar"/);
  assert.match(dashboard, /aria-valuenow=/);
  assert.match(dashboard, /aria-valuetext=/);
  assert.match(dashboard, /paceLabel\(model\)/);
});

test('FIN-UX-E4. el cash flow conserva valores textuales equivalentes al gráfico', () => {
  assert.match(chart, /role="group"/);
  assert.match(chart, /Ingresos/);
  assert.match(chart, /Gastos/);
  assert.match(chart, /formatMinor\(row\.incomeMinor, currency\)/);
  assert.match(chart, /formatMinor\(Math\.abs\(row\.expenseMinor\), currency\)/);
  assert.match(chart, /aria-hidden="true"/);
});

test('FIN-UX-E5. la tabla exacta puede recibir foco para scroll horizontal por teclado', () => {
  assert.match(analysisPage, /tabIndex=\{0\}/);
  assert.match(analysisPage, /desplazable horizontalmente si hace falta/);
  assert.match(analysisStyles, /\.table-wrap:focus-visible/);
});

test('FIN-UX-E6. movimientos resumen ARS sin centavos y detalle con importe exacto', () => {
  assert.match(movements, /exact \? 2 : currency === 'ARS' \? 0 : 2/);
  assert.match(movements, /movementAmount\(movement, true\)/);
});

test('FIN-UX-E7. estados de datos tienen texto explícito además del color', () => {
  for (const label of [
    'Datos al día',
    'Hay datos para revisar',
    'Cobertura parcial',
    'Fuente no disponible',
  ]) {
    assert.ok(navigation.includes(label) || dataPage.includes(label));
  }
});

test('FIN-UX-E8. el responsive evita columnas rígidas para importes largos en móvil', () => {
  assert.match(dashboardStyles, /@media \(width <= 420px\)/);
  assert.match(movementStyles, /@media \(width <= 420px\)/);
  assert.match(planStyles, /@media \(width <= 480px\)/);
});

test('FIN-UX-E9. Plan muestra una sola moneda operativa por vez y conserva selector explícito', () => {
  assert.match(planPage, /selectedCurrency/);
  assert.match(planPage, /selectedPlanning/);
  assert.match(planPage, /Planificar en/);
  assert.match(
    planPage,
    /aria-current=\{selectedCurrency === item\.currency \? 'page' : undefined\}/,
  );
});

test('FIN-UX-E10. la planificación temporal se presenta como simulación, no como configuración persistente', () => {
  assert.match(planPage, /Simular planificación/);
  assert.match(planningDraft, /Simulación local/);
  assert.match(planningDraft, />\s*Simular\s*</);
  assert.match(planningDraft, /Esta simulación es temporal/);
});

test('FIN-UX-E11. Resumen diferencia saldo líquido registrado de liquidez elegible para Plan', () => {
  assert.match(dashboard, /Saldo líquido registrado/);
  assert.match(dashboard, /Para decisiones usá Plan/);
  assert.match(dashboard, /elegibilidad y calidad de evidencia/);
});

test('FIN-UX-E12. Movimientos oculta jerga técnica del escaneo sin perderla del detalle', () => {
  assert.match(movements, /function movementTitle/);
  assert.match(movements, /economic_role/);
  assert.match(movements, /movementTitle\(movement\)/);
  assert.match(movements, /Descripción de origen/);
  assert.equal(movementStyles.includes('text-transform: capitalize'), false);
});

test('FIN-UX-E13. Datos y fuentes explica el motivo de revisión donde aparece la alerta', () => {
  assert.match(dataPage, /Integridad del registro/);
  assert.match(dataPage, /El estado requiere revisión por/);
  assert.match(dataPage, /conciliación/);
  assert.match(dataPage, /Ver conciliación ↓/);
  assert.match(dataStyles, /\.status-link/);
});

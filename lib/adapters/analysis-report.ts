/**
 * Informe determinístico para /analisis-ia (sin API de IA).
 */
import type { HabitsPageData, HealthPageData, ProductivityPageData } from '@/types/domain-pages';
import type { AnalysisObservation, AnalysisReport, TrendsPageData } from '@/types/trends';
import type { PeriodDays } from '@/lib/periods';
import { periodLabel } from '@/lib/periods';

function sourceLabel(source: 'mock' | 'google'): string {
  return source === 'mock' ? 'datos simulados (mock)' : 'Google Sheets';
}

function statusLabel(status: string): string {
  return status;
}

function lineRate(rate: number | null, completed: number, available: number): string {
  if (rate === null || available === 0) return 'Sin datos';
  return `${Math.round(rate * 100)}% (${completed}/${available} días)`;
}

function buildObservations(trends: TrendsPageData, habits: HabitsPageData): AnalysisObservation[] {
  const out: AnalysisObservation[] = [];
  let i = 0;
  const push = (text: string) => {
    out.push({ id: `obs-${i}`, text });
    i += 1;
  };

  const sleep = trends.summary.find((m) => m.id === 'sleep');
  if (sleep?.currentValue !== null && sleep?.previousValue !== null && sleep) {
    if (sleep.currentValue > sleep.previousValue) {
      push('El sueño promedio aumentó respecto del período anterior.');
    } else if (sleep.currentValue < sleep.previousValue) {
      push('El sueño promedio disminuyó respecto del período anterior.');
    } else {
      push('El sueño promedio se mantuvo igual respecto del período anterior.');
    }
  }

  const faculty = trends.summary.find((m) => m.id === 'faculty');
  if (faculty) {
    push(`Facultad tuvo datos en ${faculty.coverageLabel}.`);
  }

  const ranked = [...habits.dailyHabits].filter((h) => h.available > 0);
  if (ranked.length > 0) {
    const best = [...ranked].sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1))[0];
    const worst = [...ranked].sort((a, b) => (a.rate ?? 2) - (b.rate ?? 2))[0];
    if (best.rate !== null) {
      push(
        `${best.name} fue el hábito diario con mayor constancia (${Math.round(best.rate * 100)}%).`,
      );
    }
    if (worst.id !== best.id && worst.rate !== null) {
      push(
        `${worst.name} fue el hábito diario con menor constancia (${Math.round(worst.rate * 100)}%).`,
      );
    }
  }

  for (const rel of trends.relations) {
    if (rel.result.rho === null) {
      push(
        `No hay suficientes días coincidentes para analizar ${rel.labelX.toLowerCase()} y ${rel.labelY.toLowerCase()}.`,
      );
    }
  }

  // Limitar observaciones de “no suficientes” a las más relevantes.
  const limited = out.filter(
    (obs, index, arr) =>
      !obs.text.startsWith('No hay suficientes') ||
      arr.findIndex((o) => o.text.startsWith('No hay suficientes')) === index,
  );

  if (trends.coverage.insufficientSample) {
    push(
      'La muestra todavía es limitada; conviene registrar más días antes de sacar conclusiones.',
    );
  }

  return limited.length > 0 ? limited : out;
}

function associationLines(trends: TrendsPageData): string[] {
  const lines: string[] = [];
  for (const rel of trends.relations) {
    if (rel.result.rho === null) continue;
    const dir =
      rel.result.direction === 'positive'
        ? 'positiva'
        : rel.result.direction === 'negative'
          ? 'negativa'
          : 'nula';
    lines.push(
      `${rel.labelX} vs ${rel.labelY}: ρ=${rel.result.rho} (${dir}, ${rel.result.strengthLabel}), n=${rel.pairs} días coincidentes. ${rel.result.causalityDisclaimer}`,
    );
  }
  if (lines.length === 0) {
    lines.push('Ninguna asociación supera el mínimo de 5 pares coincidentes en este período.');
  }
  return lines;
}

function habitLines(habits: HabitsPageData): string[] {
  const lines: string[] = [];
  for (const habit of habits.dailyHabits) {
    const today =
      habit.todayStatus === 'done'
        ? 'hoy: done'
        : habit.todayStatus === 'pending'
          ? 'hoy: pending'
          : 'hoy: unavailable';
    lines.push(
      `- ${habit.name}: ${lineRate(habit.rate, habit.completed, habit.available)}; ${today}; vs anterior: ${habit.compare.label}`,
    );
  }
  lines.push('Metas semanales:');
  for (const goal of habits.weeklyGoals) {
    lines.push(
      `- ${goal.name}: ${goal.currentWeek}/${goal.target} ${goal.unit} (${goal.percent}%)`,
    );
  }
  return lines;
}

function healthLines(health: HealthPageData): string[] {
  const lines: string[] = [];
  for (const metric of health.metrics) {
    lines.push(
      `- ${metric.label}: ${metric.averageLabel}${metric.unit ? ` ${metric.unit}` : ''} · vs anterior: ${metric.compare.label}`,
    );
  }
  lines.push(`Estado de hoy: ${health.today.label}`);
  const partial = health.history.filter((row) => row.importKind === 'partial').length;
  if (partial > 0) {
    lines.push(`Importaciones parciales en el período: ${partial} días.`);
  }
  lines.push('Sin interpretación médica.');
  return lines;
}

function productivityLines(productivity: ProductivityPageData): string[] {
  const lines: string[] = [];
  for (const cat of productivity.categories) {
    lines.push(
      `- ${cat.label}: total ${cat.totalLabel}; promedio diario ${cat.dailyAverageLabel}; vs anterior: ${cat.compare.label}`,
    );
  }
  lines.push(`PC activa (período): ${productivity.activeTotalLabel}`);
  lines.push(`Cobertura: ${productivity.coverageLabel}`);
  return lines;
}

function comparisonLines(trends: TrendsPageData): string[] {
  return trends.summary.map(
    (m) =>
      `- ${m.label}: actual ${m.currentLabel}; anterior ${m.previousLabel}; Δ ${m.deltaLabel} (${m.compare.label})`,
  );
}

function limitationLines(trends: TrendsPageData): string[] {
  return [
    `Hábitos: ${trends.coverage.habitsDays} días evaluables.`,
    `Salud: ${trends.coverage.healthDays} días con datos.`,
    `Productividad: ${trends.coverage.productivityDays} días con datos.`,
    `Días de salud parcial: ${trends.coverage.partialHealthDays}.`,
    `Días sin datos en el período: ${trends.coverage.daysWithoutData}.`,
    'Las asociaciones no demuestran causalidad.',
    'No se completaron días faltantes con cero.',
    trends.coverage.insufficientSample
      ? 'La muestra todavía es limitada.'
      : 'Cobertura aceptable para una lectura exploratoria, sin afirmar causas.',
  ];
}

function questionLines(): string[] {
  return [
    '¿Qué patrones aparecen entre sueño, energía y productividad?',
    '¿Qué ajuste pequeño tendría más sentido probar durante una semana?',
    '¿Qué datos faltantes convendría registrar mejor?',
    '¿Qué hábito parece más inestable?',
  ];
}

function buildPlainText(report: Omit<AnalysisReport, 'plainText'>): string {
  const d = report;
  const blocks = [
    `VIDA 2.0 — INFORME DE ${d.periodDays} DÍAS`,
    '',
    'Período:',
    `${d.periodStart} → ${d.periodEnd} (hoy ${d.targetDate})`,
    `Fuente: ${sourceLabel(d.source)} · estado: ${statusLabel(d.status)}`,
    '',
    'Cobertura:',
    `- Hábitos: ${d.coverage.habitsDays} días`,
    `- Salud: ${d.coverage.healthDays} días`,
    `- Productividad: ${d.coverage.productivityDays} días`,
    `- Salud parcial: ${d.coverage.partialHealthDays} días`,
    `- Sin datos: ${d.coverage.daysWithoutData} días`,
    '',
    'HÁBITOS',
    ...d.sections.habits,
    '',
    'SALUD',
    ...d.sections.health,
    '',
    'PRODUCTIVIDAD',
    ...d.sections.productivity,
    '',
    'COMPARACIÓN CON EL PERÍODO ANTERIOR',
    ...d.sections.comparison,
    '',
    'ASOCIACIONES',
    ...d.sections.associations,
    '',
    'OBSERVACIONES',
    ...d.observations.map((o) => `- ${o.text}`),
    '',
    'LIMITACIONES',
    ...d.sections.limitations.map((line) => `- ${line}`),
    '',
    'PREGUNTAS PARA ANALIZAR',
    ...d.sections.questions.map((q) => `- ${q}`),
    '',
  ];
  return blocks.join('\n');
}

/** Garantiza que el texto no filtre secretos ni IDs internos. */
export function assertReportSafe(text: string): boolean {
  const forbidden = [
    /BEGIN PRIVATE KEY/i,
    /client_email/i,
    /private_key/i,
    /GOGGLE_/,
    /GOOGLE_SERVICE/,
    /\b1[A-Za-z0-9_-]{30,}\b/,
    /spreadsheetId/i,
    /credentials/i,
  ];
  return !forbidden.some((re) => re.test(text));
}

export function buildAnalysisReport(input: {
  trends: TrendsPageData;
  habits: HabitsPageData;
  health: HealthPageData;
  productivity: ProductivityPageData;
}): AnalysisReport {
  const { trends, habits, health, productivity } = input;
  const observations = buildObservations(trends, habits);
  const highlights = observations.slice(0, 4).map((o) => o.text);

  const draft: Omit<AnalysisReport, 'plainText'> = {
    source: trends.source,
    status: trends.status,
    notice: trends.notice,
    targetDate: trends.targetDate,
    periodDays: trends.periodDays,
    periodStart: trends.periodStart,
    periodEnd: trends.periodEnd,
    title: `Informe de ${periodLabel(trends.periodDays as PeriodDays)}`,
    coverage: trends.coverage,
    sections: {
      general: [
        `Período: ${trends.periodStart} → ${trends.periodEnd}`,
        `Hoy (Argentina): ${trends.targetDate}`,
        `Fuente: ${sourceLabel(trends.source)}`,
        `Cobertura hábitos/salud/productividad: ${trends.coverage.habitsDays}/${trends.coverage.healthDays}/${trends.coverage.productivityDays} días`,
      ],
      habits: habitLines(habits),
      health: healthLines(health),
      productivity: productivityLines(productivity),
      associations: associationLines(trends),
      comparison: comparisonLines(trends),
      limitations: limitationLines(trends),
      questions: questionLines(),
    },
    observations,
    highlights,
  };

  const plainText = buildPlainText(draft);
  return { ...draft, plainText };
}

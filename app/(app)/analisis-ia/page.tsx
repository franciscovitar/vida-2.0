import { Brain } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { CopyAnalysisButton } from '@/components/domain/CopyAnalysisButton';
import styles from '@/components/domain/DomainPage.module.scss';
import { PeriodSelector } from '@/components/domain/PeriodSelector';
import { IntegrationNotice } from '@/components/dashboard/IntegrationNotice';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import { getDomainPages } from '@/lib/data/domain-pages';
import { periodLabel, parsePeriodParam } from '@/lib/periods';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Análisis IA' };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function sourceLabel(source: 'mock' | 'google'): string {
  return source === 'mock' ? 'Mock' : 'Sheet DEV';
}

export default async function AnalisisIaPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string | string[] }>;
}) {
  const params = await searchParams;
  const periodDays = parsePeriodParam(params.period);
  const data = await getDomainPages(periodDays);
  const report = data.analysis;

  return (
    <div className={`${pageStyles.page} ${local.page}`}>
      <PageHeader
        title="Análisis IA"
        description={`${periodLabel(periodDays)} · informe determinístico (sin API de IA)`}
        icon={Brain}
        domain="productivity"
        action={
          <Suspense fallback={null}>
            <PeriodSelector value={periodDays} />
          </Suspense>
        }
      />

      {report.notice ? <IntegrationNotice status={report.status} message={report.notice} /> : null}

      <div className={local.toolbar}>
        <p className={styles['meta-line']}>
          <span>
            {report.periodStart} → {report.periodEnd}
          </span>
          <span>{sourceLabel(report.source)}</span>
          <span>
            Cobertura {report.coverage.habitsDays}/{report.coverage.healthDays}/
            {report.coverage.productivityDays}
          </span>
        </p>
        <CopyAnalysisButton text={report.plainText} />
      </div>

      <Card aria-labelledby="ai-highlights-title">
        <SectionHeader
          id="ai-highlights-title"
          title="Observaciones"
          description="Reglas transparentes sobre los datos disponibles. Sin especulación."
          domain="productivity"
        />
        <ul className={local.highlights}>
          {report.highlights.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-general-title">
        <SectionHeader id="ai-general-title" title="Estado general" domain="neutral" />
        <ul className={local.lines}>
          {report.sections.general.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-habits-title">
        <SectionHeader
          id="ai-habits-title"
          title="Hábitos"
          description="Se distinguen pending, missed y unavailable en el cálculo de constancia."
          domain="habits"
        />
        <ul className={local.lines}>
          {report.sections.habits.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-health-title">
        <SectionHeader
          id="ai-health-title"
          title="Salud"
          description="Sin interpretación médica."
          domain="health"
        />
        <ul className={local.lines}>
          {report.sections.health.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-prod-title">
        <SectionHeader id="ai-prod-title" title="Productividad" domain="productivity" />
        <ul className={local.lines}>
          {report.sections.productivity.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-assoc-title">
        <SectionHeader
          id="ai-assoc-title"
          title="Asociaciones observadas"
          description="Solo relaciones con al menos 5 pares. No demuestran causalidad."
          domain="productivity"
        />
        <ul className={local.lines}>
          {report.sections.associations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-compare-title">
        <SectionHeader
          id="ai-compare-title"
          title="Comparación con el período anterior"
          domain="neutral"
        />
        <ul className={local.lines}>
          {report.sections.comparison.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-limits-title">
        <SectionHeader id="ai-limits-title" title="Limitaciones" domain="neutral" />
        <ul className={local.lines}>
          {report.sections.limitations.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-questions-title">
        <SectionHeader
          id="ai-questions-title"
          title="Preguntas sugeridas para ChatGPT"
          description="No se responden automáticamente en esta fase."
          domain="productivity"
        />
        <ul className={local.questions}>
          {report.sections.questions.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>
      </Card>

      <Card aria-labelledby="ai-preview-title">
        <SectionHeader
          id="ai-preview-title"
          title="Vista previa del texto a copiar"
          description="Mismo contenido que el botón de copiar."
          domain="neutral"
        />
        <pre className={local.pre}>{report.plainText}</pre>
      </Card>
    </div>
  );
}

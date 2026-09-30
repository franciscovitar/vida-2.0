import {
  CircleGauge,
  Landmark,
  ListChecks,
  ShieldCheck,
  WalletCards,
} from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';

import pageStyles from '../page.module.scss';
import local from './page.module.scss';

export const metadata: Metadata = { title: 'Finanzas' };

const CAPABILITIES = [
  {
    title: 'Verdad financiera',
    detail:
      'Ingresos, gastos, transferencias, deudas y saldos parten de un ledger reconciliado. Lo incierto queda marcado para revisión.',
    icon: Landmark,
  },
  {
    title: 'Safe-to-Spend',
    detail:
      'La plata libre se calcula después de reserva, obligaciones y objetivos protegidos. Es capacidad, no una orden de gastar.',
    icon: CircleGauge,
  },
  {
    title: 'Decisiones con evidencia',
    detail:
      'Las compras se evalúan por su impacto sobre liquidez, resiliencia y objetivos, con supuestos visibles y sin juicios automáticos.',
    icon: ShieldCheck,
  },
] as const;

export default function FinanzasPage() {
  return (
    <div className={pageStyles.page}>
      <PageHeader
        title="Finanzas"
        description="Verdad financiera, resiliencia y decisiones con evidencia."
        icon={WalletCards}
        domain="finance"
      />

      <Card className={local.hero} aria-labelledby="finance-status-title">
        <div className={local['hero-top']}>
          <span className={local.status}>
            <span className={local.dot} aria-hidden="true" />
            Configuración inicial
          </span>
          <span className={local['data-state']}>Fuente financiera todavía no conectada</span>
        </div>
        <div className={local['hero-copy']}>
          <p className={local.eyebrow}>Finance OS V1</p>
          <h2 id="finance-status-title">Primero la verdad financiera. Después, las decisiones.</h2>
          <p>
            Esta pantalla ya forma parte de Vida 2.0, pero todavía no muestra saldos ni métricas
            personales. El siguiente paso es conectar el store financiero seguro y el primer
            importador reconciliado. Hasta entonces, no se fabrican datos ni se usan mocks.
          </p>
        </div>
      </Card>

      <div className={local['metric-grid']} aria-label="Estado de capacidades financieras">
        <Card compact>
          <span className={local['metric-label']}>Safe-to-Spend</span>
          <strong className={local.pending}>Pendiente</strong>
          <small>Se habilita cuando liquidez, reserva y compromisos estén reconciliados.</small>
        </Card>
        <Card compact>
          <span className={local['metric-label']}>Reconciliación</span>
          <strong className={local.pending}>Sin fuente</strong>
          <small>Cada saldo tendrá estado verificable: reconciliado, parcial o en conflicto.</small>
        </Card>
        <Card compact>
          <span className={local['metric-label']}>Calidad de datos</span>
          <strong className={local.pending}>Explícita</strong>
          <small>Los faltantes seguirán siendo faltantes. Nunca se reemplazan por cero.</small>
        </Card>
      </div>

      <Card aria-labelledby="finance-capabilities-title">
        <SectionHeader
          id="finance-capabilities-title"
          title="Qué va a resolver"
          description="La interfaz se construye sobre cálculos determinísticos; la IA explica después."
          icon={ListChecks}
          domain="finance"
        />
        <div className={local['capability-grid']}>
          {CAPABILITIES.map(({ title, detail, icon: Icon }) => (
            <article key={title} className={local.capability}>
              <span className={local.icon} aria-hidden="true">
                <Icon size={18} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </Card>

      <Card aria-labelledby="finance-principles-title">
        <SectionHeader
          id="finance-principles-title"
          title="Principios del sistema"
          description="Ayudar a usar la plata deliberadamente, no premiar gastar menos por gastar menos."
          icon={ShieldCheck}
          domain="finance"
        />
        <ul className={local.principles}>
          <li>Sin score opaco ni reglas universales como 50/30/20.</li>
          <li>Sin inversiones, portfolio ni ejecución de pagos dentro de Personal Finance V1.</li>
          <li>Las ayudas de comportamiento son opcionales, reversibles y se evalúan por resultados.</li>
          <li>El Copilot explica trade-offs; la decisión final siempre es humana.</li>
        </ul>
      </Card>
    </div>
  );
}

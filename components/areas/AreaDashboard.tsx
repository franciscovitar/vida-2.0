import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { MetricCard } from '@/components/ui/MetricCard';
import { SectionHeader } from '@/components/ui/SectionHeader';
import type { AreaAssessmentSummary, AreaDashboardData, AreaSummary } from '@/types/areas';

import styles from './AreaDashboard.module.scss';

function SourceList({
  data,
}: {
  data: AreaDashboardData | { sources: AreaDashboardData['sources'] };
}) {
  return (
    <ul className={styles.sources}>
      {data.sources.map((source) => (
        <li key={source.kind}>
          <span className={styles['source-kind']}>{source.kind}</span>
          <Badge domain="neutral" variant="outline">
            {source.state}
          </Badge>
          {source.notice ? <span className={styles['source-notice']}>{source.notice}</span> : null}
        </li>
      ))}
    </ul>
  );
}

export function AreasIndexView({
  summaries,
  sources,
}: {
  summaries: readonly AreaSummary[];
  sources: AreaDashboardData['sources'];
}) {
  return (
    <div className={styles.stack}>
      <ul className={styles.index}>
        {summaries.map((area) => (
          <li key={area.slug}>
            <a className={styles['index-card']} href={area.href}>
              <div className={styles['index-top']}>
                <span className={styles['index-title']}>{area.name}</span>
                <Badge domain={area.domain} variant="outline">
                  {area.status}
                </Badge>
              </div>
              {area.purpose ? <p className={styles.body}>{area.purpose}</p> : null}
              <div className={styles.meta}>
                <span>{area.activeProjectCount} proyectos activos</span>
                <span>{area.pendingTaskCount} tareas pendientes</span>
                <span>Revisión: {area.reviewDate ?? '—'}</span>
              </div>
              {area.primaryFocus ? <p className={styles.focus}>Foco: {area.primaryFocus}</p> : null}
            </a>
          </li>
        ))}
      </ul>
      <Card>
        <SectionHeader title="Fuentes" description="Estado sanitizado de integraciones." />
        <SourceList data={{ sources }} />
      </Card>
    </div>
  );
}

function TaskList({ title, items }: { title: string; items: AreaDashboardData['pendingTasks'] }) {
  if (items.length === 0) return null;
  return (
    <Card>
      <SectionHeader title={title} />
      <ul className={styles.list}>
        {items.map((task) => (
          <li key={task.key}>
            <a href={task.href} className={styles['list-title']}>
              {task.title}
            </a>
            <div className={styles.meta}>
              <span>{task.status}</span>
              {task.date ? <span>{task.date}</span> : null}
              {task.duration ? <span>{task.duration}</span> : null}
              {task.energy ? <span>{task.energy}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ProjectList({
  title,
  items,
}: {
  title: string;
  items: AreaDashboardData['activeProjects'];
}) {
  if (items.length === 0) return null;
  return (
    <Card>
      <SectionHeader title={title} />
      <ul className={styles.list}>
        {items.map((project) => (
          <li key={project.key}>
            <a href={project.href} className={styles['list-title']}>
              {project.name}
            </a>
            <div className={styles.meta}>
              <span>{project.status}</span>
              {project.dueDate ? <span>Límite: {project.dueDate}</span> : null}
            </div>
            {project.expectedResult ? (
              <p className={styles.body}>{project.expectedResult}</p>
            ) : null}
            {project.nextAction ? (
              <p className={styles.focus}>Próxima: {project.nextAction}</p>
            ) : null}
            {project.blocker ? <p className={styles.warn}>Bloqueo: {project.blocker}</p> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function formatMinutesRange(item: AreaAssessmentSummary): string | null {
  const low = item.remainingMinutesLow;
  const high = item.remainingMinutesHigh;
  if (low === null && high === null) return null;
  const render = (minutes: number) => {
    if (minutes < 60) return `${minutes} min`;
    const hours = minutes / 60;
    return Number.isInteger(hours) ? `${hours} h` : `${hours.toFixed(1)} h`;
  };
  if (low !== null && high !== null)
    return low === high ? render(low) : `${render(low)}–${render(high)}`;
  return render(low ?? high!);
}

function AssessmentList({
  items,
  notice,
}: {
  items: readonly AreaAssessmentSummary[];
  notice: string | null;
}) {
  return (
    <Card>
      <SectionHeader
        title="Instancias evaluativas"
        description="Preparación demostrada; no es probabilidad de aprobar."
      />
      {items.length === 0 ? (
        <p className={styles.body}>
          {notice ?? 'Todavía no hay evaluaciones con progreso configurado.'}
        </p>
      ) : (
        <ul className={styles['assessment-list']}>
          {items.map((item) => {
            const eta = formatMinutesRange(item);
            return (
              <li key={item.key} className={styles['assessment-item']}>
                <div className={styles['assessment-heading']}>
                  <div>
                    <span className={styles['assessment-subject']}>
                      {item.subjectId.toUpperCase()}
                    </span>
                    <span className={styles['assessment-name']}>{item.name}</span>
                  </div>
                  <span className={styles['assessment-percent']}>
                    {item.progressPercent === null ? 'Sin medir' : `${item.progressPercent}%`}
                  </span>
                </div>

                <div
                  className={styles['progress-track']}
                  role="progressbar"
                  aria-label={`${item.subjectId} ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.progressPercent ?? undefined}
                  aria-valuetext={
                    item.progressPercent === null ? 'Progreso todavía no medible' : undefined
                  }
                >
                  {item.progressPercent !== null ? (
                    <span
                      className={styles['progress-fill']}
                      style={{ width: `${item.progressPercent}%` }}
                    />
                  ) : null}
                </div>

                <div className={styles.meta}>
                  {item.assessmentDate ? (
                    <span>Fecha: {item.assessmentDate}</span>
                  ) : (
                    <span>Sin fecha</span>
                  )}
                  <span>Confianza: {item.progressConfidence}</span>
                  <span>Estado: {item.readinessBand}</span>
                  {eta ? <span>Falta aprox.: {eta}</span> : <span>ETA: sin calibrar</span>}
                  {eta ? <span>Confianza ETA: {item.etaConfidence}</span> : null}
                </div>

                {!item.scopeComplete ? (
                  <p className={styles['assessment-caveat']}>
                    Alcance todavía incompleto/provisional.
                  </p>
                ) : null}
                {item.criticalGap ? (
                  <p className={styles.body}>Brecha principal: {item.criticalGap}</p>
                ) : null}
                {item.nextBestActivity ? (
                  <p className={styles.focus}>Siguiente: {item.nextBestActivity}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function AreaDashboardView({ data }: { data: AreaDashboardData }) {
  const variant = data.variant;

  return (
    <div className={styles.stack}>
      <Card>
        <SectionHeader
          title="Prioridad y contexto"
          description={data.localContract ?? 'Contrato local no disponible.'}
          domain={data.summary.domain}
        />
        {data.northHint ? <p className={styles.focus}>Norte: {data.northHint}</p> : null}
        {data.nextAction ? <p className={styles.focus}>Próxima acción: {data.nextAction}</p> : null}
        <div className={styles.meta}>
          <span>{data.activeProjects.length} proyectos activos</span>
          <span>{data.blockedProjects.length} bloqueados</span>
          <span>{data.overdueTasks.length} tareas vencidas</span>
        </div>
      </Card>

      {data.metrics.length > 0 ? (
        <div className={styles.metrics}>
          {data.metrics.map((metric) => (
            <MetricCard
              key={metric.key}
              label={metric.label}
              value={metric.value}
              unit={metric.unit ?? undefined}
              context={metric.context ?? undefined}
              domain={data.summary.domain}
            />
          ))}
        </div>
      ) : null}

      {variant?.kind === 'facultad' ? (
        <>
          <AssessmentList items={variant.assessments} notice={variant.assessmentNotice} />
          <Card>
            <SectionHeader
              title="Facultad"
              description="Horas de estudio y secciones académicas."
            />
            <div className={styles.meta}>
              <span>Estudio semanal: {variant.studyHoursWeek ?? 'Sin datos'}</span>
              <span>{variant.studyTrend ?? 'Sin tendencia'}</span>
            </div>
            {variant.academicSections.length > 0 ? (
              <ul className={styles.list}>
                {variant.academicSections.map((section) => (
                  <li key={section}>{section}</li>
                ))}
              </ul>
            ) : (
              <p className={styles.body}>Sin secciones académicas detectadas.</p>
            )}
          </Card>
        </>
      ) : null}

      {variant?.kind === 'trabajo' ? (
        <Card>
          <SectionHeader title="Trabajo" description="Tiempo registrado cuando Sheets aplica." />
          <p className={styles.body}>
            Horas de trabajo (semana): {variant.workHoursWeek ?? 'Sin datos'}
          </p>
        </Card>
      ) : null}

      {variant?.kind === 'salud' ? (
        <Card>
          <SectionHeader
            title="Salud (resumen)"
            description="Mediciones confirmadas. No son diagnósticos ni recomendaciones médicas."
          />
          <div className={styles.meta}>
            <span>Sueño: {variant.sleepHours ?? '—'}</span>
            <span>Energía/FC: {variant.energy ?? '—'}</span>
            <span>Ánimo: {variant.mood ?? '—'}</span>
            <span>Ejercicio/pasos: {variant.exercise ?? '—'}</span>
          </div>
          {variant.coverage ? <p className={styles.body}>Cobertura: {variant.coverage}</p> : null}
        </Card>
      ) : null}

      {variant?.kind === 'personal' ? (
        <Card>
          <SectionHeader
            title="Vida personal"
            description="Sin Journaling ni datos sensibles. Compras solo si están autorizadas."
          />
          <p className={styles.body}>
            {variant.openPurchasesHint ?? 'Sin listas de compras vinculadas en este panel.'}
          </p>
        </Card>
      ) : null}

      <ProjectList title="Proyectos activos" items={data.activeProjects} />
      <ProjectList title="Proyectos bloqueados" items={data.blockedProjects} />
      <TaskList title="Tareas vencidas" items={data.overdueTasks} />
      <TaskList title="En progreso" items={data.inProgressTasks} />
      <TaskList title="Pendientes" items={data.pendingTasks} />
      <TaskList title="Bloqueadas" items={data.blockedTasks} />
      <TaskList title="Próximas por fecha" items={data.upcomingTasks} />

      <Card>
        <SectionHeader
          title="Calendar"
          description="Compromisos próximos relacionados (solo lectura)."
        />
        {data.calendar.length === 0 ? (
          <p className={styles.body}>Sin eventos relacionados o Calendar no disponible.</p>
        ) : (
          <ul className={styles.list}>
            {data.calendar.map((event) => (
              <li key={event.key}>
                <a href={event.href} className={styles['list-title']}>
                  {event.title}
                </a>
                <div className={styles.meta}>
                  <span>{event.startLabel}</span>
                  {event.endLabel ? <span>{event.endLabel}</span> : null}
                  {event.allDay ? <span>Día completo</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.integrity.length > 0 ? (
        <Card>
          <SectionHeader
            title="Integridad"
            description="Advertencias; no se corrigen automáticamente."
          />
          <ul className={styles.list}>
            {data.integrity.map((warning, index) => (
              <li key={`${warning.code}-${index}`} className={styles.warn}>
                {warning.subject}: {warning.message}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Estado de fuentes" />
        <SourceList data={data} />
      </Card>
    </div>
  );
}

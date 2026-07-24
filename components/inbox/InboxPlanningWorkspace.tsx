'use client';

import { Check, Inbox, RotateCcw, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

import { LocalDraftStatus } from '@/components/local-drafts/LocalDraftStatus';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/SectionHeader';
import {
  isArrayOf,
  isBoolean,
  isNullableString,
  isOneOf,
  isRecord,
  isString,
} from '@/lib/local-drafts/guards';
import { LOCAL_DRAFT_KEYS } from '@/lib/local-drafts/storage';
import { useLocalDraftBackup } from '@/lib/local-drafts/use-local-draft-backup';

import styles from './InboxPlanningWorkspace.module.scss';

type CaptureKind = 'idea' | 'task' | 'reference' | 'waiting';
type CaptureUrgency = 'low' | 'normal' | 'high';
type CaptureFilter = 'all' | 'pending' | 'reviewed';

interface LocalCapture {
  key: string;
  text: string;
  link: string | null;
  kind: CaptureKind;
  urgency: CaptureUrgency;
  createdAt: string;
  reviewed: boolean;
}

const KIND_LABELS: Record<CaptureKind, string> = {
  idea: 'Idea',
  task: 'Posible tarea',
  reference: 'Referencia',
  waiting: 'Esperando',
};

const CAPTURE_KINDS = ['idea', 'task', 'reference', 'waiting'] as const;
const CAPTURE_URGENCIES = ['low', 'normal', 'high'] as const;

const URGENCY_LABELS: Record<CaptureUrgency, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
};

function isLocalCapture(value: unknown): value is LocalCapture {
  return (
    isRecord(value) &&
    isString(value.key, 120) &&
    isString(value.text, 1_500) &&
    isNullableString(value.link, 2_000) &&
    isOneOf(value.kind, CAPTURE_KINDS) &&
    isOneOf(value.urgency, CAPTURE_URGENCIES) &&
    isString(value.createdAt, 40) &&
    isBoolean(value.reviewed)
  );
}

function isInboxBackup(value: unknown): value is LocalCapture[] {
  return isArrayOf(value, 200, isLocalCapture);
}

function validHttpsLink(value: string): boolean {
  if (!value.trim()) return true;
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function InboxPlanningWorkspace() {
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const [kind, setKind] = useState<CaptureKind>('idea');
  const [urgency, setUrgency] = useState<CaptureUrgency>('normal');
  const [captures, setCaptures] = useState<LocalCapture[]>([]);
  const [filter, setFilter] = useState<CaptureFilter>('all');
  const [message, setMessage] = useState<string | null>(null);

  const localDraft = useLocalDraftBackup({
    key: LOCAL_DRAFT_KEYS.inbox,
    value: captures,
    validate: isInboxBackup,
    hasContent: (value) => value.length > 0,
    onRestore: (value) => {
      setCaptures(value);
      setMessage('Cola recuperada de este navegador.');
    },
    onClear: () => {
      setCaptures([]);
      setMessage('Copia local eliminada.');
    },
  });

  const visible = useMemo(() => {
    if (filter === 'pending') return captures.filter((item) => !item.reviewed);
    if (filter === 'reviewed') return captures.filter((item) => item.reviewed);
    return captures;
  }, [captures, filter]);

  const pendingCount = captures.filter((item) => !item.reviewed).length;

  function resetForm() {
    setText('');
    setLink('');
    setKind('idea');
    setUrgency('normal');
    setMessage(null);
  }

  return (
    <div className={styles.workspace}>
      <Card>
        <SectionHeader
          title="Captura rápida"
          description="Guardá ideas y pendientes en una cola temporal para revisarlos con calma."
          icon={Inbox}
          domain="neutral"
        />
        <p className={styles['safety-notice']}>
          No se escribió ningún dato externo. La cola se guarda solo en este navegador y no
          sincroniza con Notion.
        </p>
        <LocalDraftStatus
          controller={localDraft}
          hasContent={captures.length > 0}
          label="cola de capturas"
        />
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            const cleanText = text.trim();
            if (!cleanText) {
              setMessage('Escribí una captura antes de agregarla.');
              return;
            }
            if (!validHttpsLink(link)) {
              setMessage('El enlace debe comenzar con https:// o quedar vacío.');
              return;
            }

            setCaptures((current) => [
              {
                key: crypto.randomUUID(),
                text: cleanText,
                link: link.trim() || null,
                kind,
                urgency,
                createdAt: new Date().toISOString(),
                reviewed: false,
              },
              ...current,
            ]);
            setText('');
            setLink('');
            setMessage('Captura agregada a la cola local.');
          }}
        >
          <label className={styles.field}>
            <span>Captura</span>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={4}
              maxLength={1500}
              placeholder="Idea, pendiente, dato o recordatorio que no querés perder"
              required
            />
          </label>
          <div className={styles.grid}>
            <label className={styles.field}>
              <span>Tipo provisional</span>
              <select
                className={styles.input}
                value={kind}
                onChange={(event) => setKind(event.target.value as CaptureKind)}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Urgencia</span>
              <select
                className={styles.input}
                value={urgency}
                onChange={(event) => setUrgency(event.target.value as CaptureUrgency)}
              >
                {Object.entries(URGENCY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className={styles.field}>
              <span>Enlace HTTPS opcional</span>
              <input
                className={styles.input}
                type="url"
                inputMode="url"
                value={link}
                onChange={(event) => setLink(event.target.value)}
                placeholder="https://"
              />
            </label>
          </div>
          <div className={styles.actions}>
            <Button
              type="submit"
              variant="primary"
              iconLeft={Inbox}
              className={styles['touch-button']}
            >
              Agregar a la cola
            </Button>
            <Button
              type="button"
              iconLeft={RotateCcw}
              className={styles['touch-button']}
              onClick={resetForm}
            >
              Limpiar
            </Button>
          </div>
          {message ? (
            <p className={styles.message} aria-live="polite">
              {message}
            </p>
          ) : null}
        </form>
      </Card>

      <Card>
        <SectionHeader
          title="Cola de revisión"
          description={`${pendingCount} pendientes · ${captures.length} capturas locales`}
          domain="neutral"
        />
        <div className={styles.filters} aria-label="Filtrar capturas">
          {(['all', 'pending', 'reviewed'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={styles['filter-button']}
              data-active={filter === value}
              onClick={() => setFilter(value)}
            >
              {value === 'all' ? 'Todas' : value === 'pending' ? 'Pendientes' : 'Revisadas'}
            </button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className={styles.empty}>No hay capturas para este filtro.</p>
        ) : (
          <div className={styles.queue}>
            {visible.map((capture) => (
              <article
                key={capture.key}
                className={styles['queue-item']}
                data-reviewed={capture.reviewed}
              >
                <div className={styles['queue-top']}>
                  <div>
                    <Badge domain="neutral" variant={capture.reviewed ? 'outline' : 'soft'}>
                      {KIND_LABELS[capture.kind]}
                    </Badge>
                    <Badge domain="tasks" variant="outline">
                      Urgencia {URGENCY_LABELS[capture.urgency]}
                    </Badge>
                  </div>
                  <span>{formatTime(capture.createdAt)}</span>
                </div>
                <p className={styles.body}>{capture.text}</p>
                {capture.link ? (
                  <a className={styles.link} href={capture.link} target="_blank" rel="noreferrer">
                    Abrir enlace
                  </a>
                ) : null}
                <div className={styles.actions}>
                  <Button
                    type="button"
                    size="sm"
                    iconLeft={Check}
                    className={styles['touch-button']}
                    onClick={() =>
                      setCaptures((current) =>
                        current.map((item) =>
                          item.key === capture.key ? { ...item, reviewed: !item.reviewed } : item,
                        ),
                      )
                    }
                  >
                    {capture.reviewed ? 'Volver a pendiente' : 'Marcar revisada'}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    iconLeft={Trash2}
                    className={styles['touch-button']}
                    onClick={() =>
                      setCaptures((current) => current.filter((item) => item.key !== capture.key))
                    }
                  >
                    Quitar
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

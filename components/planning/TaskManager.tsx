'use client';

import { Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';

import {
  archivePlanningTask,
  createPlanningTask,
  updatePlanningTask,
} from '@/app/actions/tasks';
import {
  TASK_DURATIONS,
  TASK_ENERGIES,
  TASK_PRIORITIES,
  TASK_STATUSES,
} from '@/lib/notion/constants';
import type {
  PlanningTaskCatalog,
  PlanningTaskCreateInput,
  PlanningTaskEditableSnapshot,
  PlanningTaskItem,
} from '@/types/planning';

import styles from './TaskManager.module.scss';

type EditorState =
  | { mode: 'closed' }
  | { mode: 'create'; operationId: string }
  | { mode: 'edit'; task: PlanningTaskItem };

function emptyCreate(catalog: PlanningTaskCatalog): PlanningTaskCreateInput {
  return {
    operationId: crypto.randomUUID(),
    title: '',
    priority: 'Media',
    areaKey: catalog.areas[0]?.key ?? '',
    projectKey: null,
    date: null,
    duration: null,
    energy: null,
    note: null,
  };
}

function taskSnapshot(task: PlanningTaskItem): PlanningTaskEditableSnapshot {
  return {
    title: task.title,
    status: task.status,
    date: task.date,
    priority: task.priority,
    duration: task.duration,
    energy: task.energy,
    areaKey: task.areaKey,
    projectKey: task.projectKey,
    blocker: task.blocker,
    note: task.note,
  };
}

function nullable(value: string): string | null {
  return value.trim() ? value.trim() : null;
}

export function TaskManager({
  catalog,
  writable,
}: {
  catalog: PlanningTaskCatalog;
  writable: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editor, setEditor] = useState<EditorState>({ mode: 'closed' });
  const [createDraft, setCreateDraft] = useState<PlanningTaskCreateInput>(() => emptyCreate(catalog));
  const [editDraft, setEditDraft] = useState<PlanningTaskEditableSnapshot | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('abiertas');
  const [message, setMessage] = useState<string | null>(null);
  const [deleteTask, setDeleteTask] = useState<PlanningTaskItem | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('es');
    return catalog.tasks.filter((task) => {
      if (
        statusFilter === 'abiertas' &&
        (task.status === 'Hecha' || task.status === 'Algún día')
      ) {
        return false;
      }
      if (statusFilter !== 'todas' && statusFilter !== 'abiertas' && task.status !== statusFilter) {
        return false;
      }
      if (!q) return true;
      return [task.title, task.areaName, task.projectName, task.note]
        .filter(Boolean)
        .some((value) => value!.toLocaleLowerCase('es').includes(q));
    });
  }, [catalog.tasks, query, statusFilter]);

  const openCreate = () => {
    const next = emptyCreate(catalog);
    setCreateDraft(next);
    setEditor({ mode: 'create', operationId: next.operationId });
    setMessage(null);
  };

  const openEdit = (task: PlanningTaskItem) => {
    setEditDraft(taskSnapshot(task));
    setEditor({ mode: 'edit', task });
    setMessage(null);
  };

  const closeEditor = () => {
    setEditor({ mode: 'closed' });
    setEditDraft(null);
  };

  const submitCreate = () => {
    setMessage(null);
    startTransition(async () => {
      const result = await createPlanningTask(createDraft);
      setMessage(result.message);
      if (result.ok) {
        closeEditor();
        setCreateDraft(emptyCreate(catalog));
        router.refresh();
      }
    });
  };

  const submitEdit = () => {
    if (editor.mode !== 'edit' || !editDraft) return;
    const original = taskSnapshot(editor.task);
    setMessage(null);
    startTransition(async () => {
      const result = await updatePlanningTask({
        taskKey: editor.task.key,
        expected: original,
        next: editDraft,
      });
      setMessage(result.message);
      if (result.ok) {
        closeEditor();
        router.refresh();
      }
    });
  };

  const confirmDelete = () => {
    if (!deleteTask) return;
    const target = deleteTask;
    setMessage(null);
    startTransition(async () => {
      const result = await archivePlanningTask({
        taskKey: target.key,
        expectedTitle: target.title,
        expectedStatus: target.status,
        confirmation: 'eliminar',
      });
      setMessage(result.message);
      if (result.ok) {
        setDeleteTask(null);
        router.refresh();
      }
    });
  };

  const projectOptions = (areaKey: string | null) =>
    catalog.projects.filter((project) => !areaKey || !project.areaKey || project.areaKey === areaKey);

  return (
    <div className={styles.manager}>
      <div className={styles.toolbar}>
        <div className={styles.filters}>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar tarea"
            aria-label="Buscar tarea"
          />
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filtrar por estado"
          >
            <option value="abiertas">Abiertas</option>
            <option value="todas">Todas</option>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>
        <button type="button" className={styles.primary} onClick={openCreate} disabled={!writable || pending}>
          <Plus size={16} aria-hidden="true" />
          Nueva tarea
        </button>
      </div>

      {!writable ? (
        <p className={styles.notice}>Las escrituras están desactivadas; el listado sigue disponible en lectura.</p>
      ) : null}
      {message ? <p className={styles.notice} role="status">{message}</p> : null}

      <p className={styles.count}>{visible.length} de {catalog.tasks.length} tareas</p>

      <ul className={styles.list}>
        {visible.map((task) => (
          <li key={task.key} className={styles.task}>
            <div className={styles['task-main']}>
              <strong>{task.title}</strong>
              <div className={styles.meta}>
                <span>{task.status}</span>
                {task.priority ? <span>Prioridad {task.priority}</span> : null}
                {task.duration ? <span>{task.duration}</span> : null}
                {task.energy ? <span>Energía {task.energy}</span> : null}
                {task.date ? <span>Fecha {task.date}</span> : null}
              </div>
              <div className={styles.meta}>
                {task.areaName ? <span>{task.areaName}</span> : null}
                {task.projectName ? <span>{task.projectName}</span> : null}
                {task.blocker ? <span>Bloqueo: {task.blocker}</span> : null}
              </div>
            </div>
            <div className={styles.actions}>
              <button type="button" onClick={() => openEdit(task)} disabled={!writable || pending}>
                <Pencil size={14} aria-hidden="true" />
                Editar
              </button>
              <button
                type="button"
                className={styles.danger}
                onClick={() => setDeleteTask(task)}
                disabled={!writable || pending}
              >
                <Trash2 size={14} aria-hidden="true" />
                Eliminar
              </button>
            </div>
          </li>
        ))}
      </ul>

      {visible.length === 0 ? <p className={styles.empty}>No hay tareas para este filtro.</p> : null}

      {editor.mode !== 'closed' ? (
        <div className={styles.overlay} role="presentation">
          <section className={styles.panel} role="dialog" aria-modal="true" aria-labelledby="task-editor-title">
            <header className={styles['panel-header']}>
              <div>
                <h3 id="task-editor-title">{editor.mode === 'create' ? 'Nueva tarea' : 'Editar tarea'}</h3>
                <p>{editor.mode === 'create' ? 'Se crea en Pendiente.' : 'Los cambios usan verificación contra el estado que abriste.'}</p>
              </div>
              <button type="button" className={styles['icon-button']} onClick={closeEditor} aria-label="Cerrar">
                <X size={18} />
              </button>
            </header>

            {editor.mode === 'create' ? (
              <div className={styles.form}>
                <label>
                  <span>Título</span>
                  <input
                    value={createDraft.title}
                    onChange={(event) => setCreateDraft((draft) => ({ ...draft, title: event.target.value }))}
                  />
                </label>
                <label>
                  <span>Prioridad</span>
                  <select
                    value={createDraft.priority}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({
                        ...draft,
                        priority: event.target.value as PlanningTaskCreateInput['priority'],
                      }))
                    }
                  >
                    {TASK_PRIORITIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Área</span>
                  <select
                    value={createDraft.areaKey}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({ ...draft, areaKey: event.target.value, projectKey: null }))
                    }
                  >
                    {catalog.areas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Proyecto</span>
                  <select
                    value={createDraft.projectKey ?? ''}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({ ...draft, projectKey: event.target.value || null }))
                    }
                  >
                    <option value="">Sin proyecto</option>
                    {projectOptions(createDraft.areaKey).map((project) => (
                      <option key={project.key} value={project.key}>{project.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Fecha relevante</span>
                  <input
                    type="date"
                    value={createDraft.date ?? ''}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({ ...draft, date: event.target.value || null }))
                    }
                  />
                </label>
                <label>
                  <span>Duración</span>
                  <select
                    value={createDraft.duration ?? ''}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({
                        ...draft,
                        duration: (event.target.value || null) as PlanningTaskCreateInput['duration'],
                      }))
                    }
                  >
                    <option value="">Sin estimar</option>
                    {TASK_DURATIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Energía</span>
                  <select
                    value={createDraft.energy ?? ''}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({
                        ...draft,
                        energy: (event.target.value || null) as PlanningTaskCreateInput['energy'],
                      }))
                    }
                  >
                    <option value="">Sin estimar</option>
                    {TASK_ENERGIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label className={styles.full}>
                  <span>Nota</span>
                  <textarea
                    value={createDraft.note ?? ''}
                    onChange={(event) =>
                      setCreateDraft((draft) => ({ ...draft, note: nullable(event.target.value) }))
                    }
                  />
                </label>
                <div className={styles['form-actions']}>
                  <button type="button" onClick={closeEditor}>Cancelar</button>
                  <button type="button" className={styles.primary} onClick={submitCreate} disabled={pending || !createDraft.title.trim() || !createDraft.areaKey}>
                    Crear tarea
                  </button>
                </div>
              </div>
            ) : editDraft ? (
              <div className={styles.form}>
                <label className={styles.full}>
                  <span>Título</span>
                  <input value={editDraft.title} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, title: event.target.value }) : draft)} />
                </label>
                <label>
                  <span>Estado</span>
                  <select value={editDraft.status} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, status: event.target.value as PlanningTaskEditableSnapshot['status'] }) : draft)}>
                    {TASK_STATUSES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Prioridad</span>
                  <select value={editDraft.priority ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, priority: (event.target.value || null) as PlanningTaskEditableSnapshot['priority'] }) : draft)}>
                    <option value="">Sin prioridad</option>
                    {TASK_PRIORITIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Área</span>
                  <select value={editDraft.areaKey ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, areaKey: event.target.value || null, projectKey: null }) : draft)}>
                    <option value="">Sin área</option>
                    {catalog.areas.map((area) => <option key={area.key} value={area.key}>{area.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Proyecto</span>
                  <select value={editDraft.projectKey ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, projectKey: event.target.value || null }) : draft)}>
                    <option value="">Sin proyecto</option>
                    {projectOptions(editDraft.areaKey).map((project) => <option key={project.key} value={project.key}>{project.name}</option>)}
                  </select>
                </label>
                <label>
                  <span>Fecha relevante</span>
                  <input type="date" value={editDraft.date ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, date: event.target.value || null }) : draft)} />
                </label>
                <label>
                  <span>Duración</span>
                  <select value={editDraft.duration ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, duration: (event.target.value || null) as PlanningTaskEditableSnapshot['duration'] }) : draft)}>
                    <option value="">Sin estimar</option>
                    {TASK_DURATIONS.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Energía</span>
                  <select value={editDraft.energy ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, energy: (event.target.value || null) as PlanningTaskEditableSnapshot['energy'] }) : draft)}>
                    <option value="">Sin estimar</option>
                    {TASK_ENERGIES.map((value) => <option key={value}>{value}</option>)}
                  </select>
                </label>
                <label>
                  <span>Bloqueo</span>
                  <input value={editDraft.blocker ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, blocker: nullable(event.target.value) }) : draft)} />
                </label>
                <label className={styles.full}>
                  <span>Nota</span>
                  <textarea value={editDraft.note ?? ''} onChange={(event) => setEditDraft((draft) => draft ? ({ ...draft, note: nullable(event.target.value) }) : draft)} />
                </label>
                <div className={styles['form-actions']}>
                  <button type="button" onClick={closeEditor}>Cancelar</button>
                  <button type="button" className={styles.primary} onClick={submitEdit} disabled={pending || editDraft.title.trim().length < 3}>
                    Guardar cambios
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}

      {deleteTask ? (
        <div className={styles.overlay} role="presentation">
          <section className={styles.confirm} role="dialog" aria-modal="true" aria-labelledby="delete-task-title">
            <h3 id="delete-task-title">Eliminar tarea</h3>
            <p>
              <strong>{deleteTask.title}</strong> se enviará a la papelera de Notion. No se borra permanentemente.
            </p>
            <div className={styles['form-actions']}>
              <button type="button" onClick={() => setDeleteTask(null)} disabled={pending}>Cancelar</button>
              <button type="button" className={styles['danger-primary']} onClick={confirmDelete} disabled={pending}>
                Eliminar a papelera
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Controlador puro del estado optimista de hábitos.
 * Bloqueo por hábito, restauración ante error y deshacer.
 */
export type HabitSaveState = 'idle' | 'saving' | 'saved' | 'error' | 'conflict';

export interface OptimisticHabit {
  id: string;
  value: boolean;
  save: HabitSaveState;
  canUndo: boolean;
}

export type BeginToggleResult =
  { ok: true; previous: boolean; nextValue: boolean } | { ok: false; reason: 'locked' | 'noop' };

/**
 * Estado mutable de interacción (un tablero).
 * El segundo toque sobre el mismo hábito queda bloqueado; los demás siguen libres.
 */
export class HabitOptimisticController {
  readonly items: OptimisticHabit[];
  private readonly pending = new Set<string>();

  constructor(initial: readonly OptimisticHabit[]) {
    this.items = initial.map((item) => ({ ...item }));
  }

  isLocked(id: string): boolean {
    const item = this.items.find((habit) => habit.id === id);
    return this.pending.has(id) || item?.save === 'saving';
  }

  /** true si algún otro hábito distinto de busyId no está en saving. */
  othersRemainInteractive(busyId: string): boolean {
    return this.items
      .filter((habit) => habit.id !== busyId)
      .every((habit) => habit.save !== 'saving' && !this.pending.has(habit.id));
  }

  beginToggle(id: string, nextValue: boolean): BeginToggleResult {
    const item = this.items.find((habit) => habit.id === id);
    if (!item) return { ok: false, reason: 'noop' };
    if (this.isLocked(id)) return { ok: false, reason: 'locked' };
    if (item.value === nextValue) return { ok: false, reason: 'noop' };

    const previous = item.value;
    this.pending.add(id);
    item.value = nextValue;
    item.save = 'saving';
    item.canUndo = false;
    return { ok: true, previous, nextValue };
  }

  succeed(id: string, currentValue: boolean, allowUndo: boolean): void {
    this.pending.delete(id);
    const item = this.items.find((habit) => habit.id === id);
    if (!item) return;
    item.value = currentValue;
    item.save = 'saved';
    item.canUndo = allowUndo;
  }

  fail(id: string, previous: boolean, conflict: boolean): void {
    this.pending.delete(id);
    const item = this.items.find((habit) => habit.id === id);
    if (!item) return;
    item.value = previous;
    item.save = conflict ? 'conflict' : 'error';
    item.canUndo = false;
  }

  /** Deshacer: nuevo toggle hacia el valor opuesto, usando el valor guardado como expected. */
  beginUndo(id: string): BeginToggleResult {
    const item = this.items.find((habit) => habit.id === id);
    if (!item || !item.canUndo) return { ok: false, reason: 'noop' };
    return this.beginToggle(id, !item.value);
  }
}

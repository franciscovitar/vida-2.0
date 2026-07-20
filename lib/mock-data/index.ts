/**
 * Punto único de acceso a los datos simulados de Vida 2.0.
 *
 * Cuando se conecten las fuentes reales (Google Sheets, Notion, Google
 * Calendar), cada export puede reemplazarse por una función de carga que
 * respete los mismos contratos de `types`, sin tocar los componentes.
 */
export { habits } from './habits';
export { dailyHealth } from './health';
export { productivity } from './productivity';
export { tasks } from './tasks';
export { projects } from './projects';
export { todayEvents } from './calendar';
export { weeklyGoals } from './goals';
export { dailyFocus, inboxSeed, referenceDate, syncState } from './today';

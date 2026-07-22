# Fase 8E — setup externo (Work)

Este documento describe **solo** lo que Work debe preparar fuera del código.
No contiene IDs reales ni secretos.

## Objetivo

Habilitar escrituras seguras detrás de `WRITE_ACTIONS_ENABLED=true` en un entorno
controlado (nunca Production sin backup y validación).

## 1. Base Notion — Acciones y propuestas de Vida 2.0

Crear un data source / base con propiedades conceptuales:

| Propiedad        | Tipo      | Notas                                                      |
| ---------------- | --------- | ---------------------------------------------------------- |
| Nombre           | title     | Obligatorio                                                |
| actionType       | select    | Valores del Policy Engine permitido                        |
| targetType       | select    | task / inbox / gym-session / proposal / …                  |
| targetKey        | rich_text | Clave opaca (no UUID crudo al cliente)                     |
| status           | select    | pending / approved / rejected / applied / failed / expired |
| confirmationMode | select    | explicit / reinforced                                      |
| risk             | select    | low / medium / high                                        |
| reversible       | checkbox  |                                                            |
| payloadSanitized | rich_text | JSON sanitizado, sin secretos                              |
| beforeSummary    | rich_text |                                                            |
| afterSummary     | rich_text |                                                            |
| idempotencyKey   | rich_text | Único por actor+acción                                     |
| createdAt        | date      |                                                            |
| decidedAt        | date      |                                                            |
| appliedAt        | date      |                                                            |
| resultCode       | rich_text |                                                            |

### Permisos mínimos

- Integración Notion con **capacidad de insertar/actualizar** solo en esta base y en
  Tareas + página Bandeja (si se habilita captura).
- Sin acceso a Journaling ni bases privadas.
- Sin permiso de borrar/archivar/fusionar páginas.

Variable: `NOTION_ACTIONS_DATA_SOURCE_ID` (solo servidor).

## 2. Página Bandeja

- Compartir con la integración la página canónica de Bandeja (lista simple).
- Variable: `NOTION_INBOX_PAGE_ID`.
- La app **agrega** capturas; no borra ni reclasifica automáticamente.

## 3. Google Sheets — Gimnasio

Crear dos pestañas (nombres sugeridos; el rango exacto va por env):

### Gym Sessions (headers)

`sessionId | date | routineKey | workoutDayKey | startedAt | finishedAt | durationMinutes | energyBefore | notes | status | idempotencyKey | createdAt`

### Gym Sets (headers)

`sessionId | exerciseKey | exerciseName | setIndex | weight | reps | rir | rpe | completed | notes`

Variables:

- `SHEETS_GYM_SESSIONS_RANGE` (ej. `Gym Sessions!A:L`)
- `SHEETS_GYM_SETS_RANGE` (ej. `Gym Sets!A:J`)

La escritura usa el patrón seguro de hábitos (celda/fila por PUT), no `values.append`
estructural ni borrados.

### Permisos Sheets

- Cuenta de servicio Editor solo sobre el Sheet target (`dev` primero).
- Production: además `GOOGLE_SHEETS_ALLOW_PROD_WRITES=true` y backup previo.

## 4. Variables por entorno

| Variable                        | Local    | Preview  | Production          |
| ------------------------------- | -------- | -------- | ------------------- |
| `WRITE_ACTIONS_ENABLED`         | false    | false    | false hasta validar |
| `NOTION_INBOX_PAGE_ID`          | opcional | opcional | solo si captura     |
| `NOTION_ACTIONS_DATA_SOURCE_ID` | opcional | opcional | solo si propuestas  |
| `SHEETS_GYM_SESSIONS_RANGE`     | opcional | opcional | solo si gym write   |
| `SHEETS_GYM_SETS_RANGE`         | opcional | opcional | solo si gym write   |

No exponer estas variables al cliente. No hardcodear IDs en el repo.

## 5. Recursos a compartir

1. Base de propuestas (arriba).
2. Página Bandeja.
3. Pestañas Gym Sessions / Gym Sets.
4. Data sources Tareas (ya existentes) con write limitado a create + status.

## 6. Prueba real que debe hacer Work

1. En local/dev: `WRITE_ACTIONS_ENABLED=true` + variables DEV.
2. Crear tarea de prueba → verificar en Notion → cambiar estado → verificar.
3. Captura en `/bandeja` → aparece en página Bandeja; texto no se pierde si falla config.
4. Registrar sesión gym corta → fila `pending` → sets → `complete`.
5. Crear propuesta Calendar → aprobar → **no** debe existir evento en Calendar.
6. Confirmar que Journaling sigue inaccesible.
7. Apagar flag y verificar que la UI vuelve a solo lectura.

## 7. Restauración

1. `WRITE_ACTIONS_ENABLED=false` (o ausente).
2. Revocar permiso Editor de la integración sobre bases de escritura si hace falta.
3. No borrar historial de propuestas; marcar `failed`/`expired` manualmente si quedó basura de prueba.
4. Restaurar Sheet desde backup si hubo filas de gym de prueba en canónico (evitar escribir canónico en pruebas).

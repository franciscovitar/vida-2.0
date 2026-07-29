# Block 3 — datos base DEV (referencia contractual)

Datos persistentes mínimos, sintéticos y no personales que Work debe crear de forma
idempotente en recursos **DEV** antes de reactivar QA real de escrituras.

No usar Producción. No consultar Journaling. No borrar estas filas al terminar: son
catálogo DEV, no fixtures transitorios.

## Área base obligatoria

Base: **Vida 2.0 DEV — Áreas**

Fila exacta:

| Campo             | Valor                                                      |
| ----------------- | ---------------------------------------------------------- |
| Área              | Salud                                                      |
| Estado            | Activa                                                     |
| Propósito         | Referencia sintética DEV para QA de escrituras reversibles |
| Fecha de revisión | null                                                       |

Reglas:

- Buscar por título exacto (`Salud`) antes de crear.
- Máximo una fila activa con ese título.
- No sustituir por claves hardcodeadas en la UI (`area.salud` no es catálogo).

## Proyecto base recomendado

Base: **Vida 2.0 DEV — Proyectos**

Fila exacta:

| Campo              | Valor                                          |
| ------------------ | ---------------------------------------------- |
| Proyecto           | QA Bloque 3                                    |
| Estado             | Activo                                         |
| Área               | relación a la fila Salud DEV                   |
| Resultado esperado | Validar escrituras reversibles en recursos DEV |
| Bloqueo            | null                                           |
| Fechas             | null                                           |

Reglas:

- Idempotente (buscar por título exacto).
- Máximo uno.
- Persistente como referencia DEV.

## Tareas

No crear tarea base permanente.

La tarea creada por `task.create` (aprobada) se usa después para `task.change-status`
y finalmente se compensa con rollback.

## Secuencia correcta de QA real

1. `task.create` → approve (Área = Salud DEV; Proyecto opcional = QA Bloque 3).
2. Refrescar catálogo de tareas en la web.
3. `task.change-status` sobre la tarea recién creada.
4. Rollback de `task.change-status`.
5. Rollback de `task.create`.

Así no se depende de una `taskKey` inventada ni de una tarea permanente.

## Otras acciones

- `inbox.capture`: destino Bandeja DEV accesible (página canónica).
- `gym.session.create`: hojas DEV con headers exactos de Sessions/Sets.
- `calendar.hold.create`: calendario dedicado DEV (no primary) legible.

Flags externas permanecen apagadas hasta que Work reactive el entorno de QA.

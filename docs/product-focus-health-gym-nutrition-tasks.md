# Foco de producto — Salud, Gimnasio, Nutrición y planificación

Estado: activo desde 2026-09-01.

## Dirección de producto

Vida Web debe ser principalmente la capa visual y de decisión de Vida 2.0:

```text
ChatGPT para operar y capturar
→ fuentes canónicas para guardar
→ Vida Web para ver, entender y decidir
```

No agregar formularios web ni bases paralelas si el flujo conversacional y la fuente canónica ya resuelven la captura.

## Prioridad actual

1. Salud V2.
2. Gimnasio V2.
3. Nutrición V2.
4. Tareas + planificación del día.
5. Evaluación del día.
6. Dashboard Hoy que conecte los módulos anteriores.

Telegram/OpenClaw queda diferido; su canary permanece implementado pero no es blocker de este roadmap.

## Salud V2

Objetivo: responder visualmente y con trazabilidad a cuatro preguntas:

- ¿Cómo estoy?
- ¿Estoy mejorando o empeorando respecto de mí mismo?
- ¿Qué cambió y qué merece atención?
- ¿Qué ajuste pequeño podría tener sentido probar?

Fuente canónica: `Sistema de hábitos y compromisos` → `Salud y experimentos`.

La web no duplica esos datos. Lee métricas observadas y deriva vistas.

### V2.0 — primer bloque

- Consumir las métricas de Health Sync V2 ya disponibles, manteniendo compatibilidad con filas históricas.
- Agrupar visualmente Sueño / Corazón y recuperación / Movimiento / Oxígeno / Energía.
- Mostrar tendencia del período, comparación contra período anterior y baseline personal de 30 días.
- Mostrar calidad/cobertura de importación y no convertir faltantes en cero.
- Generar observaciones determinísticas de cambios y cobertura.
- Mantener una vista diaria auditable.

### V2.1 — después del primer bloque

- Benchmarks poblacionales con fuente, población aplicable, fecha y confianza explícitas.
- Separar siempre `tu baseline` de `referencia poblacional`.
- No convertir wearables en diagnóstico clínico.
- Agregar asociaciones multi-métrica solo con muestra suficiente y disclaimer de causalidad.
- Mejorar recomendaciones/experimentos personales usando hechos → asociaciones → inferencias → recomendación.

## Gimnasio V2

Fuentes canónicas: rutina/definiciones en Notion + `Gym Sessions` / `Gym Sets` en Sheets.

La web debe mostrar progreso por ejercicio, cargas/volumen, constancia, comparaciones temporales y nivel contextual. Las referencias externas de fuerza deben ser trazables y no mezclarse con la evolución personal.

## Nutrición V2

Fuente canónica: `Nutrition Intelligence — Structured Store`.

La web debe visualizar calorías/macros/micronutrientes, cumplimiento de targets, comidas y tendencias, sin reemplazar el flujo conversacional de registro.

## Tareas + planificación del día

Fuente canónica: Notion Tasks; Calendar aporta bloques y compromisos.

Objetivo: convertir Tareas en el centro operativo de Vida Web y combinar:

- tareas pendientes;
- prioridades/fechas/duración cuando existan;
- agenda real;
- contexto disponible de energía/sueño;
- propuesta de planificación del día;
- evaluación al cierre: planeado vs hecho, pendientes y aprendizaje para el día siguiente.

La planificación de IA debe proponer; no crear una segunda fuente de verdad ni inventar restricciones ausentes.

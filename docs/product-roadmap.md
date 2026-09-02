# Vida 2.0 — Product roadmap

## Product direction

Vida Web is the visual and decision layer of the personal operating system. It should help turn canonical data into context, metrics, trends, interpretation, decisions and actions without becoming another place to maintain the same data manually.

Operating model:

- Chat/conversational interfaces are the primary way to operate and capture intent.
- Google Sheets remains canonical for quantitative metrics, habits, health, gym and nutrition stores.
- Notion remains canonical for areas, projects, tasks, definitions, Inbox and operational content.
- Google Calendar remains canonical for agenda and time blocks.
- Vida Web consumes those sources to visualize, interpret and support decisions.
- `personal-ai-system` owns reusable intelligence, workflows, routing, security and governance.

Do not duplicate a canonical datum into Vida Web unless a bounded derived/cache representation is technically required. Derived views must not become a new source of truth.

## Current product priority

Build in this order unless a verified blocker or explicit product decision changes it:

1. Salud V2
2. Gimnasio V2
3. Nutrición V2
4. Tareas + planificación del día
5. Evaluación del día
6. Dashboard `Hoy` that composes the system

The guiding question is: **does this make life easier to manage, or does it only add complexity?**

## Salud V2 principles

`/salud` already exists and must evolve from the current real Sheets-backed view rather than being rebuilt as a parallel system.

Health V2 should prioritize fast visual understanding:

- answer “how am I?”, “better or worse?”, “what changed?”, “what deserves attention?” and “what should I keep doing?”;
- use real charts, strong hierarchy, semantic color, period comparisons and personal baselines;
- group information into meaningful domains such as summary, sleep, recovery/heart, movement, oxygen and activity;
- be mobile-first and avoid table-heavy presentation as the primary experience;
- show missing data as missing, never as zero;
- avoid invented composite scores or false precision;
- keep personal baselines distinct from external/population references;
- add external benchmarks only when population, source, date and confidence are explicit;
- treat wearable data mainly as longitudinal/trend evidence, not diagnosis.

Intelligence must preserve this hierarchy:

**observed datum → metric → trend → association → inference → recommendation**

Do not present correlation as causality. Do not invent medical diagnoses. Deterministic analysis that already exists should be reused or evolved rather than discarded.

## Delivery approach

Prefer incremental slices that create visible product value quickly. For non-trivial work: current state → smallest coherent change → tests/build → diff review → Preview → visual evaluation. Do not redesign the whole architecture before the value is visible.

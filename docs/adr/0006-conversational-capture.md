# ADR 0006 — Captura conversacional; Vida Web como centro de observación y decisión

- Estado: Accepted
- Fecha: 2026-08-30

## Contexto

Vida 2.0 busca reducir fricción y mantenimiento manual. Las primeras superficies de Safe Writes
expusieron formularios web para crear tareas, capturas, sesiones de gimnasio y holds de Calendar.
Esos formularios fueron útiles para validar contratos, policy, idempotencia, auditoría y rollback,
pero no representan la experiencia cotidiana deseada.

La entrada real del usuario suele ser desordenada y conversacional: texto o audio con una comida,
un entrenamiento, una tarea, una idea o un compromiso. Obligar a elegir primero una pantalla, un
formulario y una fuente de verdad agrega trabajo en lugar de quitarlo.

## Decisión

La experiencia objetivo queda resumida así:

> **Chat para operar. Vida Web para ver, entender y decidir. Fuentes canónicas para guardar.**

Vida Web no será la superficie principal de captura cotidiana. Las rutas de Tareas, Bandeja,
Gimnasio y Calendar deben priorizar visualización, contexto, métricas, tendencias y revisión; no
formularios de alta manual.

La entrada evoluciona por canales conversacionales:

1. ChatGPT como primer canal;
2. Telegram como siguiente canal simple de mensajería;
3. WhatsApp como canal posterior cuando su integración esté justificada.

El flujo objetivo es:

```text
mensaje o audio desordenado
→ interpretación conversacional
→ intención(es) estructurada(s)
→ validación + política
→ aclaración / aprobación sólo cuando corresponda
→ runtime seguro de Vida
→ fuente canónica
→ Vida Web como vista derivada
```

## Frontera Vida / Personal AI System

- **Personal AI System (PAS):** conocimiento reutilizable para interpretar intención, extraer datos,
  enrutar, decidir qué información falta y aplicar políticas generales de agentes/herramientas.
- **Vida 2.0:** contratos concretos del producto, adapters y reglas de escritura sobre las fuentes
  reales (`task.create`, `inbox.capture`, `gym.session.create`, `calendar.hold.create`, etc.).
- **OpenClaw:** puede servir como transporte/ejecutor o gateway para canales externos, pero no es la
  autoridad de negocio y no puede eludir las políticas de Vida ni las aprobaciones requeridas.

No duplicar conocimiento general del PAS dentro de Vida.

## Fuentes de verdad

La decisión no cambia las fuentes canónicas:

- Notion → áreas, proyectos, tareas y contenido operativo.
- Google Sheets → gimnasio, nutrición, hábitos, salud, sueño, productividad y métricas derivadas.
- Google Calendar → agenda y bloques de tiempo.
- Vida Web → vistas derivadas, interpretación y revisión; no una base paralela.

El canal conversacional no se convierte en fuente de verdad: solo interpreta y enruta hacia la
fuente correspondiente.

## Safe Writes

Safe Writes se conserva. El trabajo ya validado de Policy Engine, propuestas cifradas, leases,
idempotencia, auditoría, ownership y rollback sigue siendo infraestructura valiosa por debajo de la
experiencia conversacional.

La decisión es quitar los **emisores manuales de la experiencia cotidiana**, no eliminar el motor.
Los componentes existentes pueden permanecer temporalmente en el repo mientras contratos/tests los
usen o hasta que una limpieza separada demuestre que son innecesarios.

`/aprobaciones` permanece como consola excepcional para revisar propuestas, riesgo, conflictos o
acciones que realmente requieran una decisión humana. No debe ser el paso obligatorio para cada
registro rutinario.

## Política de fricción

La capa conversacional debe elegir la menor fricción compatible con seguridad:

- intención clara + acción de bajo riesgo + reversible + política que permita aplicar → ejecutar y
  devolver confirmación breve;
- dato ambiguo o insuficiente → preguntar solo lo que falta;
- acción sensible, destructiva o con consecuencia relevante → proponer y pedir aprobación;
- autorización o precondición no verificable → fail-closed.

La existencia de esta ADR no habilita auto-apply por sí sola. Cada acción debe tener una política
explícita antes de cambiar su comportamiento actual de aprobación.

## Consecuencias de UI inmediatas

- `/tareas`: no monta alta/cambio de estado ni borradores locales de creación; conserva resumen y
  listado de las tareas canónicas.
- `/bandeja`: no ofrece captura manual/local; comunica la transición a captura conversacional.
- `/gimnasio`: no monta carga manual de sesión; conserva dashboard/rutina/contexto/historial.
- `/aprobaciones`: no origina Calendar Holds; conserva operabilidad, revisión y decisiones sobre
  propuestas ya existentes.

No se rediseña el resto de Vida por esta decisión. Cualquier otra superficie de entrada se revisa
por separado para evitar un cambio de alcance innecesario.

## Calendar Hold

El E2E que se estaba preparando desde el formulario web de Calendar se detiene como certificación de
UX porque validaría un camino que deja de ser experiencia objetivo. El runtime Calendar Hold puede
seguir siendo necesario para la futura captura conversacional y debe conservar sus barreras de
calendario dedicado, privacidad, ownership y rollback.

Si la integración externa de Calendar se retoma, se revalida el estado real y se prueba desde la
frontera conversacional o con un harness técnico acotado, no reintroduciendo el formulario como
flujo cotidiano.

## Próximo bloque: Conversational Capture V1

Diseñar e implementar un contrato normalizado que pueda recibir una entrada desordenada y producir
cero, una o varias intenciones estructuradas con:

- tipo de intención;
- datos extraídos;
- campos faltantes;
- confianza/evidencia suficiente sin inventar precisión;
- acción destino de Vida;
- política de `apply`, `ask` o `approval`;
- idempotency key y trazabilidad del canal.

Primer objetivo funcional: que una conversación con ChatGPT pueda registrar de manera segura una
entrada real en la fuente correcta sin obligar al usuario a abrir Vida Web ni elegir manualmente la
base de destino. Telegram y WhatsApp se agregan después sobre el mismo contrato, no como lógicas
paralelas.

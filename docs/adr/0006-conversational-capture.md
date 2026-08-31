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

> **Chat para operar. Fuentes canónicas para guardar. Vida Web para ver, entender y decidir.**

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
→ interpretación conversacional (PAS / Skill de dominio)
→ intención(es) estructurada(s)
→ fuente canónica + política aplicable
→ aclaración / aprobación sólo cuando corresponda
→ conector confiable directo a la fuente, o runtime de Vida cuando realmente haga falta
→ Notion | Google Sheets | Google Calendar | Drive
→ Vida Web como vista derivada
```

La API/runtime de Vida **no es un paso obligatorio** entre ChatGPT y la fuente de verdad. Si el canal
tiene un conector confiable y autorizado a la fuente canónica, y el contrato/política vigente permite
la acción, debe preferirse la escritura directa a esa fuente antes que convertir Vida en un proxy o
una base intermedia.

## Frontera Vida / Personal AI System

- **Personal AI System (PAS):** conocimiento reutilizable para interpretar intención, extraer datos,
  enrutar, decidir qué información falta y aplicar políticas generales de agentes/herramientas.
- **Skills de dominio:** semántica específica de cada dominio. Gym Intelligence y Nutrition
  Intelligence pueden estructurar una observación y escribir en sus stores canónicos de Sheets
  cuando el conector y la política lo permiten, sin pasar por Vida Web.
- **Vida 2.0:** contratos concretos del producto, vistas derivadas y, cuando aporte una frontera de
  seguridad o capacidad que la fuente/conector no resuelve por sí solo, adapters/runtime de escritura
  (`task.create`, `inbox.capture`, `gym.session.create`, `calendar.hold.create`, etc.).
- **OpenClaw:** puede servir como transporte/ejecutor o gateway para canales externos, pero no es la
  autoridad de negocio y no puede eludir las políticas de Vida ni las aprobaciones requeridas.

No duplicar conocimiento general del PAS dentro de Vida.

## Fuentes de verdad

La decisión no cambia las fuentes canónicas:

- Notion → áreas, proyectos, tareas y contenido operativo.
- Google Sheets → gimnasio, nutrición, hábitos, salud, sueño, productividad y métricas derivadas.
- Google Calendar → agenda y bloques de tiempo.
- Google Drive → archivos/evidencia pesada u originales cuando corresponda.
- Vida Web → vistas derivadas, interpretación y revisión; no una base paralela.

El canal conversacional no se convierte en fuente de verdad: solo interpreta y enruta hacia la
fuente correspondiente. Tampoco se debe copiar un dato a Vida únicamente para que la Web pueda
mostrarlo; la Web debe leerlo desde su autoridad canónica.

## Preferencia de ejecución: directo a la autoridad

Cuando existan varias rutas técnicamente posibles, usar esta prioridad:

1. **Conector directo y confiable a la fuente canónica**, si la operación está autorizada y conserva
   las garantías necesarias para ese dato.
2. **Adapter/runtime de Vida**, si agrega una frontera necesaria de validación, idempotencia,
   ownership, auditoría, rollback o permisos que no puede garantizarse de forma equivalente con el
   conector directo.
3. **Gateway externo (por ejemplo OpenClaw)** sólo como transporte/ejecutor, reutilizando el mismo
   contrato y sin crear otra fuente de verdad.

No introducir una API de Vida, webhook, cola, hoja intermedia o base adicional únicamente para que
ChatGPT pueda escribir algo que ya puede guardar de manera segura en Notion, Sheets, Calendar o
Drive.

Ejemplos objetivo:

```text
"hice jalón 60 x 8, 7 y 6"
→ ChatGPT → Gym Intelligence → Google Sheets Gym → Vida Web lee

"comí 300 g de milanesa y una banana"
→ ChatGPT → Nutrition Intelligence → Google Sheets Nutrition → Vida Web lee

"tengo que entregar Redes el jueves"
→ ChatGPT → Conversational Capture → Notion Tareas → Vida Web lee

"martes 18 a 20 tengo fútbol"
→ ChatGPT → Conversational Capture → Google Calendar → Vida Web lee
```

## Safe Writes

Safe Writes se conserva. El trabajo ya validado de Policy Engine, propuestas cifradas, leases,
idempotencia, auditoría, ownership y rollback sigue siendo infraestructura valiosa para las acciones
donde Vida deba proveer esas garantías.

La decisión es quitar los **emisores manuales de la experiencia cotidiana** y evitar convertir Safe
Writes en un proxy obligatorio para toda captura. Los componentes existentes pueden permanecer
mientras contratos/tests los usen, como fallback seguro para canales externos o hasta que una
limpieza separada demuestre que son innecesarios.

`/aprobaciones` permanece como consola excepcional para revisar propuestas, riesgo, conflictos o
acciones que realmente requieran una decisión humana. No debe ser el paso obligatorio para cada
registro rutinario.

## Política de fricción

La capa conversacional debe elegir la menor fricción compatible con seguridad:

- intención clara + acción de bajo riesgo + reversible + política que permita aplicar → ejecutar en
  la fuente canónica y devolver confirmación breve;
- dato ambiguo o insuficiente → preguntar solo lo que falta;
- acción sensible, destructiva o con consecuencia relevante → proponer y pedir aprobación;
- autorización o precondición no verificable → fail-closed.

La existencia de esta ADR no habilita auto-apply por sí sola. Cada acción y cada conector deben tener
una política explícita antes de cambiar su comportamiento actual.

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
seguir siendo necesario para un canal que no tenga una integración directa de Calendar o para una
acción que necesite sus barreras de calendario dedicado, privacidad, ownership y rollback.

Si ChatGPT dispone de una integración autorizada de Google Calendar que satisface el contrato de la
acción, no debe pasar por Calendar Hold sólo para mantener una arquitectura uniforme. Si la
integración externa de Calendar se retoma mediante Vida, se revalida el estado real y se prueba desde
una frontera conversacional o con un harness técnico acotado, no reintroduciendo el formulario como
flujo cotidiano.

## Conversational Capture V1

El contrato normalizado debe recibir una entrada desordenada y producir cero, una o varias intenciones
estructuradas con:

- tipo de intención;
- datos extraídos;
- campos faltantes;
- confianza/evidencia suficiente sin inventar precisión;
- fuente canónica destino;
- operación/capacidad requerida;
- política de `apply`, `ask` o `approval`;
- ruta de ejecución mínima y confiable disponible;
- idempotency key y trazabilidad del canal cuando la operación lo requiera.

Primer objetivo funcional: que una conversación con ChatGPT pueda registrar de manera segura una
entrada real **directamente en la fuente correcta** sin obligar al usuario a abrir Vida Web, elegir
manualmente la base de destino ni atravesar la API de Vida cuando no aporta una garantía necesaria.
Telegram y WhatsApp se agregan después sobre el mismo contrato semántico, no como lógicas paralelas.

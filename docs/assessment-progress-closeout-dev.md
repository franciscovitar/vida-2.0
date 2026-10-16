# Assessment Progress — cierre de sesión DEV

Estado: **SHADOW_READ_ONLY; automatización recurrente BLOCKED**. Implementación
local, sin endpoint, adaptador de persistencia ni transporte conectado.

## Evidencia y fuente

El owner confirmó el 16/10/2026 una escritura individual DEV, readback exacto y
visualización QA autenticada, con porcentaje null. Se acepta como evidencia del
transporte individual. No se repitió esa prueba ni se copiaron sus datos al repo.
No certifica concurrencia, persistencia del ledger ni escritor recurrente.

Fuente revisada: PAS privado `main`, SHA
`1d10ea947cbb0ca4716edcf01fbcc3001e2b05bc`, especialmente:

- `START_HERE.md`, `AI/BOOTSTRAP.md`.
- `AI/projects/university/ASSESSMENT_PROGRESS_CONTRACT.md` y
  `ASSESSMENT_PROGRESS_SNAPSHOT_CONTRACT.md`.
- `AI/projects/university/CHAT_LEARNING_EVIDENCE_POLICY.md`.
- `AI/projects/tasks-daily-planning/MINIMAL_CHATGPT_VIDA_DELIVERY_2026-10-14.md`,
  `MORNING_TRIGGER_CONTRACT.md` y reconciliación universitaria vigente.

No se cambia la decisión de PAS. No se incorpora estado académico privado,
snapshots, IDs de workbook, transcripciones ni credenciales al repositorio público.

## Reutilización comprobada

| Pieza existente                         | Reutilización / límite                                                                                                                                                                                               |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Patrón V1 `morning-v1`                  | Identidad estable, payload estricto, replay y readback. Su secuencia leer→append no prueba exclusión atómica multiagente; el contrato permite investigar incertidumbre. Aquí nunca se habilita reintento automático. |
| `assessment-progress/snapshot.ts`       | Mismo parser, payload de 13 campos y lector real. Sin cambios al contrato ni al historial.                                                                                                                           |
| `write-reconciliation-v2.ts`            | Mismas ocho columnas, confirmación/duplicado/conflicto/incertidumbre. El cierre añade igualdad del timestamp después de un despacho nuevo.                                                                           |
| `inspectPlanningV2DevReadback`          | Lectura completa existente, sesión autorizada y destino DEV. Disponible para integración futura; no invocada en esta tarea.                                                                                          |
| `actions/coordination.ts`               | Referencia de CAS/reserva. Sus reservas y resultados tienen TTL; no se conectan como ledger académico durable.                                                                                                       |
| `dispatch-ledger-v2.ts`                 | Candidato no expirante por snapshot, sin recibo por cierre ni slot global entre materias. No basta por sí solo.                                                                                                      |
| `google-append-once-v2.ts` / compilador | Un solo intento, sin retries. La rama académica admite únicamente baseline vacío y conserva ese límite; no se amplía ni activa.                                                                                      |

La documentación previa del overlay no certifica aislamiento físico/retención
QA del store. No se inspeccionaron configuraciones remotas en esta tarea y no
se afirma que su estado actual esté verificado. Los prototipos Firestore y el
ledger de Actions no constituyen permiso para provisionar ni reutilizar un backend.

## Delta local

`closeout-candidate.ts` proyecta un cierre en una fila `assessment-progress-v1`:

- Resuelve materia/evaluación/nombre/tipo/fecha desde contexto de emisor confiable;
  admite los siete dueños y rechaza identidad no resuelta. No inventa instancias
  a partir de una fecha reportada ni crea un assessment para una materia sin él.
- Exige autorización para ese cierre; contexto ausente bloquea. Es validación
  estructural: un objeto con hashes **no autentica** a un usuario ni a ChatGPT.
- Separa intención (actor + materia + evaluación + cierre + versión) de snapshot
  de contenido. El digest congela fila, timestamp, procedencia, destino y emisor.
  Un replay cambiado produce conflicto; un cierre nuevo sin cambio material no
  agrega otra fila idéntica.
- Porcentaje canónico requiere alcance completo y referencias digest del alcance,
  modelo y evidencia; ETA requiere referencia de calibración. Son declaraciones
  que el emisor debe verificar contra el dueño, no pruebas de dominio por sí solas.
  No se calcula preparación ni se añade otro motor de aprendizaje en Vida.
- Proxy conversacional, cobertura efectiva, conversación y campos desconocidos
  son rechazados. Sin medida canónica: null, nunca cero de conveniencia.
- Requisitos verificados de TP usan otra base que preparación para examen.
  Entrega y defensa requieren IDs y evidencia propios; requisitos no dan readiness
  oral. El emisor debe resolver esa distinción desde PAS, no por palabras del título.
- La procedencia de la fecha (oficial, Calendar o reportada) queda ligada al recibo,
  sin nuevas columnas ni cambio de significado en el lector.

`closeout-dispatch-model.ts` es un **reductor puro**, sin llamadas al proveedor:

1. Requiere un agregado durable preexistente con binding inmutable de actor,
   escritor y destino DEV. Store ausente/corrupto no inicia una historia nueva.
2. Prelectura completa, esquema exacto y parseo real. Duplicados, filas inválidas,
   pérdida de historia confirmada o cierre anterior/empatado bloquean.
3. Propone grabar recibo `dispatched` y un único slot ocupado para las siete
   materias en la **misma operación CAS por revisión**. Dos procesos pueden
   proponer; solamente el ganador de un CAS durable confirmado podría enviar.
4. Persistencia debe confirmar antes de un único intento sin retry del proveedor.
   Si se pierde el ACK del CAS, no se envía. Si el proceso cae antes del envío,
   también queda retenido: se sacrifica disponibilidad antes que duplicar.
5. Un envío sin readback exacto no confirma nada. Ausencia, error o lectura
   incompleta mantienen cuarentena global. Solo readback exacto puede resolver
   incertidumbre sin reenviar. Duplicado/conflicto requieren investigación.
6. Replay jamás devuelve otro efecto de despacho. No hay TTL, borrado, liberación
   por reloj ni rearmado. Confirmación libera el slot, conserva el recibo y permite
   una intención nueva con cambio material y timestamp posterior.

`effect` es una propuesta del modelo, **no permiso de envío**. Los tests usan CAS
en memoria exclusivamente como modelo determinístico. No prueban durabilidad,
retención, autorización, aislamiento ni exclusividad reales. Este protocolo
modela una decisión de despacho como máximo; **no promete exactly-once de Sheets**.

Límite conservador: una vuelta a contenido histórico cuyo ID ya existe, pero no
es el vigente, bloquea. No se duplica un ID ni se dice que el estado viejo volvió
a ser actual. Revisar identidad/versionado por separado si aparece ese caso en
el piloto; no inventar sufijos ni alterar historia automáticamente.

## Bloqueos reales antes de conectar el escritor

1. Certificar un emisor autenticado de cierre desde los proyectos de materias,
   alcance de consentimiento y control de replay/CSRF. Las rutas actuales de
   propuestas no ofrecen una acción académica de cierre. No se añadió una ruta
   que acepte contexto de autenticación o evidencia afirmado por el cliente.
2. Demostrar en el store existente CAS durable del agregado completo, retención
   sin expiración/evicción, aislamiento QA de Production, recuperación y un único
   origen autorizado de escrituras. Permisos del conector por fuera del emisor
   también deben quedar controlados. Namespace o lock con TTL no bastan.
   El paquete congelado y su procedencia deben poder recuperarse privadamente
   después de una caída; el modelo conserva digests, no las evidencias originales.
   Sin ese paquete no se reconstruye ni rearma una intención cambiando timestamp
   o leyendo el estado académico más reciente: se mantiene la cuarentena.
3. Adaptar solo después el transporte existente para cierres validados con
   evidencia y destino DEV comprobado contra metadata real. Mantener la identidad
   lectora de Vida; no convertir su credencial en escritora por conveniencia.

No se decide infraestructura nueva. Si el store existente no puede demostrar
esas garantías, presentar al owner la limitación y alternativas antes de avanzar.
Hasta entonces: cierre útil en ChatGPT, estado **NO GUARDADO**, sin automatización
recurrente ni autorización implícita para filas reales.

## Siguiente paso para IOP

Primero auditar en modo lectura las garantías del store/emisor existentes; no
repetir el canary individual que ya pasó. Con esa evidencia, revisar el adaptador
durable mínimo y el transporte. Después solicitar autorización específica para
**un cierre real de IOP en DEV**, con evaluación resuelta desde PAS main, evidencia
sanitizada, porcentaje null mientras siga sin medir, una intención y un intento.
Verificar fila exacta y QA autenticada; probar replay sin nuevo envío y conservar
el recibo. Si hay incertidumbre, detener despachos e investigar por lectura.
Eso no certifica por sí solo las siete materias ni habilita Production.

## QA local observada

- 162/162 tests PASS: `assessment-closeout` (31 nuevos), `assessment-progress`,
  `append-cells-v2`, `write-reconciliation-v2`, `dispatch-protocol-v2`,
  `google-append-once-v2`, `dispatch-ledger-v2`,
  `phase-f-academic-evidence-contract` y `phase-f-academic-reconciliation`.
- `npm run typecheck`, ESLint de los tres archivos TS nuevos, `npm run stylelint`,
  Prettier de todos los archivos cambiados y `git diff --check`: PASS.
- `npm run build` completo: PASS. El primer intento falló porque Turbopack no
  acepta `node_modules` enlazado a otro worktree; se reemplazó exclusivamente ese
  enlace local por una copia de las mismas dependencias. Sin cambios al lockfile
  ni a configuración de build. No hubo fallos de compilación del delta.
- Sin escrituras reales, red del escritor, QA autenticada nueva, push o deploy.
  La prueba de CAS es un modelo determinístico; store/retención/exclusividad
  reales continúan sin certificar.

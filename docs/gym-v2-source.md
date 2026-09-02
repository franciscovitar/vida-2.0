# Gimnasio V2 — fuente y comparaciones

## Fuente canónica

El historial cuantitativo de Gimnasio vive en un spreadsheet dedicado, separado del Sheet de hábitos. Vida Web solo lo lee para construir vistas derivadas.

Configuración server-side requerida:

- `GOOGLE_GYM_SPREADSHEET_ID`: referencia al spreadsheet canónico de Gimnasio.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`: credencial de servicio de la capa Sheets.

El ID real no se hardcodea en código, tests ni documentación. La cuenta de servicio debe tener el permiso mínimo necesario sobre el archivo.

Pestañas consumidas en este slice:

- `Gym Sessions`
- `Gym Sets`

`Cardio Sessions` queda fuera del primer slice de Gimnasio V2.

## Comparaciones personales V2.0

La pantalla distingue:

1. semana actual vs el mismo punto de la semana anterior;
2. último registro vs sesión comparable anterior del mismo ejercicio;
3. último registro vs base personal de observaciones previas;
4. distribución descriptiva de series recientes por grupo muscular.

Para comparar sets con distinta combinación de carga y repeticiones se usa e1RM de Epley como índice personal únicamente en sets de 1–15 repeticiones. El set observado (`kg × reps`) permanece visible. La estimación no se presenta como 1RM medido.

Cambios de fuerza estimada dentro de ±2 % se tratan visualmente como estables para evitar sobrerrepresentar ruido pequeño.

## Benchmark fijo V2.2

La comparación externa se mantiene separada de la evolución personal. No consulta una web ni actualiza umbrales en runtime.

La única tabla canónica del benchmark de fuerza vive versionada en:

- `lib/gym/strength-benchmark-baseline.ts`

Versión inicial:

- `2026-09-02-v1`

La tabla fue fijada explícitamente para Vida 2.0 a partir de la referencia aprobada por el usuario y contiene 16 referencias masculinas de 1RM absoluto: jalón al pecho, remo máquina, press banca máquina, press militar máquina, curl de bíceps con mancuerna, elevación lateral con mancuerna, press francés polea, tríceps pushdown, face pull, prensa horizontal, hip thrust, curl femoral tumbado, abductores máquina, aductores máquina, gemelos máquina de pie y sóleo/gemelo sentado.

Los valores de mancuernas son por mancuerna. La tabla no se duplica en este documento para evitar dos fuentes de verdad; los umbrales exactos están únicamente en el archivo canónico anterior y están cubiertos por tests.

### Cálculo

El benchmark no usa directamente el peso de una serie. Calcula e1RM mediante Epley:

`e1RM = carga × (1 + repeticiones / 30)`

La implementación del benchmark está en `lib/gym/strength-estimation.ts`.

Solo se clasifica un set de 1–15 repeticiones. Por encima de 15 reps se conserva el registro personal, pero no se inventa un e1RM para el benchmark.

Para cada ejercicio se muestra:

- set observado (`kg × reps`);
- e1RM estimado;
- nivel actual (`Principiante`, `Novato`, `Intermedio`, `Avanzado` o `Élite`; por debajo del primer umbral se muestra `Inicial`);
- próximo umbral;
- porcentaje recorrido dentro del nivel actual hacia el siguiente.

El nivel general usa una mediana conservadora de los niveles disponibles por ejercicio, para que una sola marca extrema no domine el resumen.

### Comparabilidad y confianza

La tabla es fija, pero la comparabilidad física no es igual para todos los ejercicios:

- mancuernas compatibles: confianza alta;
- poleas/cables con definición razonablemente alineada: confianza media;
- máquinas cuya palanca, recorrido o carga inicial puede cambiar: confianza baja;
- hip thrust de máquina usa la referencia como proxy del movimiento convencional y se marca con confianza baja.

La confianza no modifica los umbrales; comunica cuánto confiar en la comparación externa. El progreso personal del mismo ejercicio sigue siendo la señal prioritaria.

La pantalla mantiene unos pocos ejercicios destacados y `Ver todos los ejercicios` para revisar el resto de forma compacta. Los ejercicios registrados que todavía no existen en la tabla siguen visibles como progreso personal y aparecen `Sin benchmark`. Un ejercicio incluido en la tabla pero cuyo último set no permite e1RM aparece `Sin e1RM`.

No se ajusta por peso corporal ni edad en este slice. No se realizan ni recomiendan tests reales de 1RM para alimentar el dashboard.

## Frontera de escritura

Gimnasio V2 permanece read-only en este slice. La ruta de escritura existente queda alineada preventivamente con la misma fuente dedicada para evitar split-brain:

- una escritura Gym nunca reutiliza implícitamente `GOOGLE_SHEETS_TARGET`, `GOOGLE_SHEETS_DEV_ID` ni `GOOGLE_SHEETS_PROD_ID` del Sheet general de hábitos;
- el único target aceptado por el cliente Gym es `GOOGLE_GYM_SPREADSHEET_ID` del entorno actual;
- además de `WRITE_ACTIONS_ENABLED`, una escritura real exige la compuerta exacta `GOOGLE_GYM_SHEETS_ALLOW_WRITES=true`;
- si falta el ID dedicado, la credencial o la compuerta, el puerto falla cerrado antes de escribir;
- la compuerta nace apagada y no se activa en este PR;
- Preview puede usar en el futuro un valor distinto de `GOOGLE_GYM_SPREADSHEET_ID` mediante configuración de entorno, sin hardcodear targets en código.

## Seguridad

- lectura solamente en Gimnasio V2;
- sin IDs reales en el cliente;
- ninguna escritura fue habilitada ni ejecutada en este slice;
- sin fallback silencioso al spreadsheet de hábitos;
- faltantes no se convierten en cero;
- la UI distingue observación, estimación y benchmark;
- la UI describe asociaciones/cambios, no causas ni diagnósticos.

# Gimnasio V2 — fuente y comparaciones

## Fuente canónica

El historial cuantitativo de Gimnasio vive en un spreadsheet dedicado, separado del Sheet de hábitos.
Vida Web solo lo lee para construir vistas derivadas.

Configuración server-side requerida:

- `GOOGLE_GYM_SPREADSHEET_ID`: referencia al spreadsheet canónico de Gimnasio.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`: credencial de servicio ya usada por la capa Sheets.

El ID real no se hardcodea en código, tests ni documentación. La cuenta de servicio debe tener el permiso mínimo necesario sobre el archivo.

Pestañas consumidas en este slice:

- `Gym Sessions`
- `Gym Sets`

`Cardio Sessions` queda fuera del primer slice de Gimnasio V2.

## Comparaciones V2.0

La pantalla distingue:

1. semana actual vs el mismo punto de la semana anterior;
2. último registro vs sesión comparable anterior del mismo ejercicio;
3. último registro vs base personal de observaciones previas;
4. distribución descriptiva de series recientes por grupo muscular.

Para comparar sets con distinta combinación de carga y repeticiones se usa e1RM de Epley como índice personal únicamente en sets de 1–15 repeticiones. El set observado (`kg × reps`) permanece visible. La estimación no se presenta como 1RM medido ni se usa para comparar máquinas diferentes.

Cambios de fuerza estimada dentro de ±2 % se tratan visualmente como estables para evitar sobrerrepresentar ruido pequeño.

## Benchmarks externos

`principiante / intermedio / avanzado` no se asigna todavía de forma automática.

Las cargas de máquinas y poleas no son directamente comparables entre equipamientos. Antes de habilitar un benchmark externo cada ejercicio elegible debe tener:

- definición compatible del ejercicio;
- fuente externa trazable;
- población/contexto aplicable;
- fecha de la referencia;
- unidad y, cuando corresponda, normalización por peso corporal;
- nivel de confianza explícito.

La referencia externa siempre debe aparecer separada de la evolución personal.

## Seguridad

- lectura solamente en Gimnasio V2;
- sin IDs reales en el cliente;
- sin nuevas escrituras;
- sin fallback silencioso al spreadsheet de hábitos;
- faltantes no se convierten en cero;
- la UI describe asociaciones/cambios, no causas ni diagnósticos.

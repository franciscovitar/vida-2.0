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

## Benchmark externo V2.1

La referencia externa se mantiene separada de la evolución personal y solo se habilita para ejercicios cuya carga sea compatible con la definición de la fuente.

Primer alcance habilitado:

- sexo de referencia: masculino;
- modalidad: estándares absolutos, sin ajuste por peso corporal ni edad;
- fuente: Strength Level;
- corte de datos declarado por la fuente: 2026-03-05;
- ejercicios compatibles: `Dumbbell Curl` y `Dumbbell Lateral Raise`;
- las cargas publicadas por Strength Level son por mancuerna;
- se compara el e1RM estimado del último set comparable con los umbrales de 1RM publicados;
- confianza `media` cuando hay al menos dos ejercicios compatibles y `baja` cuando solo hay uno.

Umbrales masculinos capturados para este slice:

| Nivel | Curl mancuerna | Elevación lateral mancuerna |
| --- | ---: | ---: |
| Principiante | 7 kg | 4 kg |
| Novato | 13 kg | 9 kg |
| Intermedio | 21 kg | 16 kg |
| Avanzado | 31 kg | 24 kg |
| Élite | 42 kg | 34 kg |

Fuentes trazables:

- https://strengthlevel.com/strength-standards/dumbbell-curl/kg
- https://strengthlevel.com/strength-standards/dumbbell-lateral-raise/kg

La población de referencia son usuarios/lifts de Strength Level; no se presenta como una muestra representativa de la población general. El e1RM sigue siendo una estimación, no un test de 1RM medido.

Máquinas y poleas permanecen excluidas: sus cargas no son directamente comparables entre equipamientos. Para sumar otro ejercicio se exige definición compatible, fuente trazable, población/contexto aplicable, fecha de referencia, unidades consistentes y confianza explícita.

Una futura versión puede agregar normalización por peso corporal y/o edad cuando esos datos formen parte de un contexto explícito y confiable; no se infieren desde otras fuentes.

## Seguridad

- lectura solamente en Gimnasio V2;
- sin IDs reales en el cliente;
- sin nuevas escrituras;
- sin fallback silencioso al spreadsheet de hábitos;
- faltantes no se convierten en cero;
- la UI describe asociaciones/cambios, no causas ni diagnósticos.

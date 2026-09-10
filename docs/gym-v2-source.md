# Gimnasio V2 — fuente y comparaciones

## Fuente canónica

El historial cuantitativo de Gimnasio vive en un spreadsheet dedicado, separado del Sheet de hábitos. Vida Web solo lo lee para construir vistas derivadas.

Configuración server-side requerida:

- `GOOGLE_GYM_SPREADSHEET_ID`: referencia al spreadsheet canónico de Gimnasio.
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY`: credencial de servicio de la capa Sheets.

El ID real no se hardcodea en código, tests ni documentación. La cuenta de servicio debe tener el permiso mínimo necesario sobre el archivo.

Pestañas consumidas:

- `Gym Sessions`
- `Gym Sets`
- `Cardio Sessions`

`Cardio Sessions` conserva actividad, modalidad, duración y las métricas que realmente existan. Vida no rellena distancia, potencia, FC, RPE ni estado cuando la fuente no los aporta.

## Comparaciones personales V2.0

La pantalla distingue:

1. semana actual vs el mismo punto de la semana anterior;
2. último registro vs sesión comparable anterior del mismo ejercicio;
3. último registro vs base personal de observaciones previas;
4. distribución descriptiva de series recientes por grupo muscular.

Para comparar sets con distinta combinación de carga y repeticiones se usa e1RM de Epley como índice personal únicamente en sets de 1–15 repeticiones. El set observado (`kg × reps`) permanece visible. La estimación no se presenta como 1RM medido.

Cambios de fuerza estimada dentro de ±2 % se tratan visualmente como estables para evitar sobrerrepresentar ruido pequeño.

## Cardio semanal por MET-min

La carga aeróbica semanal se muestra en Gimnasio como una vista derivada y no reemplaza los registros originales. La unidad común es:

`MET-min = MET × minutos`

La referencia de esta fase es `600 MET-min/semana`, equivalente de forma aproximada a 120 minutos a 5 MET. La barra puede superar el 100 %; alcanzar la cuota no implica que más sea automáticamente mejor.

Reglas de conversión:

- bicicleta: prioriza potencia media en watts cuando existe; en ausencia de watts usa RPE y, como último recurso, el rol registrado de la sesión con confianza menor;
- fútbol: usa una equivalencia específica para fútbol general o competitivo según la evidencia disponible;
- caminata: solo suma cuando hay distancia y velocidad compatibles para estimar duración e intensidad;
- pasos sin evidencia suficiente de intensidad permanecen como actividad general y no se convierten automáticamente en cardio;
- en días con fútbol registrado no se vuelve a acreditar caminata diaria para evitar doble conteo obvio del movimiento del partido.

Las equivalencias de intensidad están fijadas en código a partir del Compendium of Physical Activities 2024 y cada contribución comunica su nivel de confianza. La FC de wearable puede aportar contexto, pero no se usa por sí sola para inventar un MET individual.

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
- porcentaje recorrido dentro del nivel actual hacia el siguiente;
- una ETA orientativa al siguiente nivel únicamente cuando el historial repetido permite sostener una tendencia positiva.

Los umbrales no cambian con la presentación visual. La UI usa una jerarquía de rangos inspirada en videojuegos para hacer visible el progreso sin alterar la clasificación subyacente.

### ETA al siguiente rango

La ETA no extrapola una suma fija de kilos por mes. Usa observaciones fechadas de e1RM del mismo ejercicio, ajusta la tendencia en escala logarítmica y aplica una desaceleración conservadora antes de proyectar el siguiente umbral. Si hay pocas exposiciones, una ventana temporal insuficiente, pendiente nula/negativa o una proyección poco razonable, la interfaz muestra `Sin ETA confiable`.

La ETA es una estimación descriptiva del ritmo reciente, no una promesa de fecha ni una prescripción de aumentar carga.

### Comparabilidad y confianza

La tabla es fija, pero la comparabilidad física no es igual para todos los ejercicios:

- mancuernas compatibles: confianza alta;
- poleas/cables con definición razonablemente alineada: confianza media;
- máquinas cuya palanca, recorrido o carga inicial puede cambiar: confianza baja;
- hip thrust de máquina usa la referencia como proxy del movimiento convencional y se marca con confianza baja.

La confianza no modifica los umbrales; comunica cuánto confiar en la comparación externa. El progreso personal del mismo ejercicio sigue siendo la señal prioritaria.

La pantalla mantiene unos pocos ejercicios destacados y `Ver todos los ejercicios` para revisar el resto de forma compacta. Los ejercicios registrados que todavía no existen en la tabla siguen visibles como progreso personal y aparecen `Sin benchmark`. Un ejercicio incluido en la tabla pero cuyo último set no permite e1RM aparece `Sin e1RM`.

No se ajusta por peso corporal ni edad en este slice. No se realizan ni recomiendan tests reales de 1RM para alimentar el dashboard.

## Revisión mensual a demanda

Gimnasio y Nutrición exponen una acción de revisión de 30 días que prepara un pedido para el coach. No corre en segundo plano, no programa tareas y no cambia planes automáticamente. La regla explícita es conservar lo que funciona y proponer ajustes solo cuando los datos repetidos o una incompatibilidad clara justifican el cambio.

La revisión de gimnasio considera adherencia, rendimiento comparable, cardio, movilidad con limitación medida, recuperación, posibles señales de descarga y eficiencia. La revisión de nutrición considera cobertura del registro, energía, macros, micronutrientes, alimentos y suplementos únicamente cuando existen datos suficientes.

## Frontera de escritura

Gimnasio V2 permanece read-only en este slice. La ruta de escritura existente queda alineada preventivamente con la misma fuente dedicada para evitar split-brain:

- una escritura Gym nunca reutiliza implícitamente `GOOGLE_SHEETS_TARGET`, `GOOGLE_SHEETS_DEV_ID` ni `GOOGLE_SHEETS_PROD_ID` del Sheet general de hábitos;
- el único target aceptado por el cliente Gym es `GOOGLE_GYM_SPREADSHEET_ID` del entorno actual;
- además de `WRITE_ACTIONS_ENABLED`, una escritura real exige la compuerta exacta `GOOGLE_GYM_SHEETS_ALLOW_WRITES=true`;
- si falta el ID dedicado, la credencial o la compuerta, el puerto falla cerrado antes de escribir;
- la compuerta nace apagada y no se activa en este PR;
- Preview puede usar en el futuro un valor distinto de `GOOGLE_GYM_SPREADSHEET_ID` mediante configuración de entorno, sin hardcodear targets en código.

Cardio y fútbol dejan de mostrarse como checks del Habit Tracker, pero sus columnas históricas no se borran ni se migran. La whitelist de escritura se conserva por compatibilidad; la UI deja de tratarlos como hábitos porque el cardio pasa a evaluarse en Gimnasio mediante actividad estructurada.

## Seguridad

- lectura solamente en Gimnasio V2;
- sin IDs reales en el cliente;
- ninguna escritura nueva fue habilitada ni ejecutada en este slice;
- sin fallback silencioso al spreadsheet de hábitos;
- faltantes no se convierten en cero;
- la UI distingue observación, estimación y benchmark;
- la UI describe asociaciones/cambios, no causas ni diagnósticos.

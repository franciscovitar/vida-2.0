# Camino del cinéfilo v2 — canon externo

## Por qué existe v2

La primera versión podía llegar demasiado rápido al 100% porque medía principalmente lo ya registrado en Media contra objetivos fijos. Eso producía una señal engañosa: una obra culturalmente importante ausente del Banco no podía afectar el camino.

V2 cambia la pregunta. Ya no es sólo “¿cuánto recorrí de mi biblioteca?”, sino “¿qué cobertura tengo de una referencia audiovisual externa razonable para un amateur muy formado?”.

El objetivo sigue sin ser competir con críticos, historiadores o profesionales que dedican su vida al cine. El 100% es un hito exigente de **amateur de referencia**, no formación académica ni dominio profesional.

## Fuentes externas incluidas

El snapshot `external-canon-2026.1` fue investigado y fijado el 15/09/2026. Usa tres referencias complementarias:

- **TSPDT — The 1,000 Greatest Films, edición 2026.** TSPDT agrega listas y votaciones históricas de críticos, cineastas y publicaciones. V2 usa como universo operativo sus primeras 250 películas para tener un núcleo amplio pero manejable, no una lista personal del usuario.
- **Writers Guild of America — 101 Best Written TV Series (2013).** V2 incorpora el tramo documentado 1–78 como referencia histórica de escritura televisiva, incluyendo décadas anteriores al streaming.
- **BBC Culture — 100 Greatest TV Series of the 21st Century (2021).** V2 incorpora el top 25 como contrapeso internacional y contemporáneo para la televisión del siglo XXI.

Estas fuentes no son una verdad objetiva ni se mezclan mecánicamente con la nota personal. Funcionan como evidencia externa versionada para evitar que el Banco del usuario sea el propio denominador.

Otras listas editoriales pueden usarse como contraste de criterio durante futuras revisiones, pero no cuentan como denominador hasta ser incorporadas explícitamente a una nueva versión.

## Escala de obligatoriedad cultural

Cada obra visible en Vida recibe una de seis categorías derivadas:

1. **Imprescindible** — parte del núcleo externo más fuerte. Es la categoría más exigente y sólo puede provenir del canon externo.
2. **Esencial** — referencia externa de primer nivel, muy difícil de omitir en una formación amateur alta.
3. **Muy recomendable** — obra con relevancia externa fuerte o, fuera del canon, evidencia interna excepcional de valor cinéfilo/presencia cultural.
4. **Recomendable** — aporta claramente al mapa, pero no define por sí sola una base cultural.
5. **Complementaria** — suma contexto, época, autor, género o conversación cultural sin ser prioritaria.
6. **Opcional** — puede ser valiosa o disfrutable, pero no es necesaria para este objetivo cultural.

Los títulos que no figuran en el canon externo nunca pueden convertirse sólo por cálculo interno en `Imprescindible` o `Esencial`. Esto evita transformar una estimación de Vida en una afirmación falsa de consenso cultural.

### Películas

En `external-canon-2026.1`, la posición TSPDT se traduce así:

- 1–25: Imprescindible
- 26–75: Esencial
- 76–150: Muy recomendable
- 151–250: Recomendable

### Series

WGA y BBC se combinan por consenso/rango. Un top 10 fuerte en cualquiera de las dos referencias puede entrar en `Imprescindible`; los siguientes tramos forman `Esencial`, `Muy recomendable` y `Recomendable`.

## Progreso v2

Cada camino combina:

- **70% canon externo** — cobertura ponderada del universo de referencia;
- **15% importancia de lo visto** — transformación no lineal de `Valor cinéfilo` (60%) y `Presencia cultural` (40%);
- **10% recorrido histórico** — amplitud por etapas;
- **5% diversidad de géneros**.

Global mantiene Películas 65% + Series 35%.

La cobertura externa no exige ver literalmente las 250 películas o todas las series de referencia. El denominador está calibrado para un amateur alto: el componente externo alcanza su techo con una cobertura ponderada fuerte (60% películas, 65% series), pero el **100% final del camino permanece bloqueado mientras falte al menos un `Imprescindible`**.

Esto permite ser exigente sin convertir el sistema en “mirar todo o fracasar”.

## Obras fuera del Banco o de Media

El canon existe independientemente del Sheet del usuario. Si, por ejemplo, una serie `Imprescindible` no figura en Media:

- cuenta como **no registrada/cubierta**;
- impide un 100% falso;
- puede aparecer en `Próximos saltos culturales` marcada como `Fuera de tu Media`;
- no se inventa si el usuario realmente la vio o no: la ausencia significa únicamente que Vida no tiene evidencia registrada de ese visionado.

Cuando se agregue y se registre como vista/terminada, el camino podrá reconocerla.

## Recomendaciones

`Próximos saltos culturales` combina dos universos:

1. títulos `Por ver` ya presentes en Media;
2. huecos del canon externo aunque todavía no estén cargados en Media.

Se ordenan primero por obligatoriedad cultural y luego por ganancia marginal estimada. Por eso una obra fundamental puede aparecer antes que otra más afín al gusto personal.

La prioridad de visionado normal de Vida sigue siendo otra señal distinta y conserva su combinación de Afinidad + Valor cinéfilo + Presencia cultural.

## Estabilidad y actualización

Dentro de una misma versión del canon, agregar películas arbitrarias al Banco no cambia el denominador externo. Una actualización real de la referencia —por ejemplo, una nueva edición TSPDT o una revisión deliberada de TV— debe crear una nueva versión (`external-canon-YYYY.N`).

Una nueva versión **puede recalibrar el porcentaje**. Eso no significa que el usuario “perdió cultura”; significa que cambió el mapa de referencia. La UI expone versión y fecha para que esa diferencia sea trazable.

No se actualiza el canon silenciosamente por cada estreno. Una obra contemporánea puede sumar mediante `Valor cinéfilo`/`Presencia cultural`, pero sólo entra en los dos niveles máximos cuando existe evidencia externa suficiente y una nueva versión lo incorpora deliberadamente.

## Privacidad y fuente de verdad

- No se crea otra base de datos del usuario.
- El historial observado sigue viniendo de Google Sheets/Media.
- El canon es conocimiento público versionado del producto, no información personal.
- La nota personal no altera el avance cultural.
- Una serie activa puede recibir crédito parcial; Vida no presupone que fue terminada.
- `Reveer` no genera progreso duplicado.

## Límites conocidos

- Los títulos se concilian por nombre/original/alias y, cuando es necesario, año. El aliasado debe ampliarse de forma controlada ante conflictos reales; no se usa fuzzy matching silencioso para adjudicar visionados.
- El snapshot de TV mezcla una referencia histórica de escritura con una referencia internacional del siglo XXI; futuras versiones pueden ampliar la representación con más fuentes independientes.
- “Obligatoriedad” significa obligatoriedad **para este camino cultural**, no una evaluación objetiva de calidad ni una orden de qué tiene que disfrutar el usuario.

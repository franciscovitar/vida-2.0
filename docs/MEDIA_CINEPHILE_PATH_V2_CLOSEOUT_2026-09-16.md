# Camino del cinéfilo v2 — closeout 2026-09-16

## Alcance

Cierre determinístico de `cinephile-path-v2` contra el Google Sheet canónico `Vida 2.0 — Media` después de incorporar el banco externo faltante, completar identidad/scoring/personal-fit/posters y adjudicar los conflictos de metadata retenidos.

Código auditado: `vida-2.0` main `0866f2309170f8e99747a315892a5186ced75754`.

Canon: `external-canon-2026.1`, as-of `2026-09-15`.

No se cambió la fórmula durante este closeout.

## Denominador verificado

La implementación vigente usa:

- 70% canon externo;
- 15% importancia de lo observado;
- 10% cobertura por eras;
- 5% diversidad de géneros;
- global = 65% películas + 35% series.

Canon externo:

- películas: 250 referencias TSPDT, peso total 525; el componente externo llega a 100 con 60% del peso = 315 puntos ponderados;
- series: 93 referencias únicas WGA/BBC, peso total 226; el componente externo llega a 100 con 65% del peso = 146,9 puntos ponderados.

El 100% final permanece limitado mientras falte al menos un `Imprescindible`.

## Snapshot calculado

### Películas

- Camino: **44,2%**
- Nivel: **Explorador con mapa**
- Siguiente: **Cinéfilo en formación**
- Canon externo: **20,3%**
- Fundamentos: **100,0%**
- Eras: **100,0%**
- Géneros: **100,0%**
- Obras observadas: **439**
- Imprescindibles cubiertos: **5 / 25**
- Referencias externas totalmente cubiertas: **26 / 250**

### Series

- Camino: **51,7%**
- Nivel: **Cinéfilo en formación**
- Siguiente: **Cinéfilo sólido**
- Canon externo: **37,4%**
- Fundamentos: **69,7%**
- Eras: **100,0%**
- Géneros: **100,0%**
- Obras observadas con exposición: **108**
- Imprescindibles cubiertos: **7 / 18**
- Referencias externas totalmente cubiertas: **14 / 93**

### Global

- Camino: **46,8%**
- Nivel: **Explorador con mapa**
- Siguiente: **Cinéfilo en formación**
- Canon externo: **26,3%**
- Fundamentos: **89,4%**
- Eras: **100,0%**
- Géneros: **100,0%**
- Obras observadas: **547**
- Imprescindibles cubiertos: **12 / 43**
- Referencias externas totalmente cubiertas: **40 / 343**

Los porcentajes fueron reproducidos directamente desde las reglas de `lib/media/cinephile-path.ts` y el snapshot canónico del Sheet; no son estimaciones manuales.

## Cierre del lote externo incorporado

Target exacto: **84 obras** = **56 películas + 28 series**.

Verificado en el Sheet canónico:

- 84/84 `Media ID`;
- 84/84 TMDB ID tipado;
- 84/84 IMDb ID;
- 84/84 `Valor cinéfilo`;
- 84/84 `Impacto cultural`;
- 84/84 `Score general`;
- 84/84 `Confianza general`;
- 84/84 `Por qué para mí`;
- 84/84 `Score versión`;
- 84/84 `Poster TMDB` con path relativo;
- 84/84 entradas en `Media Personal Fit Display`, modelo `personal-fit-v1.2`, modo `current_catalog_display_fallback`;
- 84/84 `Metadata status = Done` después de read-back;
- 84/84 filas objetivo de `Metadata Queue = Done`.

Los campos personales de las 84 altas (`Nota`, opinión y fecha de visionado/finalización) permanecieron vacíos; no se inventó historial del usuario.

## Conflictos TMDB adjudicados

51 de las 84 obras tenían desacuerdos materiales entre el valor canónico curado y TMDB — principalmente runtime, país, creador/director, título original o año.

La identidad de las 51 quedó doblemente corroborada por TMDB ID tipado + IMDb exacto, sin ambiguos, not-found ni errores. Las portadas se resolvieron de forma independiente.

Para el closeout se **retuvieron los valores canónicos curados** en lugar de sobrescribirlos sólo para forzar igualdad con TMDB. La decisión queda registrada en `Metadata Queue.Acción`; `Faltantes` se limpió y la operación pasó a `Done` después de read-back exacto.

La regla reutilizable de adjudicación quedó documentada en `personal-ai-system` como `AI/projects/movies-series-intelligence/METADATA_CONFLICT_ADJUDICATION.md`. El planner automático continúa fail-closed ante conflictos; este cierre terminal requiere adjudicación explícita.

`Widow's Bay` no pertenecía al target y quedó fuera de este cierre.

## Estado final

El lote de 84 obras y el Camino del cinéfilo v2 quedan **cerrados** para este snapshot.

No quedan deudas específicas del lote externo. El `Metadata Queue` global puede seguir conteniendo trabajo de otras obras; eso no pertenece a este closeout.

No se ejecutó deploy ni se cambió Production para este cierre. La próxima variación legítima del porcentaje vendrá de cambios observados en Media o de una futura versión deliberada del canon, no de agregar títulos arbitrarios al Banco.

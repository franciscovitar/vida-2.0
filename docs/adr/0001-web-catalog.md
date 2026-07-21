# ADR 0001 — Contrato del Registro Web

- **Estado:** aceptado para 8B.1.
- **Fecha:** 2026-07-21.

## Contexto

Vida 2.0 usa Notion para contenido y definiciones, Google Sheets para métricas, Google Calendar
para tiempo y la web para vistas y funciones. La integración Notion actual conoce un conjunto
cerrado de bases operativas. Todavía no existe un catálogo editorial ni lectura genérica de páginas
y bloques.

El futuro Registro Web debe permitir identidad estable, slugs, alias, navegación, visibilidad,
privacidad, uso por IA y modos de escritura sin convertir contenido externo en código ejecutable ni
publicar recursos por descubrimiento accidental.

## Decisión

**El catálogo controla publicación y configuración editorial; el código controla renderers
permitidos y barreras duras de seguridad.**

8B.1 define un contrato plano y tipado, un repositorio abstracto de solo lectura, un registro
cerrado de renderers, un validador puro y un índice de slug/alias. El índice solo se construye cuando
el catálogo completo es válido.

La feature flag `WEB_CATALOG_ENABLED` queda apagada por defecto y no se conecta todavía con rutas,
navegación ni UI.

## Alternativas descartadas

### Hardcodear páginas reales en el repositorio

Descartado porque duplicaría Notion, exigiría deploy para cambios editoriales y expondría
referencias internas.

### Permitir nombres arbitrarios de renderer desde Notion

Descartado porque convertiría configuración externa en selección de comportamiento no controlado.

### Descubrir y publicar automáticamente todas las páginas

Descartado porque podría exponer contenido privado, legacy, de sistema o todavía no clasificado.

### Conectar Notion durante 8B.1

Descartado porque mezcla el contrato con una mutación externa y adelanta 8B.2/8C.

## Consecuencias

- Los títulos pueden cambiar sin alterar la identidad estable.
- Slugs y alias se validan globalmente antes de construir el índice.
- Agregar un renderer especial requiere una decisión de código revisable.
- Una fuente futura debe implementar el puerto de solo lectura.
- El catálogo no otorga por sí solo permisos ni ejecuta escrituras.
- Las filas reales vivirán fuera del código y solo se incorporarán con autorización posterior.

## Reglas de seguridad

- Privado no puede ser visible, navegable, buscable, legible por IA general ni usar el renderer
  documental genérico.
- Legacy no puede ser canónico ni participar de publicación, navegación, búsqueda o IA general.
- Sistema queda fuera de web general, navegación, búsqueda, IA general y escritura.
- Excluido queda fuera de web, navegación, búsqueda, IA y escritura.
- Todo modo de escritura distinto de `none` requiere confirmación explícita o reforzada.
- Renderers permitidos se registran exclusivamente en código.
- Ninguna referencia de origen se entrega al cliente.
- No se incluyen filas reales, identificadores, URLs privadas, correos, tokens ni secretos.

## Fuera de 8B.1 / cubierto en el cierre técnico 8B

Completado en el cierre técnico (sin activar la flag ni publicar filas):

- Repositorio Notion de solo lectura del Registro Web.
- Lectura recursiva acotada de páginas y bloques autorizados.
- Modelo normalizado de contenido independiente del SDK.
- Renderer documental genérico.
- Ruta dinámica autenticada `/p/[slug]` protegida por flag y política.

Sigue fuera de alcance hasta 8C:

- Activar `WEB_CATALOG_ENABLED` o publicar recursos.
- Navegación dinámica, búsqueda y renderers especiales.
- Lectura de Journaling o escritura en Notion.
- Cambiar Vercel o variables reales.

# Logros V1 — lectura privada (DRAFT)

**Estado:** no activado; no hay Ledger Notion ni escritor certificado.

## Alcance

- Vista autenticada `/planificacion/logros` en Vida.
- Solo lectura, sin acceso automático a Journaling.
- Desactivado salvo `ACHIEVEMENTS_V1_READ_ENABLED=true`.
- Fuente explícita: `NOTION_ACHIEVEMENTS_DATA_SOURCE_ID`.
- No usar Proyectos, Tareas, Áreas o Hitos como Ledger.
- No crear registros ficticios ni mostrar propuestas no aceptadas.
- Un máximo de 100 filas consultadas y 30 tarjetas mostradas.
- Si la fuente está incompleta, mostrar una advertencia de cobertura parcial.
- No revelar referencias privadas, claves semánticas ni contenido del Journal.

## Esquema propuesto, aún no creado

- `Nombre`: título de Notion.
- `ClaveEvento`: texto de identidad estable, sin datos íntimos.
- `Categoria`: `ACADEMIC`, `PROJECT`, `PROFESSIONAL`, `PERSONAL` u `OTHER`.
- `Asercion`: `SELF_REPORTED` u `OWNER_VERIFIED`.
- `Fecha`: fecha o vacío si es desconocida.
- `Estado`: solo `ACCEPTED` aparece en Vida.
- `Sensibilidad`: solo `STANDARD` aparece en Vida.
- `RegistroAutorizado`: checkbox solo del futuro escritor confiable.

Los campos editables de Notion no son prueba independiente de permiso o veracidad.
El escritor deberá reutilizar los gates de PAS PR #572, con deduplicación y readback.

## QA y siguiente gate

- 19 pruebas focales observadas PASS.
- TypeScript estricto del modelo y de la configuración PASS.
- QA completa de Vida, E2E y activación requieren pruebas separadas.
- Crear/configurar el Ledger privado requiere autorización específica.
- No fusionar ni desplegar esta propuesta sin completar esos controles.

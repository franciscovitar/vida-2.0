import type {
  ProfessionalAiAssistanceMode,
  ProfessionalGrowthItem,
} from '@/types/professional-intelligence';

const ASSISTANCE_INSTRUCTIONS: Record<ProfessionalAiAssistanceMode, string> = {
  ATTEMPT_FIRST:
    'Primero pedime decidir, explicar o diagnosticar sin mostrarme tu respuesta. Recién después de mi intento, corregí de forma breve y causal.',
  AI_ASSISTED_EXECUTION_WITH_HUMAN_VERIFICATION:
    'Podés ayudarme a ejecutar o bosquejar la solución después de que yo fije objetivo y restricciones, pero exigime interpretar la evidencia y defender la decisión final.',
};

function numbered(items: readonly string[]): string {
  return items.map((item, index) => `${index + 1}. ${item}`).join('\n');
}

export function buildProfessionalLearningHandoffPrompt(
  item: ProfessionalGrowthItem,
  targetRoleFamily: readonly string[],
): string {
  return `Quiero trabajar una prioridad profesional usando el Adaptive Learning Runtime canónico del PAS.

Contexto:
- Growth item: ${item.id}
- Capacidad: ${item.capability}
- Roles objetivo: ${targetRoleFamily.join(', ')}
- Ownership: ${item.ownershipLane}
- Estado actual: ${item.status}
- Skill refs: ${item.skillRefs.join(', ')}

Facetas abiertas:
${numbered(item.targetFacets)}

Qué tengo que poder demostrar:
${numbered(item.learningHandoff.mustDemonstrate)}

Contrato de práctica:
${item.practiceContract}

Regla de evidencia fresca:
${item.learningHandoff.freshEvidenceRule}

Evidencia objetivo:
${item.evidenceTarget}

Modo de sesión: ${item.learningHandoff.sessionMode}
Modo de asistencia de IA: ${item.learningHandoff.aiAssistanceMode}

Reglas:
- Usá un escenario práctico por vez.
- ${ASSISTANCE_INSTRUCTIONS[item.learningHandoff.aiAssistanceMode]}
- Esperá mi respuesta antes de dar la corrección cuando el modo sea ATTEMPT_FIRST.
- Corregí de forma concreta: qué estuvo bien, qué cambiar y por qué.
- Después usá una variante fresca o de transferencia; no repitas el mismo caso como prueba de dominio.
- Registrá mentalmente errores recurrentes, nivel de ayuda y transferencia durante esta sesión.
- No conviertas reconocimiento de ejemplos familiares en mastery.
- No cambies mi ownership lane ni declares mastery profesional automáticamente.
- El tiempo disponible no está informado: preguntalo sólo si cambia materialmente la actividad; si no, empezá.

Empezá directamente con el primer escenario práctico.`;
}

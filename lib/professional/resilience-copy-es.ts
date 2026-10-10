import type { CareerResilienceRole } from '@/types/career-resilience';

type SpanishLists = {
  human: readonly string[];
  playbook: readonly string[];
  up: readonly string[];
  down: readonly string[];
};

// UI translations only. PAS remains canonical; the English originals stay on the role record.
// Any changed canonical list length makes the translation unavailable rather than misaligning text.
const TRANSLATIONS: Record<string, SpanishLists> = {
  'ai-native-product-engineer': {
    human: [
      'Definir problemas y requisitos incluso cuando hay ambigüedad',
      'Arquitectura e integración entre sistemas',
      'Evaluación, verificación y manejo de fallos',
      'Criterio de producto y negocio, y prioridades',
      'Seguridad, privacidad y responsabilidad',
      'Responsabilidad integral del trabajo entre agentes y personas',
    ],
    playbook: [
      'Dominar la orquestación de agentes junto con la verificación, no solo los prompts',
      'Asumir decisiones de requisitos, arquitectura, datos, seguridad y producción',
      'Demostrar que podés operar sistemas después del lanzamiento',
      'Medir calidad, costo, latencia y modos de falla de la IA',
      'Mantener comunicación directa con producto y negocio',
    ],
    up: [
      'Agentes que gestionan de forma fiable semanas de trabajo de producto con poca supervisión',
      'Organizaciones que eliminan capas de ingeniería de producto en vez de reasignarlas',
      'Evaluación, seguridad y responsabilidad delegadas mayormente a máquinas',
    ],
    down: [
      'Los sistemas de alto valor siguen necesitando responsables humanos',
      'Integración, confiabilidad y seguridad siguen siendo cuellos de botella',
      'La IA amplía la cantidad de productos viables y la demanda de quienes los construyen',
    ],
  },
  'full-stack-product-engineer': {
    human: [
      'Descubrir necesidades del producto y resolver ambigüedades',
      'Diseñar arquitectura entre frontend, backend y datos',
      'Diagnosticar y recuperar sistemas en producción',
      'Tomar decisiones de seguridad y accesos',
      'Comunicarse con las partes interesadas',
      'Definir criterios de aceptación y verificar resultados',
    ],
    playbook: [
      'Pasar de ejecutar tickets a responsabilizarse por el producto y el sistema',
      'Fortalecer arquitectura, bases de datos, producción y seguridad',
      'Usar IA para ampliar el alcance sin perder capacidad de verificación',
      'Mantener comunicación sólida con usuarios y clientes',
    ],
    up: [
      'Agentes que resuelven cambios full-stack en repositorios maduros con revisión mínima',
      'Empresas que reducen sostenidamente los equipos por producto sin ampliar el número de productos',
    ],
    down: [
      'El alcance del producto crece a medida que desarrollarlo cuesta menos',
      'Producción, seguridad y responsabilidad siguen necesitando personas con experiencia',
    ],
  },
  'software-engineer': {
    human: [
      'Entender sistemas con requisitos incompletos',
      'Tomar decisiones de arquitectura y sus compromisos',
      'Depurar fallas que atraviesan varios componentes',
      'Diseñar estrategias de testing y verificación',
      'Asegurar seguridad y confiabilidad',
      'Coordinar decisiones técnicas y asumir responsabilidad',
    ],
    playbook: [
      'No competir únicamente por la cantidad de código producido',
      'Profundizar arquitectura, depuración, pruebas, datos y producción',
      'Poder verificar los resultados de la IA de forma independiente',
      'Construir conocimiento de dominio y evidencia de responsabilidad',
      'Usar IA para trabajar sobre sistemas más amplios, no solo terminar tickets más rápido',
    ],
    up: [
      'Agentes que modifican de forma fiable grandes repositorios reales sin descomposición humana',
      'Revisión senior y arquitectura dominadas por máquinas',
      'Contratación de ingeniería de software que cae durante años pese a crecer la demanda tecnológica',
    ],
    down: [
      'La demanda de software crece más rápido de lo que la productividad reduce plantillas',
      'La verificación humana sigue siendo necesaria en sistemas importantes',
    ],
  },
  'systems-analyst-architect': {
    human: [
      'Descubrir requisitos con objetivos contrapuestos',
      'Resolver compromisos de arquitectura entre sistemas',
      'Tomar decisiones de riesgo y gobernanza',
      'Negociar con las partes interesadas',
      'Planificar migraciones y posibles fallas',
      'Responder por las consecuencias en todo el sistema',
    ],
    playbook: [
      'Mejorar la calidad de requisitos y decisiones, no solo producir diagramas',
      'Asumir migraciones, compromisos y modos de falla',
      'Profundizar en seguridad, privacidad y gobernanza',
      'Practicar cómo explicar y defender decisiones ante personas no técnicas',
    ],
    up: [
      'IA capaz de obtener requisitos y negociar restricciones con las partes interesadas de forma fiable',
      'Organizaciones que delegan a la IA la responsabilidad arquitectónica y aprobación de cambios',
    ],
    down: [
      'Las normas y la rendición de cuentas mantienen responsables humanos identificables',
      'La integración de sistemas heredados y las restricciones organizacionales siguen siendo determinantes',
    ],
  },
  'applied-ai-engineer': {
    human: [
      'Decidir qué conviene automatizar',
      'Diseñar evaluaciones y analizar fallos',
      'Diseñar la arquitectura de datos y fundamentación de respuestas',
      'Aplicar controles de seguridad y riesgo del modelo',
      'Integrar IA en producción y observar su funcionamiento',
      'Resolver compromisos de costo, latencia y confiabilidad',
    ],
    playbook: [
      'Superar la integración de APIs: dominar evaluaciones, observabilidad, datos de apoyo y seguridad',
      'Gestionar la economía de producción: latencia, costo y confiabilidad',
      'Construir sistemas de IA específicos del dominio con resultados medibles',
      'Mantener bases sólidas de software, datos y seguridad',
    ],
    up: [
      'Proveedores de modelos que integran la mayor parte de recuperación, evaluaciones e infraestructura de agentes',
      'Agentes que experimentan, despliegan y supervisan sistemas de IA con poca intervención',
    ],
    down: [
      'Diversidad de modelos, regulación, seguridad e integración de dominio mantienen la complejidad',
      'Los despliegues de IA se extienden a muchas más organizaciones y casos',
    ],
  },
  'data-engineer': {
    human: [
      'Modelar datos y sus significados',
      'Garantizar calidad, linaje y gobernanza de datos',
      'Gestionar confiabilidad distribuida y costos',
      'Definir acceso, seguridad y privacidad',
      'Integrar sistemas de origen heterogéneos',
      'Asumir incidentes y migraciones',
    ],
    playbook: [
      'Dominar modelado, transacciones, calidad y gobernanza',
      'Asumir confiabilidad, costos y seguridad de plataformas',
      'Aprender modelado semántico y de dominio, no solo sintaxis de pipelines',
      'Usar IA para SQL y estructuras repetitivas, pero verificar la corrección de datos',
    ],
    up: [
      'Plataformas de datos autónomas que resuelven de forma fiable cambios de esquema, incidentes y gobernanza',
      'Organizaciones que estandarizan capas de datos lo suficiente para eliminar gran parte de la integración',
    ],
    down: [
      'Calidad, acceso, linaje y semántica siguen siendo obstáculos frecuentes',
      'La regulación incrementa la responsabilidad humana sobre los datos',
    ],
  },
  'data-scientist': {
    human: [
      'Formular problemas y elegir métricas',
      'Razonar con estadística y causalidad',
      'Diseñar experimentos',
      'Validar datos y detectar filtraciones de información',
      'Comunicar decisiones y resultados',
      'Asumir responsabilidad por el uso de modelos',
    ],
    playbook: [
      'Priorizar estadística, causalidad y diseño experimental frente a la mecánica de notebooks',
      'Asumir calidad de datos y definición de decisiones de negocio',
      'Aprender producción y evaluación de modelos',
      'Comunicar claramente la incertidumbre y las consecuencias',
    ],
    up: [
      'IA que realiza análisis completos fiables con validación causal y estadística robusta',
      'AutoML y agentes que convierten los modelos personalizados en un servicio indiferenciado',
    ],
    down: [
      'Experimentos reales, causalidad, regulación y riesgos del dominio siguen requiriendo responsabilidad humana',
      'La demanda de decisiones basadas en datos crece más rápido que la automatización',
    ],
  },
  'data-analyst-bi': {
    human: [
      'Gobernar definiciones de métricas y semántica',
      'Interpretar resultados en su contexto de negocio',
      'Cuestionar críticamente la calidad de los datos',
      'Definir preguntas ambiguas',
      'Facilitar decisiones con las partes interesadas',
      'Responder por informes con consecuencias importantes',
    ],
    playbook: [
      'Dejar de basar el perfil solamente en crear dashboards',
      'Asumir definiciones de métricas, semántica y decisiones de negocio',
      'Profundizar SQL y modelado para auditar respuestas de IA',
      'Sumar experimentación, causalidad o capacidades adyacentes de ingeniería de datos',
    ],
    up: [
      'Capas semánticas y agentes que responden preguntas de negocio fiablemente sin analistas intermediarios',
      'Analítica con IA de autoservicio confiable para decisiones importantes',
    ],
    down: [
      'Las empresas siguen enfrentando dificultades al definir métricas y asegurar calidad de datos',
      'Los analistas participan en decisiones, experimentación y cambios operativos, no solo en informes',
    ],
  },
  'platform-production-engineer': {
    human: [
      'Dirigir incidentes en situaciones inciertas',
      'Diseñar arquitectura confiable',
      'Establecer límites de seguridad y privilegios',
      'Resolver compromisos de capacidad y costos',
      'Planificar recuperación y contingencias',
      'Asumir responsabilidad operativa entre equipos',
    ],
    playbook: [
      'Dominar observabilidad, respuesta a incidentes, copias de seguridad, restauración y simulacros de fallos',
      'Profundizar en sistemas distribuidos y seguridad',
      'Automatizar tareas repetitivas conservando capacidad diagnóstica',
      'Aprender arquitectura de costos y capacidad',
    ],
    up: [
      'Operación autónoma fiable incluso durante incidentes graves',
      'Plataformas cloud que absorben la mayoría de las decisiones de SRE e ingeniería de plataformas',
    ],
    down: [
      'Las fallas distribuidas complejas y la seguridad siguen siendo difíciles',
      'Las exigencias regulatorias y el riesgo empresarial requieren responsables humanos',
    ],
  },
  'security-engineer': {
    human: [
      'Modelar amenazas y razonar frente a adversarios',
      'Aceptar riesgos y resolver compromisos de negocio',
      'Dirigir la respuesta a incidentes',
      'Diseñar arquitectura de seguridad',
      'Diseñar identidades y privilegios',
      'Asumir responsabilidad, gobernanza y comunicación',
    ],
    playbook: [
      'Pasar de operar herramientas a modelado de amenazas, AppSec y arquitectura de seguridad',
      'Ganar experiencia en incidentes y producción',
      'Dominar identidad, mínimo privilegio y límites de confianza',
      'Usar IA para análisis y clasificación inicial, verificando de forma independiente las conclusiones',
    ],
    up: [
      'Defensores autónomos que superan equipos humanos en entornos adversariales reales',
      'Normas y leyes que permiten delegar en IA la aceptación de riesgos',
    ],
    down: [
      'Atacantes y defensores evolucionan conjuntamente y mantienen la necesidad de supervisión humana',
      'Las regulaciones de seguridad aumentan la responsabilidad explícita de personas',
    ],
  },
  'technical-founder-product-builder': {
    human: [
      'Elegir problemas que valga la pena resolver',
      'Construir relaciones y confianza con clientes',
      'Distribución y ventas',
      'Asignar capital y recursos',
      'Decidir estrategia y asumir responsabilidades',
      'Combinar contexto de mercado, producto y tecnología',
    ],
    playbook: [
      'Desarrollar capacidades de clientes y distribución junto al conocimiento técnico',
      'Usar IA para multiplicar ejecución, no para delegar la elección del problema',
      'Mejorar la calidad de decisiones y la disciplina al asignar capital',
      'Asumir confianza, marca, relaciones y estrategia',
    ],
    up: [
      'Agentes que descubren mercados, venden, negocian y asignan capital mejor que fundadores humanos',
      'Sistemas legales y de confianza que aceptan ampliamente empresas operadas por máquinas',
    ],
    down: [
      'Las relaciones humanas, la propiedad y la responsabilidad legal siguen siendo centrales',
      'Desarrollar más barato amplía el emprendimiento y los nichos de mercado',
    ],
  },
};

const SOURCE_COMMIT = 'aa5d930c43c39401a5cfed1a30556e8c72780f4f';
const SOURCE_FINGERPRINTS: Record<string, string> = {
  'ai-native-product-engineer': '356e3cda',
  'full-stack-product-engineer': 'caa548e4',
  'software-engineer': '80b9e4c1',
  'systems-analyst-architect': '66713eb4',
  'applied-ai-engineer': '57f926b0',
  'data-engineer': 'b9082f34',
  'data-scientist': 'df7467a8',
  'data-analyst-bi': 'e7a1d9b0',
  'platform-production-engineer': 'b6dc2939',
  'security-engineer': '6151d4e1',
  'technical-founder-product-builder': 'f5ad3de2',
};

function roleFingerprint(role: CareerResilienceRole): string {
  const content = [
    ...role.loadBearingHumanWork,
    ...role.protectionPlaybook,
    ...role.riskUpSignposts,
    ...role.riskDownSignposts,
  ].join('␟');
  let hash = 2166136261;
  for (let i = 0; i < content.length; i += 1) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function resilienceSpanishLists(
  role: CareerResilienceRole,
  sourceCommit: string,
): SpanishLists | null {
  if (sourceCommit !== SOURCE_COMMIT || SOURCE_FINGERPRINTS[role.id] !== roleFingerprint(role)) {
    return null;
  }
  const translation = TRANSLATIONS[role.id];
  if (
    !translation ||
    translation.human.length !== role.loadBearingHumanWork.length ||
    translation.playbook.length !== role.protectionPlaybook.length ||
    translation.up.length !== role.riskUpSignposts.length ||
    translation.down.length !== role.riskDownSignposts.length
  ) {
    return null;
  }
  return translation;
}

import { buildPreviewPreflight } from '@/lib/runtime/readiness';

const result = buildPreviewPreflight(process.env);

console.log(`Vida 2.0 Preview preflight — entorno detectado: ${result.environment}`);

if (result.issues.length === 0) {
  console.log('OK: configuración de Preview completa y segura.');
  process.exit(0);
}

for (const item of result.issues) {
  const prefix = item.severity === 'error' ? 'ERROR' : 'WARN';
  console.log(`${prefix} [${item.code}] ${item.message}`);
}

if (!result.ready) {
  console.log('Resultado: Preview no listo. No desplegar ni promover a Production.');
  process.exit(1);
}

console.log('Resultado: Preview listo con advertencias no bloqueantes.');

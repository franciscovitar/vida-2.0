/**
 * Estado sanitizado del runtime y preflight de deployment.
 * Nunca incluye tokens, IDs, correos ni valores de secretos.
 */

export type RuntimeEnvironment = 'local' | 'development' | 'preview' | 'production';

export type RuntimeIntegrationId =
  'sheets' | 'notion' | 'calendar' | 'web-catalog' | 'writes' | 'openclaw';

export type RuntimeIntegrationStatus = 'configured' | 'mock' | 'safe-disabled' | 'misconfigured';

export interface RuntimeIntegrationView {
  id: RuntimeIntegrationId;
  label: string;
  status: RuntimeIntegrationStatus;
  summary: string;
  /** true cuando impide considerar listo un Preview de Web V1. */
  blocking: boolean;
}

export type DeploymentPreflightSeverity = 'error' | 'warning';

export interface DeploymentPreflightIssue {
  code: string;
  severity: DeploymentPreflightSeverity;
  message: string;
}

export interface DeploymentPreflightResult {
  environment: RuntimeEnvironment;
  ready: boolean;
  issues: readonly DeploymentPreflightIssue[];
}

export interface RuntimeReadinessSnapshot {
  environment: RuntimeEnvironment;
  integrations: readonly RuntimeIntegrationView[];
  preview: DeploymentPreflightResult;
}

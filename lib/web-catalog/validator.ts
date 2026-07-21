import { isAllowedWebCatalogRenderer } from '@/lib/web-catalog/renderers';
import type {
  WebCatalogEntry,
  WebCatalogValidationCode,
  WebCatalogValidationIssue,
  WebCatalogValidationResult,
} from '@/types/web-catalog';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function issue(
  code: WebCatalogValidationCode,
  entry: WebCatalogEntry,
  message: string,
  field?: WebCatalogValidationIssue['field'],
  conflictingEntryKey?: string,
): WebCatalogValidationIssue {
  return {
    code,
    severity: 'error',
    message,
    entryKey: entry.stableKey,
    ...(field ? { field } : {}),
    ...(conflictingEntryKey ? { conflictingEntryKey } : {}),
  };
}

function hasGeneralNavigation(entry: WebCatalogEntry): boolean {
  return entry.navigationPlacement !== 'none';
}

function validateNavigation(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.navigationPlacement === 'none' && entry.navigationOrder !== null) {
    return [
      issue(
        'invalid-navigation-order',
        entry,
        'Un recurso fuera de navegación no puede definir orden.',
        'navigationOrder',
      ),
    ];
  }

  if (
    entry.navigationPlacement !== 'none' &&
    (!Number.isInteger(entry.navigationOrder) || (entry.navigationOrder ?? -1) < 0)
  ) {
    return [
      issue(
        'invalid-navigation-order',
        entry,
        'Un recurso navegable debe tener un orden entero mayor o igual a cero.',
        'navigationOrder',
      ),
    ];
  }

  return [];
}

function validateStatus(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  const issues: WebCatalogValidationIssue[] = [];

  if (entry.status === 'legacy' && entry.canonical) {
    issues.push(
      issue('legacy-canonical', entry, 'Un recurso legacy no puede ser canónico.', 'canonical'),
    );
  }

  if (entry.status === 'published' && !entry.canonical) {
    issues.push(
      issue(
        'status-canonical-conflict',
        entry,
        'Un recurso publicado debe ser canónico.',
        'canonical',
      ),
    );
  }

  if (entry.status === 'excluded' && entry.canonical) {
    issues.push(
      issue(
        'status-canonical-conflict',
        entry,
        'Un recurso excluido no puede ser canónico.',
        'canonical',
      ),
    );
  }

  if ((entry.status === 'draft' || entry.status === 'hidden') && entry.policy.visibleWeb) {
    issues.push(
      issue(
        'incompatible-policy',
        entry,
        'Un recurso en borrador u oculto no puede estar visible en la web.',
        'policy.visibleWeb',
      ),
    );
  }

  if (entry.status === 'published' && !entry.policy.visibleWeb) {
    issues.push(
      issue(
        'incompatible-policy',
        entry,
        'Un recurso publicado debe estar visible en la web.',
        'policy.visibleWeb',
      ),
    );
  }

  return issues;
}

function validateLegacy(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.status !== 'legacy') return [];

  const unsafe =
    entry.policy.visibleWeb ||
    entry.policy.searchable ||
    entry.policy.generalAI !== 'denied' ||
    hasGeneralNavigation(entry);

  return unsafe
    ? [
        issue(
          'legacy-unsafe',
          entry,
          'Un recurso legacy debe quedar oculto, fuera de navegación, búsqueda e IA general.',
        ),
      ]
    : [];
}

function validatePrivate(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.privacy !== 'private') return [];

  const unsafe =
    entry.policy.visibleWeb ||
    entry.policy.searchable ||
    entry.policy.generalAI !== 'denied' ||
    hasGeneralNavigation(entry) ||
    entry.renderMode === 'document';

  return unsafe
    ? [
        issue(
          'private-unsafe',
          entry,
          'Un recurso privado no puede ser visible, navegable, buscable, legible por IA general ni usar el renderer document.',
        ),
      ]
    : [];
}

function validateSystem(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.privacy !== 'system') return [];

  const unsafe =
    entry.policy.visibleWeb ||
    entry.policy.searchable ||
    entry.policy.generalAI !== 'denied' ||
    hasGeneralNavigation(entry) ||
    entry.renderMode !== 'system' ||
    entry.policy.writeMode !== 'none';

  return unsafe
    ? [
        issue(
          'system-unsafe',
          entry,
          'Un recurso de sistema debe usar el renderer system y quedar fuera de web general, navegación, búsqueda, IA general y escritura.',
        ),
      ]
    : [];
}

function validateExcluded(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.status !== 'excluded' && entry.privacy !== 'excluded') return [];

  const unsafe =
    entry.policy.visibleWeb ||
    entry.policy.searchable ||
    entry.policy.generalAI !== 'denied' ||
    entry.policy.reviewAI !== 'denied' ||
    hasGeneralNavigation(entry) ||
    entry.policy.writeMode !== 'none';

  return unsafe
    ? [
        issue(
          'excluded-unsafe',
          entry,
          'Un recurso excluido debe quedar fuera de web, navegación, búsqueda, IA y escritura.',
        ),
      ]
    : [];
}

function validateWritePolicy(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  if (entry.policy.writeMode === 'none' || entry.policy.confirmation !== 'none') return [];

  return [
    issue(
      'insufficient-confirmation',
      entry,
      `El modo de escritura ${entry.policy.writeMode} exige confirmación explícita o reforzada.`,
      'policy.confirmation',
    ),
  ];
}

function validateEntry(entry: WebCatalogEntry): WebCatalogValidationIssue[] {
  const issues: WebCatalogValidationIssue[] = [];

  if (!SLUG_PATTERN.test(entry.slug)) {
    issues.push(
      issue(
        'invalid-slug',
        entry,
        'El slug debe usar minúsculas, números y guiones simples.',
        'slug',
      ),
    );
  }

  for (const alias of entry.aliases) {
    if (!SLUG_PATTERN.test(alias)) {
      issues.push(
        issue('invalid-alias', entry, `El alias "${alias}" no tiene un formato válido.`, 'aliases'),
      );
    }
  }

  if (!isAllowedWebCatalogRenderer(entry.renderMode as string)) {
    issues.push(
      issue(
        'unknown-renderer',
        entry,
        `El renderer "${String(entry.renderMode)}" no pertenece al registro permitido.`,
        'renderMode',
      ),
    );
  }

  issues.push(
    ...validateNavigation(entry),
    ...validateStatus(entry),
    ...validateLegacy(entry),
    ...validatePrivate(entry),
    ...validateSystem(entry),
    ...validateExcluded(entry),
    ...validateWritePolicy(entry),
  );

  return issues;
}

function validateCollisions(entries: readonly WebCatalogEntry[]): WebCatalogValidationIssue[] {
  const issues: WebCatalogValidationIssue[] = [];
  const stableKeys = new Map<string, WebCatalogEntry>();
  const slugs = new Map<string, WebCatalogEntry>();
  const aliases = new Map<string, WebCatalogEntry>();

  for (const entry of entries) {
    const stableOwner = stableKeys.get(entry.stableKey);
    if (stableOwner) {
      issues.push(
        issue(
          'duplicate-stable-key',
          entry,
          `La clave estable "${entry.stableKey}" ya pertenece a otra entrada.`,
          'stableKey',
          stableOwner.stableKey,
        ),
      );
    } else {
      stableKeys.set(entry.stableKey, entry);
    }

    const slugOwner = slugs.get(entry.slug);
    if (slugOwner) {
      issues.push(
        issue(
          'duplicate-slug',
          entry,
          `El slug "${entry.slug}" ya pertenece a otra entrada.`,
          'slug',
          slugOwner.stableKey,
        ),
      );
    } else {
      slugs.set(entry.slug, entry);
    }

    const aliasSet = new Set<string>();
    for (const alias of entry.aliases) {
      if (aliasSet.has(alias)) {
        issues.push(
          issue(
            'duplicate-alias',
            entry,
            `El alias "${alias}" está repetido dentro de la entrada.`,
            'aliases',
            entry.stableKey,
          ),
        );
        continue;
      }
      aliasSet.add(alias);

      const aliasOwner = aliases.get(alias);
      if (aliasOwner) {
        issues.push(
          issue(
            'duplicate-alias',
            entry,
            `El alias "${alias}" ya pertenece a otra entrada.`,
            'aliases',
            aliasOwner.stableKey,
          ),
        );
      } else {
        aliases.set(alias, entry);
      }
    }
  }

  for (const entry of entries) {
    const aliasOwner = aliases.get(entry.slug);
    if (aliasOwner) {
      issues.push(
        issue(
          'slug-alias-collision',
          entry,
          `El slug "${entry.slug}" colisiona con un alias.`,
          'slug',
          aliasOwner.stableKey,
        ),
      );
    }
  }

  return issues;
}

function compareIssues(a: WebCatalogValidationIssue, b: WebCatalogValidationIssue): number {
  return (
    a.code.localeCompare(b.code) ||
    a.entryKey.localeCompare(b.entryKey) ||
    (a.field ?? '').localeCompare(b.field ?? '') ||
    (a.conflictingEntryKey ?? '').localeCompare(b.conflictingEntryKey ?? '') ||
    a.message.localeCompare(b.message)
  );
}

/** Validador puro: no consulta red, entorno, reloj ni fuentes externas. */
export function validateWebCatalog(
  entries: readonly WebCatalogEntry[],
): WebCatalogValidationResult {
  const issues = [
    ...entries.flatMap((entry) => validateEntry(entry)),
    ...validateCollisions(entries),
  ].sort(compareIssues);

  return { valid: issues.length === 0, issues };
}

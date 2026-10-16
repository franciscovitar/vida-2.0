export const PAS_REPOSITORY = 'franciscovitar/personal-ai-system';
const API_ROOT = `https://api.github.com/repos/${PAS_REPOSITORY}`;
const SUBJECT_IDS = ['cdd', 'dao', 'dsi', 'green', 'iop', 'redes', 'tpa'] as const;
const CAPABILITY_FILES = new Set([
  'AI/knowledge/personal/generalist-competence-inventory.json',
  'AI/knowledge/personal/GENERALIST_CAPABILITY_CARDS_V1.json',
  'AI/knowledge/personal/GENERALIST_TIME_ESTIMATES_V1.json',
  'AI/knowledge/personal/GENERALIST_ENGINE_ROUTING_V1.json',
]);
const SUBJECT_FILES = new Set(
  SUBJECT_IDS.flatMap((id) => [
    `AI/projects/university/subjects/${id}/subject.json`,
    `AI/projects/university/subjects/${id}/state/current.json`,
    `AI/projects/university/subjects/${id}/learning/assessment_blueprint.json`,
    `AI/projects/university/subjects/${id}/learning/concept_inventory.json`,
    `AI/projects/university/subjects/${id}/learning/readiness_report.json`,
  ]),
);
const SUBJECT_DIRECTORIES = new Set(
  SUBJECT_IDS.map((id) => `AI/projects/university/subjects/${id}/learning`),
);
export interface PrivatePasReader {
  sourceCommit(): Promise<string>;
  readJson(path: string): Promise<unknown | null>;
  listLearningFiles(path: string): Promise<string[]>;
}

export function isAllowedPasJsonPath(path: string): boolean {
  return CAPABILITY_FILES.has(path) || SUBJECT_FILES.has(path);
}

export function isAllowedPasDirectoryPath(path: string): boolean {
  return SUBJECT_DIRECTORIES.has(path);
}

type ReaderOptions = { token: string; fetchImpl?: typeof fetch };

export function createPrivatePasReader({
  token,
  fetchImpl = fetch,
}: ReaderOptions): PrivatePasReader {
  let commitPromise: Promise<string> | null = null;
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  };
  const sourceCommit = (): Promise<string> => {
    commitPromise ??= fetchImpl(`${API_ROOT}/git/ref/heads/main`, {
      headers,
      cache: 'no-store',
    })
      .then((response) => {
        if (!response.ok) throw new Error('private-pas-read-failed');
        return response.json() as Promise<{ object?: { sha?: unknown } }>;
      })
      .then((payload) => {
        const sha = payload.object?.sha;
        if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/i.test(sha)) {
          throw new Error('private-pas-invalid-ref');
        }
        return sha;
      });
    return commitPromise;
  };
  const readContents = async (path: string): Promise<Response> => {
    const sha = await sourceCommit();
    return fetchImpl(`${API_ROOT}/contents/${path}?ref=${encodeURIComponent(sha)}`, {
      headers,
      cache: 'no-store',
    });
  };

  return {
    sourceCommit,
    async readJson(path) {
      if (!isAllowedPasJsonPath(path)) throw new Error('private-pas-path-not-allowed');
      const response = await readContents(path);
      if (response.status === 404) return null;
      if (!response.ok) throw new Error('private-pas-read-failed');
      const payload = (await response.json()) as { content?: unknown; encoding?: unknown };
      if (payload.encoding !== 'base64' || typeof payload.content !== 'string') {
        throw new Error('private-pas-invalid-content');
      }
      try {
        return JSON.parse(
          Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8'),
        ) as unknown;
      } catch {
        throw new Error('private-pas-invalid-content');
      }
    },
    async listLearningFiles(path) {
      if (!isAllowedPasDirectoryPath(path)) throw new Error('private-pas-path-not-allowed');
      const response = await readContents(path);
      if (!response.ok) throw new Error('private-pas-read-failed');
      const value = (await response.json()) as unknown;
      if (!Array.isArray(value)) return [];
      return value
        .filter(
          (item): item is { name: string; type: string } =>
            Boolean(item) &&
            typeof item === 'object' &&
            typeof (item as { name?: unknown }).name === 'string' &&
            typeof (item as { type?: unknown }).type === 'string',
        )
        .filter((item) => item.type === 'file' || item.type === 'dir')
        .map((item) => item.name);
    },
  };
}

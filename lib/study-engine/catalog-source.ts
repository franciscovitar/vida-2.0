import 'server-only';

import { cache } from 'react';

import fallbackSnapshot from '@/data/generated/university-study-catalog.json';
import { buildStudyCatalogSubject } from '@/lib/study-engine/catalog';
import type {
  StudyCatalogRead,
  StudyCatalogSnapshot,
  StudyCatalogSubject,
} from '@/types/study-catalog';

const DEFAULT_REPOSITORY = 'franciscovitar/personal-ai-system';
const DEFAULT_REF = 'main';
const SUBJECT_ROOT = 'AI/projects/university/subjects';
const MAX_SUBJECTS = 20;

type GithubContentPayload = {
  content?: string;
  encoding?: string;
};

type GithubEntry = {
  name?: string;
  type?: string;
};

function decodeJson(payload: GithubContentPayload): unknown {
  if (payload.encoding !== 'base64' || !payload.content) {
    throw new Error('unsupported-github-content');
  }
  const text = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return JSON.parse(text) as unknown;
}

async function githubRequest(
  repository: string,
  ref: string,
  token: string,
  path: string,
): Promise<Response> {
  return fetch(
    `https://api.github.com/repos/${repository}/contents/${path}?ref=${encodeURIComponent(ref)}`,
    {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
      cache: 'no-store',
    },
  );
}

async function loadJson(
  repository: string,
  ref: string,
  token: string,
  path: string,
): Promise<unknown> {
  const response = await githubRequest(repository, ref, token, path);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('github-read-failed');
  return decodeJson((await response.json()) as GithubContentPayload);
}

async function loadDirectory(
  repository: string,
  ref: string,
  token: string,
  path: string,
): Promise<GithubEntry[]> {
  const response = await githubRequest(repository, ref, token, path);
  if (!response.ok) throw new Error('github-directory-read-failed');
  const value = (await response.json()) as unknown;
  return Array.isArray(value) ? (value as GithubEntry[]) : [];
}

function fallbackRead(notice: string): StudyCatalogRead {
  const snapshot = fallbackSnapshot as StudyCatalogSnapshot;
  return {
    state: 'degraded',
    subjects: snapshot.subjects,
    notice,
    sourceCommit: snapshot.source.commit,
  };
}

async function loadLiveCatalog(): Promise<StudyCatalogRead> {
  const token =
    process.env.UNIVERSITY_CATALOG_GITHUB_TOKEN?.trim() ||
    process.env.ENGLISH_PROFILE_GITHUB_TOKEN?.trim();

  if (!token) {
    return fallbackRead(
      'Mostrando una vista derivada del último main verificado. La lectura GitHub en vivo no está configurada.',
    );
  }

  const repository = process.env.UNIVERSITY_CATALOG_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const ref = process.env.UNIVERSITY_CATALOG_GITHUB_REF?.trim() || DEFAULT_REF;

  try {
    const rootEntries = await loadDirectory(repository, ref, token, SUBJECT_ROOT);
    const subjectIds = rootEntries
      .filter(
        (entry) =>
          entry.type === 'dir' &&
          typeof entry.name === 'string' &&
          /^[a-z0-9-]{1,64}$/.test(entry.name),
      )
      .map((entry) => entry.name as string)
      .slice(0, MAX_SUBJECTS);

    if (subjectIds.length === 0) {
      return fallbackRead(
        'El catálogo canónico no devolvió materias; se mantiene el snapshot derivado.',
      );
    }

    const subjects = await Promise.all(
      subjectIds.map(async (subjectId): Promise<StudyCatalogSubject | null> => {
        const base = `${SUBJECT_ROOT}/${subjectId}`;
        const [subject, current, blueprint, inventory, readiness, learningEntries] =
          await Promise.all([
            loadJson(repository, ref, token, `${base}/subject.json`),
            loadJson(repository, ref, token, `${base}/state/current.json`),
            loadJson(repository, ref, token, `${base}/learning/assessment_blueprint.json`),
            loadJson(repository, ref, token, `${base}/learning/concept_inventory.json`),
            loadJson(repository, ref, token, `${base}/learning/readiness_report.json`),
            loadDirectory(repository, ref, token, `${base}/learning`),
          ]);

        if (!subject || typeof subject !== 'object') return null;
        const status = (subject as Record<string, unknown>).status;
        if (status !== 'active') return null;

        return buildStudyCatalogSubject({
          subjectId,
          subject,
          current,
          blueprint,
          conceptInventory: inventory,
          readiness,
          learningFiles: learningEntries
            .filter((entry) => entry.type === 'file' && typeof entry.name === 'string')
            .map((entry) => entry.name as string),
        });
      }),
    );

    const active = subjects
      .filter((subject): subject is StudyCatalogSubject => Boolean(subject))
      .sort((left, right) => left.name.localeCompare(right.name, 'es'));

    if (active.length === 0) {
      return fallbackRead(
        'No se pudieron resolver materias activas; se mantiene el snapshot derivado.',
      );
    }

    return {
      state: 'ready',
      subjects: active,
      notice: null,
      sourceCommit: null,
    };
  } catch {
    return fallbackRead(
      'GitHub canónico no respondió correctamente; se mantiene el último snapshot derivado y no se inventa progreso.',
    );
  }
}

export const getUniversityStudyCatalog = cache(loadLiveCatalog);

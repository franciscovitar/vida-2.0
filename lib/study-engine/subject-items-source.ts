import 'server-only';

import { cache } from 'react';

import { parseAtomicStudyPack } from '@/lib/study-engine/atomic-pack';
import {
  parseStudySubjectItems,
  type StudySubjectItemsRead,
} from '@/lib/study-engine/subject-items';

const DEFAULT_REPOSITORY = 'franciscovitar/personal-ai-system';
const DEFAULT_REF = 'main';
const SUBJECT_ROOT = 'AI/projects/university/subjects';

type GithubContentPayload = { content?: string; encoding?: string };

function failure(
  state: 'missing' | 'unavailable' | 'invalid',
  subjectId: string,
  notice: string,
): StudySubjectItemsRead {
  return {
    state,
    subjectId,
    assessmentId: null,
    items: [],
    notice,
    runtimeKind: null,
  };
}

function decodeJson(payload: GithubContentPayload): unknown {
  if (payload.encoding !== 'base64' || !payload.content) {
    throw new Error('invalid-github-content');
  }
  const decoded = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
  return JSON.parse(decoded) as unknown;
}

async function githubJson(
  repository: string,
  ref: string,
  token: string,
  path: string,
): Promise<{ state: 'ready'; value: unknown } | { state: 'missing' }> {
  const response = await fetch(
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

  if (response.status === 404) return { state: 'missing' };
  if (!response.ok) throw new Error('github-read-failed');

  return {
    state: 'ready',
    value: decodeJson((await response.json()) as GithubContentPayload),
  };
}

async function loadSubjectItems(
  subjectId: string,
  assessmentId: string | null = null,
): Promise<StudySubjectItemsRead> {
  if (!/^[a-z0-9-]{1,64}$/.test(subjectId)) {
    return failure('invalid', subjectId, 'Materia inválida.');
  }

  const token =
    process.env.UNIVERSITY_CATALOG_GITHUB_TOKEN?.trim() ||
    process.env.ENGLISH_PROFILE_GITHUB_TOKEN?.trim();

  if (!token) {
    return failure(
      'unavailable',
      subjectId,
      'La lectura canónica de preguntas no está configurada.',
    );
  }

  const repository = process.env.UNIVERSITY_CATALOG_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const ref = process.env.UNIVERSITY_CATALOG_GITHUB_REF?.trim() || DEFAULT_REF;
  const base = `${SUBJECT_ROOT}/${subjectId}/learning`;

  try {
    if (assessmentId && /^[A-Za-z0-9._-]{1,128}$/.test(assessmentId)) {
      const atomicPath = `${base}/atomic_study/${assessmentId}_pack.json`;
      const atomic = await githubJson(repository, ref, token, atomicPath);
      if (atomic.state === 'ready') {
        return parseAtomicStudyPack(atomic.value, subjectId, assessmentId);
      }
    }

    const legacy = await githubJson(repository, ref, token, `${base}/study_engine_items_v1.json`);
    if (legacy.state === 'ready') {
      return parseStudySubjectItems(legacy.value, subjectId);
    }

    return failure(
      'missing',
      subjectId,
      assessmentId
        ? 'Esta evaluación todavía no tiene un Atomic Study Pack ni un set Study Engine compatible.'
        : 'Esta materia todavía no tiene una sesión Study Engine canónica.',
    );
  } catch {
    return failure('unavailable', subjectId, 'No se pudo leer el contenido canónico de Study Engine.');
  }
}

export const getStudySubjectItems = cache(loadSubjectItems);

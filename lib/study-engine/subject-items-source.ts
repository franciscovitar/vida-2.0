import 'server-only';

import { cache } from 'react';

import {
  parseStudySubjectItems,
  type StudySubjectItemsRead,
} from '@/lib/study-engine/subject-items';

const DEFAULT_REPOSITORY = 'franciscovitar/personal-ai-system';
const DEFAULT_REF = 'main';
const SUBJECT_ROOT = 'AI/projects/university/subjects';

async function loadSubjectItems(subjectId: string): Promise<StudySubjectItemsRead> {
  if (!/^[a-z0-9-]{1,64}$/.test(subjectId)) {
    return {
      state: 'invalid',
      subjectId,
      assessmentId: null,
      items: [],
      notice: 'Materia inválida.',
    };
  }

  const token =
    process.env.UNIVERSITY_CATALOG_GITHUB_TOKEN?.trim() ||
    process.env.ENGLISH_PROFILE_GITHUB_TOKEN?.trim();

  if (!token) {
    return {
      state: 'unavailable',
      subjectId,
      assessmentId: null,
      items: [],
      notice: 'La lectura canónica de preguntas no está configurada.',
    };
  }

  const repository = process.env.UNIVERSITY_CATALOG_GITHUB_REPOSITORY?.trim() || DEFAULT_REPOSITORY;
  const ref = process.env.UNIVERSITY_CATALOG_GITHUB_REF?.trim() || DEFAULT_REF;
  const path = `${SUBJECT_ROOT}/${subjectId}/learning/study_engine_items_v1.json`;

  try {
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

    if (response.status === 404) {
      return {
        state: 'missing',
        subjectId,
        assessmentId: null,
        items: [],
        notice: 'Esta materia todavía no tiene una sesión Study Engine canónica.',
      };
    }
    if (!response.ok) throw new Error('github-read-failed');

    const payload = (await response.json()) as { content?: string; encoding?: string };
    if (payload.encoding !== 'base64' || !payload.content)
      throw new Error('invalid-github-content');

    const decoded = Buffer.from(payload.content.replace(/\n/g, ''), 'base64').toString('utf8');
    return parseStudySubjectItems(JSON.parse(decoded) as unknown, subjectId);
  } catch {
    return {
      state: 'unavailable',
      subjectId,
      assessmentId: null,
      items: [],
      notice: 'No se pudo leer el set canónico de Study Engine.',
    };
  }
}

export const getStudySubjectItems = cache(loadSubjectItems);

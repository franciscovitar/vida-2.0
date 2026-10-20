import 'server-only';

import { cache } from 'react';

import { createPrivatePasReader, type PrivatePasReader } from '@/lib/private-pas/github-reader';

export type { PrivatePasReader } from '@/lib/private-pas/github-reader';
export { isAllowedPasDirectoryPath, isAllowedPasJsonPath } from '@/lib/private-pas/github-reader';

export const getPrivatePasReader = cache((): PrivatePasReader | null => {
  const token =
    process.env.UNIVERSITY_CATALOG_GITHUB_TOKEN?.trim() ||
    process.env.ENGLISH_PROFILE_GITHUB_TOKEN?.trim();
  return token ? createPrivatePasReader({ token }) : null;
});

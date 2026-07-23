import type { ContentBlock } from '@/types/content';

export type ContentBlockGroup =
  | { kind: 'single'; block: ContentBlock }
  | {
      kind: 'list';
      ordered: boolean;
      blocks: readonly ContentBlock[];
    };

export interface ContentOutlineItem {
  id: string;
  label: string;
  level: 1 | 2 | 3;
}

export function contentBlockText(block: ContentBlock): string {
  return block.text
    .map((part) => part.plain)
    .join('')
    .trim();
}

export function contentHeadingId(block: ContentBlock): string {
  return `section-${block.localId}`;
}

/** Agrupa listas consecutivas para no reiniciar viñetas o numeración en cada bloque. */
export function groupAdjacentContentBlocks(
  blocks: readonly ContentBlock[],
): ContentBlockGroup[] {
  const groups: ContentBlockGroup[] = [];

  for (const block of blocks) {
    const ordered = block.type === 'numbered_list_item';
    const isList = ordered || block.type === 'bulleted_list_item';

    if (!isList) {
      groups.push({ kind: 'single', block });
      continue;
    }

    const previous = groups.at(-1);
    if (previous?.kind === 'list' && previous.ordered === ordered) {
      groups[groups.length - 1] = {
        ...previous,
        blocks: [...previous.blocks, block],
      };
      continue;
    }

    groups.push({ kind: 'list', ordered, blocks: [block] });
  }

  return groups;
}

/** Índice sanitizado a partir de headings reales, incluidos headings anidados. */
export function buildContentOutline(blocks: readonly ContentBlock[]): ContentOutlineItem[] {
  const outline: ContentOutlineItem[] = [];

  const visit = (items: readonly ContentBlock[]) => {
    for (const block of items) {
      const level =
        block.type === 'heading_1'
          ? 1
          : block.type === 'heading_2'
            ? 2
            : block.type === 'heading_3'
              ? 3
              : null;
      if (level) {
        const label = contentBlockText(block);
        if (label) outline.push({ id: contentHeadingId(block), label, level });
      }
      if (block.children.length > 0) visit(block.children);
    }
  };

  visit(blocks);
  return outline;
}

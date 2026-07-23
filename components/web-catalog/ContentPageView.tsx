import { ArrowRight, Database, FileText } from 'lucide-react';
import type { ReactNode } from 'react';

import {
  buildContentOutline,
  contentHeadingId,
  groupAdjacentContentBlocks,
} from '@/lib/web-catalog/content-layout';
import type { ContentBlock, ContentPage, ContentText } from '@/types/content';

import styles from './ContentPageView.module.scss';

function textClasses(part: ContentText): string | undefined {
  const annotations = part.annotations;
  if (!annotations) return undefined;
  return [
    annotations.bold ? styles.bold : '',
    annotations.italic ? styles.italic : '',
    annotations.strikethrough ? styles.strikethrough : '',
    annotations.underline ? styles.underline : '',
    annotations.code ? styles['inline-code'] : '',
  ]
    .filter(Boolean)
    .join(' ');
}

function TextPart({ part }: { part: ContentText }) {
  const content = (
    <span
      className={textClasses(part)}
      data-color={part.annotations?.color ?? undefined}
    >
      {part.plain}
    </span>
  );

  if (part.href) {
    return (
      <a
        href={part.href}
        {...(part.external
          ? { target: '_blank', rel: 'noopener noreferrer' }
          : { rel: 'noopener noreferrer' })}
      >
        {content}
      </a>
    );
  }

  if (part.unavailable) {
    return (
      <span className={styles.unavailable} title="Contenido no disponible">
        {content}
      </span>
    );
  }

  return content;
}

function Texts({ parts }: { parts: readonly ContentText[] }) {
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, index) => (
        <TextPart key={`${index}-${part.plain}`} part={part} />
      ))}
    </>
  );
}

function ChildBlocks({ block }: { block: ContentBlock }) {
  return block.children.length > 0 ? <BlockList blocks={block.children} nested /> : null;
}

function ListItemView({ block }: { block: ContentBlock }) {
  return (
    <li className={styles.li}>
      <Texts parts={block.text} />
      <ChildBlocks block={block} />
    </li>
  );
}

function ListGroup({
  ordered,
  blocks,
}: {
  ordered: boolean;
  blocks: readonly ContentBlock[];
}) {
  const items = blocks.map((block) => <ListItemView key={block.localId} block={block} />);
  return ordered ? (
    <ol className={styles.list}>{items}</ol>
  ) : (
    <ul className={styles.list}>{items}</ul>
  );
}

function ChildResource({ block }: { block: ContentBlock }) {
  const isDatabase = block.type === 'child_database';
  const Icon = isDatabase ? Database : FileText;
  const title = block.childPageTitle ?? (isDatabase ? 'Base relacionada' : 'Página relacionada');

  if (!block.childPageSlug) {
    return (
      <div className={`${styles['child-resource']} ${styles['child-resource-muted']}`}>
        <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
        <div>
          <strong>{title}</strong>
          <span>No está publicada en la web.</span>
        </div>
      </div>
    );
  }

  return (
    <a className={styles['child-resource']} href={`/p/${block.childPageSlug}`}>
      <Icon size={18} strokeWidth={1.9} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <span>{isDatabase ? 'Abrir vista publicada' : 'Abrir página'}</span>
      </div>
      <ArrowRight className={styles['child-arrow']} size={17} aria-hidden="true" />
    </a>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return block.text.length === 0 ? (
        <div className={styles.spacer} aria-hidden="true" />
      ) : (
        <p className={styles.p}>
          <Texts parts={block.text} />
        </p>
      );
    case 'heading_1':
      return (
        <h2 id={contentHeadingId(block)} className={styles.h1}>
          <Texts parts={block.text} />
        </h2>
      );
    case 'heading_2':
      return (
        <h3 id={contentHeadingId(block)} className={styles.h2}>
          <Texts parts={block.text} />
        </h3>
      );
    case 'heading_3':
      return (
        <h4 id={contentHeadingId(block)} className={styles.h3}>
          <Texts parts={block.text} />
        </h4>
      );
    case 'bulleted_list_item':
      return <ListGroup ordered={false} blocks={[block]} />;
    case 'numbered_list_item':
      return <ListGroup ordered blocks={[block]} />;
    case 'to_do':
      return (
        <label className={styles.todo}>
          <input type="checkbox" checked={block.checked === true} readOnly disabled />
          <span>
            <Texts parts={block.text} />
          </span>
        </label>
      );
    case 'quote':
      return (
        <blockquote className={styles.quote}>
          <Texts parts={block.text} />
        </blockquote>
      );
    case 'callout':
      return (
        <aside className={styles.callout}>
          <Texts parts={block.text} />
        </aside>
      );
    case 'divider':
      return <hr className={styles.hr} />;
    case 'toggle':
      return (
        <details className={styles.toggle}>
          <summary>
            <Texts parts={block.text} />
          </summary>
          <ChildBlocks block={block} />
        </details>
      );
    case 'code':
      return (
        <pre className={styles.code}>
          <code data-language={block.language ?? undefined}>
            {block.text.map((part) => part.plain).join('')}
          </code>
        </pre>
      );
    case 'bookmark':
      if (block.link?.unavailable) {
        return <p className={styles.unavailable}>Contenido no disponible</p>;
      }
      return block.link?.url ? (
        <p className={styles.bookmark}>
          <a
            href={block.link.url}
            {...(block.link.external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : { rel: 'noopener noreferrer' })}
          >
            {block.link.label ?? block.link.url}
          </a>
        </p>
      ) : null;
    case 'image':
      return block.asset ? (
        <figure className={styles.figure}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={block.asset.url} alt={block.asset.caption ?? ''} loading="lazy" />
          {block.asset.caption ? <figcaption>{block.asset.caption}</figcaption> : null}
        </figure>
      ) : null;
    case 'child_page':
    case 'child_database':
      return <ChildResource block={block} />;
    default:
      return (
        <p className={styles.unsupported}>
          Este contenido todavía no tiene una vista web disponible.
        </p>
      );
  }
}

function BlockList({
  blocks,
  nested = false,
}: {
  blocks: readonly ContentBlock[];
  nested?: boolean;
}) {
  const nodes: ReactNode[] = groupAdjacentContentBlocks(blocks).map((group) => {
    if (group.kind === 'list') {
      const first = group.blocks[0];
      return first ? (
        <ListGroup
          key={`list-${first.localId}`}
          ordered={group.ordered}
          blocks={group.blocks}
        />
      ) : null;
    }
    return <BlockView key={group.block.localId} block={group.block} />;
  });

  return <div className={nested ? styles['blocks-nested'] : styles.blocks}>{nodes}</div>;
}

function formatEditedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function ContentPageView({ page }: { page: ContentPage }) {
  const outline = buildContentOutline(page.blocks);
  const editedAt = formatEditedAt(page.lastEditedAt);

  return (
    <article className={styles.article} aria-label={`Contenido de ${page.title}`}>
      <div className={styles.meta}>
        <span>Contenido sincronizado desde Notion</span>
        {editedAt ? <span>Actualizado {editedAt}</span> : null}
      </div>

      {outline.length >= 3 ? (
        <nav className={styles.toc} aria-label="Índice de esta página">
          <p className={styles['toc-title']}>En esta página</p>
          <ol>
            {outline.map((item) => (
              <li key={item.id} data-level={item.level}>
                <a href={`#${item.id}`}>{item.label}</a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      <BlockList blocks={page.blocks} />
    </article>
  );
}

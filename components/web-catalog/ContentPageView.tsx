import type { ReactNode } from 'react';

import type { ContentBlock, ContentPage, ContentText } from '@/types/content';

import styles from './ContentPageView.module.scss';

function Texts({ parts }: { parts: readonly ContentText[] }) {
  if (parts.length === 0) return null;
  return (
    <>
      {parts.map((part, index) => {
        if (part.href) {
          return (
            <a
              key={`${part.plain}-${index}`}
              href={part.href}
              {...(part.external
                ? { target: '_blank', rel: 'noopener noreferrer' }
                : { rel: 'noopener noreferrer' })}
            >
              {part.plain}
            </a>
          );
        }
        if (part.unavailable) {
          return (
            <span
              key={`${part.plain}-${index}`}
              className={styles.unavailable}
              title="Contenido no disponible"
            >
              {part.plain}
            </span>
          );
        }
        return <span key={`${part.plain}-${index}`}>{part.plain}</span>;
      })}
    </>
  );
}

function BlockView({ block }: { block: ContentBlock }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p className={styles.p}>
          <Texts parts={block.text} />
        </p>
      );
    case 'heading_1':
      return (
        <h2 className={styles.h1}>
          <Texts parts={block.text} />
        </h2>
      );
    case 'heading_2':
      return (
        <h3 className={styles.h2}>
          <Texts parts={block.text} />
        </h3>
      );
    case 'heading_3':
      return (
        <h4 className={styles.h3}>
          <Texts parts={block.text} />
        </h4>
      );
    case 'bulleted_list_item':
      return (
        <ul className={styles.list}>
          <li className={styles.li}>
            <Texts parts={block.text} />
            {block.children.length > 0 ? <BlockList blocks={block.children} /> : null}
          </li>
        </ul>
      );
    case 'numbered_list_item':
      return (
        <ol className={styles.list}>
          <li className={styles.li}>
            <Texts parts={block.text} />
            {block.children.length > 0 ? <BlockList blocks={block.children} /> : null}
          </li>
        </ol>
      );
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
          {block.children.length > 0 ? <BlockList blocks={block.children} /> : null}
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
      return block.childPageSlug ? (
        <p className={styles['child-page']}>
          <a href={`/p/${block.childPageSlug}`}>{block.childPageTitle ?? 'Página'}</a>
        </p>
      ) : (
        <p className={styles.unsupported}>Página hija no disponible en el catálogo.</p>
      );
    default:
      return <p className={styles.unsupported}>Bloque no soportado.</p>;
  }
}

function BlockList({ blocks }: { blocks: readonly ContentBlock[] }) {
  const nodes: ReactNode[] = blocks.map((block) => <BlockView key={block.localId} block={block} />);
  return <div className={styles.blocks}>{nodes}</div>;
}

export function ContentPageView({ page }: { page: ContentPage }) {
  return (
    <article className={styles.article}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          {page.icon ? <span aria-hidden="true">{page.icon} </span> : null}
          {page.title}
        </h1>
      </header>
      <BlockList blocks={page.blocks} />
    </article>
  );
}

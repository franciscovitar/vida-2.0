'use client';

import {
  createElement,
  Fragment,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  buildSafeElementSpec,
  sanitizeRichUrl,
  type RichContentBlock,
  type RichRenderPolicy,
} from '@/lib/study-engine/rich-content';

import styles from './SafeRichContent.module.scss';

function attrsFor(element: Element): Record<string, string> {
  return Object.fromEntries(
    Array.from(element.attributes).map((attribute) => [attribute.name, attribute.value]),
  );
}

function renderSafeDomNode(
  node: Node,
  key: string,
  policy: RichRenderPolicy,
): ReactNode {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const element = node as Element;
  const spec = buildSafeElementSpec(element.localName, attrsFor(element), policy);
  if (!spec) return null;

  const children = spec.isVoid
    ? []
    : Array.from(element.childNodes).map((child, index) =>
        renderSafeDomNode(child, key + '-' + index, policy),
      );

  return createElement(spec.tag, { key, ...spec.props }, ...children);
}

function SafeHtmlFragment({
  html,
  policy,
}: {
  html: string;
  policy: RichRenderPolicy;
}) {
  const [nodes, setNodes] = useState<ReactNode[]>([]);
  const remoteHostKey = (policy.allowedRemoteHosts ?? []).join('|');
  const localPrefixKey = (policy.allowedLocalPrefixes ?? []).join('|');

  useEffect(() => {
    const template = document.createElement('template');

    // Template contents are inert and never attached. We then rebuild only
    // allowlisted React elements instead of injecting the parsed markup.
    template.innerHTML = html;

    const effectivePolicy: RichRenderPolicy = {
      allowedRemoteHosts: remoteHostKey ? remoteHostKey.split('|') : [],
      allowedLocalPrefixes: localPrefixKey ? localPrefixKey.split('|') : undefined,
    };
    const rendered = Array.from(template.content.childNodes).map((node, index) =>
      renderSafeDomNode(node, 'html-' + index, effectivePolicy),
    );

    setNodes(rendered);
  }, [html, remoteHostKey, localPrefixKey]);

  return <>{nodes}</>;
}

function renderInlineMarkdown(value: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\`[^\`\n]+\`|\[[^\]\n]+\]\([^)\n]+\))/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let index = 0;

  for (const match of value.matchAll(pattern)) {
    const start = match.index ?? 0;
    if (start > cursor) result.push(value.slice(cursor, start));

    const token = match[0];
    const key = keyPrefix + '-' + index++;

    if (token.startsWith('**')) {
      result.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith('*')) {
      result.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith('`')) {
      result.push(<code key={key}>{token.slice(1, -1)}</code>);
    } else {
      const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      const href = link ? sanitizeRichUrl(link[2], 'link') : null;
      result.push(
        href ? (
          <a
            key={key}
            href={href}
            target={/^https?:/i.test(href) ? '_blank' : undefined}
            rel={/^https?:/i.test(href) ? 'noreferrer noopener' : undefined}
            referrerPolicy={/^https?:/i.test(href) ? 'no-referrer' : undefined}
          >
            {link?.[1]}
          </a>
        ) : (
          <span key={key}>{link?.[1] ?? token}</span>
        ),
      );
    }

    cursor = start + token.length;
  }

  if (cursor < value.length) result.push(value.slice(cursor));
  return result;
}

function MarkdownBlock({ markdown }: { markdown: string }) {
  const groups = useMemo(
    () => markdown.trim().split(/\n{2,}/).filter(Boolean),
    [markdown],
  );

  return (
    <div className={styles.markdown}>
      {groups.map((group, groupIndex) => {
        const heading = /^(#{1,4})\s+([^\n]+)$/.exec(group);
        if (heading) {
          const tag = 'h' + heading[1].length;
          return createElement(
            tag,
            { key: 'heading-' + groupIndex },
            ...renderInlineMarkdown(heading[2], 'heading-' + groupIndex),
          );
        }

        const lines = group.split('\n');
        if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
          return (
            <ul key={'list-' + groupIndex}>
              {lines.map((line, lineIndex) => (
                <li key={'list-' + groupIndex + '-' + lineIndex}>
                  {renderInlineMarkdown(
                    line.replace(/^\s*[-*]\s+/, ''),
                    'list-' + groupIndex + '-' + lineIndex,
                  )}
                </li>
              ))}
            </ul>
          );
        }

        return (
          <p key={'paragraph-' + groupIndex}>
            {lines.map((line, lineIndex) => (
              <Fragment key={'line-' + groupIndex + '-' + lineIndex}>
                {lineIndex > 0 ? <br /> : null}
                {renderInlineMarkdown(line, 'line-' + groupIndex + '-' + lineIndex)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function BlockedAsset({ label }: { label: string }) {
  return (
    <p className={styles.blocked} role="status">
      {label} bloqueado por la política de contenido.
    </p>
  );
}

export function SafeRichContent({
  blocks,
  policy = {},
}: {
  blocks: readonly RichContentBlock[];
  policy?: RichRenderPolicy;
}) {
  return (
    <div className={styles.root}>
      {blocks.map((block, index) => {
        const key = block.kind + '-' + index;

        if (block.kind === 'html') {
          return <SafeHtmlFragment key={key} html={block.html} policy={policy} />;
        }

        if (block.kind === 'markdown') {
          return <MarkdownBlock key={key} markdown={block.markdown} />;
        }

        if (block.kind === 'code') {
          return (
            <pre key={key} className={styles.code}>
              <code data-language={block.language}>{block.code}</code>
            </pre>
          );
        }

        if (block.kind === 'math') {
          return (
            <span
              key={key}
              className={block.display ? styles['math-display'] : styles.math}
              aria-label={'Expresión matemática: ' + block.tex}
            >
              {block.tex}
            </span>
          );
        }

        if (block.kind === 'image') {
          const src = sanitizeRichUrl(block.src, 'image', policy);
          if (!src) return <BlockedAsset key={key} label="Imagen" />;

          return (
            <figure key={key} className={styles.figure}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt={block.alt} loading="lazy" referrerPolicy="no-referrer" />
              {block.caption ? <figcaption>{block.caption}</figcaption> : null}
            </figure>
          );
        }

        if (block.kind === 'audio') {
          const src = sanitizeRichUrl(block.src, 'audio', policy);
          return src ? (
            <audio key={key} src={src} controls preload="metadata">
              {block.title}
            </audio>
          ) : (
            <BlockedAsset key={key} label="Audio" />
          );
        }

        const src = sanitizeRichUrl(block.src, 'video', policy);
        const poster = block.poster
          ? sanitizeRichUrl(block.poster, 'image', policy) ?? undefined
          : undefined;

        return src ? (
          <video key={key} src={src} poster={poster} controls preload="metadata">
            {block.title}
          </video>
        ) : (
          <BlockedAsset key={key} label="Video" />
        );
      })}
    </div>
  );
}

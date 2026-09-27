import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

import {
  buildSafeElementSpec,
  sanitizeInlineStyle,
  sanitizeRichUrl,
} from '@/lib/study-engine/rich-content';

test('rich renderer rejects executable tags and event-handler attributes', () => {
  assert.equal(buildSafeElementSpec('script', {}, {}), null);
  assert.equal(buildSafeElementSpec('iframe', { src: 'https://evil.example' }, {}), null);

  const paragraph = buildSafeElementSpec(
    'p',
    {
      onclick: 'alert(1)',
      onmouseover: 'steal()',
      title: 'seguro',
    },
    {},
  );

  assert.ok(paragraph);
  assert.deepEqual(paragraph.props, { title: 'seguro' });
});

test('rich renderer blocks javascript URLs and remote media by default', () => {
  assert.equal(sanitizeRichUrl('javascript:alert(1)', 'link'), null);
  assert.equal(sanitizeRichUrl('javascript:alert(1)', 'image'), null);
  assert.equal(sanitizeRichUrl('https://tracker.example/pixel.png', 'image'), null);
  assert.equal(sanitizeRichUrl('//tracker.example/pixel.png', 'image'), null);
  assert.equal(sanitizeRichUrl('/study-media/diagram.png', 'image'), '/study-media/diagram.png');
});

test('remote media requires an explicit hostname allowlist', () => {
  assert.equal(
    sanitizeRichUrl('https://media.example.edu/diagram.png', 'image', {
      allowedRemoteHosts: ['example.edu'],
    }),
    'https://media.example.edu/diagram.png',
  );
  assert.equal(
    sanitizeRichUrl('https://evil-example.edu/diagram.png', 'image', {
      allowedRemoteHosts: ['example.edu'],
    }),
    null,
  );
});

test('data URLs are limited to raster images and SVG data is rejected', () => {
  assert.equal(
    sanitizeRichUrl('data:image/png;base64,aGVsbG8=', 'image'),
    'data:image/png;base64,aGVsbG8=',
  );
  assert.equal(
    sanitizeRichUrl('data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+', 'image'),
    null,
  );
});

test('inline CSS strips resource loading and keeps a narrow visual allowlist', () => {
  assert.deepEqual(
    sanitizeInlineStyle(
      'color: #123456; background-image: url(https://tracker.example/x); font-weight: 700; position: fixed; text-align: center',
    ),
    {
      color: '#123456',
      fontWeight: '700',
      textAlign: 'center',
    },
  );
});

test('unsafe image attributes do not survive safe element normalization', () => {
  const image = buildSafeElementSpec(
    'img',
    {
      src: '/study-media/example.png',
      alt: 'Ejemplo',
      onerror: 'steal()',
      srcset: 'https://tracker.example/2x.png 2x',
      style: 'width: 9999px; color: red',
    },
    {},
  );

  assert.ok(image);
  assert.equal(image.props.src, '/study-media/example.png');
  assert.equal(image.props.alt, 'Ejemplo');
  assert.equal('onerror' in image.props, false);
  assert.equal('srcSet' in image.props, false);
  assert.deepEqual(image.props.style, { color: 'red' });
});

test('SVG keeps only inert geometry and paint attributes', () => {
  assert.equal(buildSafeElementSpec('foreignObject', {}, {}), null);
  const path = buildSafeElementSpec(
    'path',
    {
      d: 'M0 0 L10 10',
      fill: '#123456',
      onclick: 'alert(1)',
    },
    {},
  );

  assert.ok(path);
  assert.deepEqual(path.props, {
    fill: '#123456',
    d: 'M0 0 L10 10',
  });
});

test('React rich renderer never injects untrusted markup with dangerouslySetInnerHTML', () => {
  const source = readFileSync('components/study-engine/SafeRichContent.tsx', 'utf8');
  assert.equal(source.includes('dangerouslySetInnerHTML'), false);
  assert.equal(source.includes("document.createElement('template')"), true);
  assert.equal(source.includes('buildSafeElementSpec'), true);
});

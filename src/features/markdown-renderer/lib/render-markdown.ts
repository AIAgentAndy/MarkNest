import { toHtml } from 'hast-util-to-html';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeSlug from 'rehype-slug';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { Element, Root } from 'hast';
import type { Options as SanitizeSchema } from 'rehype-sanitize';
import type { Code } from 'mdast';
import type { RenderMarkdownOptions } from '../types';

export async function renderMarkdownToHtml(options: RenderMarkdownOptions): Promise<string> {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkMermaidBlocks)
    .use(remarkRehype, { allowDangerousHtml: true })
    .use(rehypeRaw)
    // 本地 Markdown 也可能包含脚本，默认必须经过白名单过滤。
    .use(rehypeSanitize, createSanitizeSchema(options.trustHtml ?? false))
    .use(rehypeSlug)
    .use(rehypeAutolinkHeadings, {
      behavior: 'append',
      properties: {
        className: ['markdown-heading-anchor'],
        ariaHidden: 'true',
        tabIndex: -1
      }
    })
    .use(rehypeKatex)
    .use(rehypeLocalImages, { resolveAssetUrl: options.resolveAssetUrl });

  const tree = processor.parse(options.markdown);
  const transformed = await processor.run(tree);
  return toHtml(transformed);
}

function remarkMermaidBlocks() {
  return (tree: Root) => {
    visit(tree, 'code', (node: Code) => {
      if (node.lang !== 'mermaid') {
        return;
      }

      const encoded = encodeURIComponent(node.value);
      node.type = 'html' as Code['type'];
      node.value = `<pre class="mermaid-block" data-mermaid-source="${encoded}"><code>${escapeHtml(
        node.value
      )}</code></pre>`;
    });
  };
}

function rehypeLocalImages(options: Pick<RenderMarkdownOptions, 'resolveAssetUrl'>) {
  return async (tree: Root) => {
    const imageNodes: Element[] = [];

    visit(tree, 'element', (node: Element) => {
      if (node.tagName === 'img') {
        imageNodes.push(node);
      }
    });

    await Promise.all(
      imageNodes.map(async (node) => {
        const src = node.properties?.src;
        if (!options.resolveAssetUrl || typeof src !== 'string' || isRemoteOrDataUrl(src)) {
          return;
        }

        const resolved = await options.resolveAssetUrl(src);
        if (resolved) {
          node.properties.src = resolved;
          node.properties.loading = 'lazy';
        }
      })
    );
  };
}

function createSanitizeSchema(trustHtml: boolean): SanitizeSchema {
  const baseAttributes = defaultSchema.attributes ?? {};
  return {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'section',
      'summary',
      'details',
      'mark',
      'span'
    ],
    attributes: {
      ...baseAttributes,
      '*': [
        ...(baseAttributes['*'] ?? []),
        'className',
        'id',
        'aria-label',
        'ariaLabel',
        'data-mermaid-source',
        'dataMermaidSource'
      ],
      input: [
        ...(baseAttributes.input ?? []),
        ['type', 'checkbox'],
        'checked',
        'disabled'
      ],
      img: [
        ...(baseAttributes.img ?? []),
        'src',
        'alt',
        'title',
        'width',
        'height',
        'loading'
      ],
      a: [...(baseAttributes.a ?? []), 'href', 'title', 'target', 'rel']
    },
    protocols: {
      ...defaultSchema.protocols,
      src: ['http', 'https', 'data', 'blob']
    },
    strip: trustHtml ? [] : ['script', 'style', 'iframe', 'object', 'embed']
  } satisfies SanitizeSchema;
}

function isRemoteOrDataUrl(src: string): boolean {
  return /^(https?:|data:|blob:|chrome-extension:)/i.test(src);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

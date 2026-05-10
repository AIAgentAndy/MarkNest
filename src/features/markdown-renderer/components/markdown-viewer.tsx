'use client';

import { memo, useEffect, useState } from 'react';
import 'github-markdown-css/github-markdown.css';
import 'katex/dist/katex.min.css';
import type { DocumentOutlineItem } from '../lib/document-outline';
import { extractDocumentOutline } from '../lib/document-outline';
import { renderMarkdownToHtml } from '../lib/render-markdown';
import type { AssetUrlResolver } from '../types';
import { MermaidEnhancer } from './mermaid-enhancer';

const htmlChunkTargetLength = 24_000;
const maxChunksPerIdleTask = 1;

type MarkdownViewerProps = {
  markdown: string;
  resolveAssetUrl?: AssetUrlResolver;
  theme?: 'light' | 'dark';
  onOutlineChange?: (items: DocumentOutlineItem[]) => void;
};

export function MarkdownViewer({
  markdown,
  resolveAssetUrl,
  theme = 'light',
  onOutlineChange
}: MarkdownViewerProps) {
  const [htmlChunks, setHtmlChunks] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let idleTaskId: number | null = null;

    const cancelScheduledAppend = () => {
      if (idleTaskId === null) {
        return;
      }

      cancelIdleTask(idleTaskId);
      idleTaskId = null;
    };

    async function render() {
      if (!markdown.trim()) {
        setHtmlChunks([]);
        setError(null);
        onOutlineChange?.([]);
        return;
      }

      try {
        const nextHtml = await renderMarkdownToHtml({
          markdown,
          resolveAssetUrl
        });

        if (!cancelled) {
          const nextChunks = splitRenderedHtmlIntoChunks(nextHtml);
          setHtmlChunks(nextChunks.slice(0, 1));
          setError(null);
          onOutlineChange?.(extractDocumentOutline(markdown));

          if (nextChunks.length > 1) {
            let nextIndex = 1;

            const appendChunks = (deadline: IdleDeadline) => {
              idleTaskId = null;
              if (cancelled) {
                return;
              }

              const appended: string[] = [];
              while (
                nextIndex < nextChunks.length &&
                appended.length < maxChunksPerIdleTask &&
                (appended.length === 0 || deadline.timeRemaining() > 8 || deadline.didTimeout)
              ) {
                appended.push(nextChunks[nextIndex]);
                nextIndex += 1;
              }

              if (appended.length > 0) {
                setHtmlChunks((current) => [...current, ...appended]);
              }

              if (nextIndex < nextChunks.length) {
                idleTaskId = requestIdleTask(appendChunks);
              }
            };

            idleTaskId = requestIdleTask(appendChunks);
          }
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(renderError instanceof Error ? renderError.message : 'Markdown 渲染失败');
        }
      }
    }

    void render();

    return () => {
      cancelled = true;
      cancelScheduledAppend();
    };
  }, [markdown, onOutlineChange, resolveAssetUrl]);

  if (!markdown.trim()) {
    return (
      <section className="markdown-empty">
        <h2>选择左侧 Markdown 文件开始阅读</h2>
        <p>也可以先点击顶部按钮打开本地目录或单个 Markdown 文件。</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="markdown-error" role="alert">
        <h2>渲染失败</h2>
        <p>{error}</p>
      </section>
    );
  }

  return (
    <>
      <MermaidEnhancer theme={theme} renderVersion={`${markdown.length}:${htmlChunks.length}`} />
      <article className="markdown-body markdown-reader">
        {htmlChunks.map((chunk, index) => (
          <MarkdownHtmlChunk key={index} html={chunk} />
        ))}
      </article>
    </>
  );
}

const MarkdownHtmlChunk = memo(function MarkdownHtmlChunk({ html }: { html: string }) {
  return (
    <section
      className="markdown-reader-chunk"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
});

function splitRenderedHtmlIntoChunks(html: string): string[] {
  if (html.length <= htmlChunkTargetLength) {
    return [html];
  }

  const boundaries = collectSafeHtmlBoundaries(html);
  const chunks: string[] = [];
  let chunkStart = 0;
  let lastGoodBoundary = 0;

  for (const boundary of boundaries) {
    if (boundary <= chunkStart) {
      continue;
    }

    if (boundary - chunkStart <= htmlChunkTargetLength) {
      lastGoodBoundary = boundary;
      continue;
    }

    const chunkEnd = lastGoodBoundary > chunkStart ? lastGoodBoundary : boundary;
    chunks.push(html.slice(chunkStart, chunkEnd));
    chunkStart = chunkEnd;
    lastGoodBoundary = boundary;
  }

  if (chunkStart < html.length) {
    chunks.push(html.slice(chunkStart));
  }

  return chunks.filter(Boolean);
}

function collectSafeHtmlBoundaries(html: string): number[] {
  const boundaries = new Set<number>([html.length]);
  const headingStartPattern = /<h[1-3]\b/g;
  const blockEndPattern = /<\/(?:blockquote|details|div|h[1-6]|li|ol|p|pre|table|ul)>/g;

  for (const match of html.matchAll(headingStartPattern)) {
    if (typeof match.index === 'number' && match.index > 0) {
      boundaries.add(match.index);
    }
  }

  for (const match of html.matchAll(blockEndPattern)) {
    boundaries.add(match.index + match[0].length);
  }

  return Array.from(boundaries).sort((left, right) => left - right);
}

function requestIdleTask(callback: IdleRequestCallback): number {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 120 });
  }

  return window.setTimeout(() => {
    callback({
      didTimeout: true,
      timeRemaining: () => 0
    } as IdleDeadline);
  }, 16);
}

function cancelIdleTask(taskId: number) {
  if (typeof window.cancelIdleCallback === 'function') {
    window.cancelIdleCallback(taskId);
    return;
  }

  window.clearTimeout(taskId);
}

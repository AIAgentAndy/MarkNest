'use client';

import { type CSSProperties, type KeyboardEvent, useEffect, useRef, useState } from 'react';

const FULLSCREEN_MAX_SCALE = 100;
const FULLSCREEN_MIN_SCALE = 15;

type MermaidApi = {
  initialize: (config: {
    startOnLoad: boolean;
    theme: 'default' | 'dark';
    suppressErrorRendering: boolean;
  }) => void;
  parse: (source: string, options: { suppressErrors: boolean }) => Promise<false | unknown>;
  render: (id: string, source: string, container?: HTMLElement) => Promise<{ svg: string }>;
};

type FullscreenMermaid = {
  svg: string;
  originalWidth: number;
  scale: number;
};

export function MermaidEnhancer({
  theme,
  renderVersion
}: {
  theme: 'light' | 'dark';
  renderVersion: string | number;
}) {
  const previousThemeRef = useRef(theme);
  const [fullscreenMermaid, setFullscreenMermaid] = useState<FullscreenMermaid | null>(null);
  const closeFullscreen = () => setFullscreenMermaid(null);

  useEffect(() => {
    let cancelled = false;
    let idleTaskId: number | null = null;

    async function renderMermaidBlocks() {
      if (!document.querySelector('.markdown-body .mermaid-block[data-mermaid-source]')) {
        return;
      }

      const mermaidModule = (await import('mermaid')).default as MermaidApi;
      if (cancelled) {
        return;
      }

      const themeChanged = previousThemeRef.current !== theme;
      previousThemeRef.current = theme;

      mermaidModule.initialize({
        startOnLoad: false,
        theme: theme === 'dark' ? 'dark' : 'default',
        suppressErrorRendering: true
      });

      if (cancelled) {
        return;
      }

      const blocks = Array.from(
        document.querySelectorAll<HTMLElement>(
          themeChanged
            ? '.markdown-body .mermaid-block[data-mermaid-source]'
            : '.markdown-body .mermaid-block[data-mermaid-source]:not([data-rendered="true"]):not([data-error])'
        )
      );
      let nextIndex = 0;

      if (blocks.length === 1) {
        await renderMermaidBlock(mermaidModule, blocks[0], 0, theme, () => cancelled, setFullscreenMermaid);
        return;
      }

      const renderNextBlock = (deadline: IdleDeadline) => {
        if (cancelled) {
          return;
        }

        const run = async () => {
          let renderedCount = 0;
          while (
            nextIndex < blocks.length &&
            (renderedCount === 0 || deadline.timeRemaining() > 8 || deadline.didTimeout)
          ) {
            const block = blocks[nextIndex];
            const index = nextIndex;
            nextIndex += 1;
            renderedCount += 1;

            await renderMermaidBlock(
              mermaidModule,
              block,
              index,
              theme,
              () => cancelled,
              setFullscreenMermaid
            );
          }

          if (!cancelled && nextIndex < blocks.length) {
            idleTaskId = requestIdleTask(renderNextBlock);
          }
        };

        void run();
      };

      if (blocks.length > 0) {
        idleTaskId = requestIdleTask(renderNextBlock);
      }
    }

    void renderMermaidBlocks();

    return () => {
      cancelled = true;
      if (idleTaskId !== null) {
        cancelIdleTask(idleTaskId);
      }
    };
  }, [renderVersion, theme]);

  const fullscreenWidth = fullscreenMermaid
    ? fullscreenMermaid.originalWidth * (fullscreenMermaid.scale / FULLSCREEN_MAX_SCALE)
    : 0;
  const zoomThumbTop = fullscreenMermaid
    ? ((FULLSCREEN_MAX_SCALE - fullscreenMermaid.scale) /
        (FULLSCREEN_MAX_SCALE - FULLSCREEN_MIN_SCALE)) *
      100
    : 0;
  const updateFullscreenScale = (scale: number) => {
    const nextScale = clampScale(scale);
    setFullscreenMermaid((current) => (current ? { ...current, scale: nextScale } : current));
  };
  const updateFullscreenScaleFromPointer = (clientY: number, slider: HTMLElement) => {
    const rect = slider.getBoundingClientRect();
    const progress = (clientY - rect.top) / rect.height;
    const nextScale = FULLSCREEN_MAX_SCALE - progress * (FULLSCREEN_MAX_SCALE - FULLSCREEN_MIN_SCALE);
    updateFullscreenScale(nextScale);
  };
  const handleZoomKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!fullscreenMermaid) {
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      updateFullscreenScale(fullscreenMermaid.scale + 1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      updateFullscreenScale(fullscreenMermaid.scale - 1);
    } else if (event.key === 'PageUp') {
      event.preventDefault();
      updateFullscreenScale(fullscreenMermaid.scale + 5);
    } else if (event.key === 'PageDown') {
      event.preventDefault();
      updateFullscreenScale(fullscreenMermaid.scale - 5);
    } else if (event.key === 'Home') {
      event.preventDefault();
      updateFullscreenScale(FULLSCREEN_MAX_SCALE);
    } else if (event.key === 'End') {
      event.preventDefault();
      updateFullscreenScale(FULLSCREEN_MIN_SCALE);
    }
  };

  return fullscreenMermaid ? (
    <div className="mermaid-fullscreen-overlay" role="dialog" aria-label="Mermaid 图表全屏预览">
      <div className="mermaid-fullscreen-toolbar">
        <button
          type="button"
          className="mermaid-fullscreen-close"
          aria-label="退出全屏 Mermaid 图表"
          onClick={closeFullscreen}
        >
          退出全屏
        </button>
      </div>
      {fullscreenMermaid.originalWidth > 0 ? (
        <div className="mermaid-fullscreen-zoom">
          <span>{fullscreenMermaid.scale}%</span>
          <div
            className="mermaid-fullscreen-zoom-slider"
            role="slider"
            tabIndex={0}
            aria-label="缩小 Mermaid 图表"
            aria-orientation="vertical"
            aria-valuemin={FULLSCREEN_MIN_SCALE}
            aria-valuemax={FULLSCREEN_MAX_SCALE}
            aria-valuenow={fullscreenMermaid.scale}
            aria-valuetext={`${fullscreenMermaid.scale}%`}
            style={{ '--zoom-thumb-top': `${zoomThumbTop}%` } as CSSProperties}
            onPointerDown={(event) => {
              event.preventDefault();
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFullscreenScaleFromPointer(event.clientY, event.currentTarget);
            }}
            onPointerMove={(event) => {
              if (event.buttons !== 1) {
                return;
              }

              updateFullscreenScaleFromPointer(event.clientY, event.currentTarget);
            }}
            onKeyDown={handleZoomKeyDown}
          >
            <span className="mermaid-fullscreen-zoom-track" aria-hidden />
            <span className="mermaid-fullscreen-zoom-thumb" aria-hidden />
          </div>
        </div>
      ) : null}
      <div className="mermaid-fullscreen-stage">
        <div
          className="mermaid-fullscreen-content"
          style={{ width: `${fullscreenWidth}px` }}
          dangerouslySetInnerHTML={{ __html: fullscreenMermaid.svg }}
        />
      </div>
    </div>
  ) : null;
}

function clampScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return FULLSCREEN_MAX_SCALE;
  }

  return Math.min(FULLSCREEN_MAX_SCALE, Math.max(FULLSCREEN_MIN_SCALE, Math.round(scale)));
}

async function renderMermaidBlock(
  mermaidModule: MermaidApi,
  block: HTMLElement,
  index: number,
  theme: 'light' | 'dark',
  isCancelled: () => boolean,
  openFullscreen: (diagram: FullscreenMermaid) => void
) {
  if (!block.isConnected) {
    return;
  }

  if (block.dataset.rendered === 'true' && block.dataset.mermaidTheme === theme) {
    return;
  }

  const encoded = block.dataset.mermaidSource;
  if (!encoded) {
    return;
  }

  let source = '';

  try {
    source = decodeURIComponent(encoded);
    const parsed = await mermaidModule.parse(source, { suppressErrors: true });
    if (!parsed) {
      if (!isCancelled()) {
        block.dataset.error = 'Mermaid 语法无效';
        delete block.dataset.rendered;
        delete block.dataset.mermaidTheme;
      }
      return;
    }

    const { svg } = await mermaidModule.render(`md-view-mermaid-${Date.now()}-${index}`, source);
    if (!isCancelled()) {
      block.innerHTML = svg;
      normalizeMermaidSvgSize(block);
      attachFullscreenButton(block, openFullscreen);
      block.dataset.rendered = 'true';
      block.dataset.mermaidTheme = theme;
      delete block.dataset.error;
    }
  } catch (error) {
    if (isCancelled()) {
      return;
    }

    if (!isCancelled()) {
      // 单个图表失败不影响整篇文档阅读。
      if (block.innerHTML.trim() === '' && source) {
        block.innerHTML = `<code>${escapeHtml(source)}</code>`;
      }
      block.dataset.error = error instanceof Error ? error.message : 'Mermaid 渲染失败';
      delete block.dataset.rendered;
      delete block.dataset.mermaidTheme;
    }
  }
}

function attachFullscreenButton(block: HTMLElement, openFullscreen: (diagram: FullscreenMermaid) => void) {
  const svg = block.querySelector('svg');
  if (!svg) {
    return;
  }

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'mermaid-fullscreen-button';
  button.setAttribute('aria-label', '全屏查看 Mermaid 图表');
  button.title = '全屏';
  button.textContent = '全屏';
  button.addEventListener('click', () => {
    openFullscreen(createFullscreenMermaid(svg));
  });
  block.append(button);
}

function createFullscreenMermaid(svg: SVGSVGElement): FullscreenMermaid {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.style.width = '100%';
  clone.style.maxWidth = 'none';
  clone.style.height = 'auto';

  return {
    svg: clone.outerHTML,
    originalWidth: getMermaidSvgWidth(svg),
    scale: FULLSCREEN_MAX_SCALE
  };
}

function getMermaidSvgWidth(svg: SVGSVGElement): number {
  const styleWidth = Number.parseFloat(svg.style.width);
  if (Number.isFinite(styleWidth) && styleWidth > 0) {
    return styleWidth;
  }

  const widthAttribute = Number.parseFloat(svg.getAttribute('width') ?? '');
  if (Number.isFinite(widthAttribute) && widthAttribute > 0) {
    return widthAttribute;
  }

  return svg.viewBox.baseVal.width;
}

function normalizeMermaidSvgSize(block: HTMLElement) {
  const svg = block.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox');
  if (!svg || !viewBox) {
    return;
  }

  const [, , width] = viewBox.split(/\s+/).map(Number);
  if (!Number.isFinite(width) || width <= 0) {
    return;
  }

  svg.removeAttribute('width');
  svg.removeAttribute('height');
  svg.style.width = `${width}px`;
  svg.style.maxWidth = 'none';
  svg.style.height = 'auto';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function requestIdleTask(callback: IdleRequestCallback): number {
  if (typeof window.requestIdleCallback === 'function') {
    return window.requestIdleCallback(callback, { timeout: 160 });
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

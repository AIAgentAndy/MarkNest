import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const cssPath = path.join(process.cwd(), 'src', 'app', 'globals.css');

describe('MarkNest app shell styling', () => {
  it('uses the Emerald Workbench Pro shell tokens without overriding Markdown rendering structure', async () => {
    const css = await readFile(cssPath, 'utf8');

    expect(css).toContain('--accent: #0f766e');
    expect(css).toContain('--accent-strong: #0f5f59');
    expect(css).toContain('--accent-alt: #10b981');
    expect(css).toContain('--accent-soft: #dff8ed');
    expect(css).toContain('--accent-strong: #5eead4');
    expect(css).toContain('.brand-logo');
    expect(css).toContain('.brand-logo-primary');
    expect(css).toContain('.brand-logo-bright');
    expect(css).toContain('.brand-slogan');
    expect(readCssRule(css, '.brand-slogan')).toContain('color: var(--text);');
    expect(readCssRule(css, '.brand-slogan')).toContain('font-size: 11px;');
    expect(css).not.toMatch(/\.brand-slogan\s*\{[^}]*font-size:\s*12px;/);
    expect(css).toContain('.sidebar-tab[aria-selected=\'true\']');
    expect(css).toContain('box-shadow: var(--panel-shadow)');
    expect(css).toContain('gap: 40px');
    expect(css).toContain('height: 124px');
    expect(css).toContain('@keyframes about-copy-feedback');
    expect(css).toContain('.markdown-reader');
    expect(css).toContain('background: transparent;');
  });

  it('allows wide Mermaid diagrams and deep file tree rows to scroll horizontally', async () => {
    const css = await readFile(cssPath, 'utf8');

    expect(readCssRule(css, '.mermaid-block svg')).toContain('width: auto;');
    expect(readCssRule(css, '.mermaid-block svg')).toContain('max-width: none;');
    expect(readCssRule(css, '.file-tree')).toContain('overflow-x: auto;');
    expect(readCssRule(css, '.tree-row')).toContain('width: max-content;');
    expect(readCssRule(css, '.tree-row')).toContain('min-width: 100%;');

    const treeRowTextRule = readCssRule(css, '.tree-row span');
    expect(treeRowTextRule).toContain('overflow: visible;');
    expect(treeRowTextRule).not.toContain('text-overflow: ellipsis;');
  });

  it('lets Mermaid fullscreen preview keep original diagram size with automatic scrolling', async () => {
    const css = await readFile(cssPath, 'utf8');

    expect(readCssRule(css, '.mermaid-fullscreen-overlay')).toContain('position: fixed;');
    expect(readCssRule(css, '.mermaid-fullscreen-stage')).toContain('overflow: auto;');
    expect(readCssRule(css, '.mermaid-fullscreen-stage')).toContain('overflow-y: auto;');
    expect(readCssRule(css, '.mermaid-fullscreen-content')).not.toContain('min-width: 100%;');
    expect(readCssRule(css, '.mermaid-fullscreen-content svg')).toContain('width: 100%;');
    expect(readCssRule(css, '.mermaid-fullscreen-content svg')).toContain('max-width: none;');
    expect(readCssRule(css, '.mermaid-fullscreen-content svg')).toContain('height: auto;');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom')).toContain('position: fixed;');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom')).toContain('--zoom-track-size: 128px;');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom-slider')).toContain('height: var(--zoom-track-size);');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom-slider')).toContain('touch-action: none;');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom-track')).toContain('width: 4px;');
    expect(readCssRule(css, '.mermaid-fullscreen-zoom-thumb')).toContain('top: var(--zoom-thumb-top);');
    expect(css).not.toContain('.mermaid-fullscreen-zoom input[type=\'range\']');
  });

  it('prints only the Markdown body from file URL reader pages', async () => {
    const css = await readFile(cssPath, 'utf8');

    expect(css).toContain('@media print');
    expect(css).toContain('.floating-control-toggle,');
    expect(css).toContain('.reader-menu-popover,');
    expect(css).toContain('.sidebar,');
    expect(css).toContain('.sidebar-resizer,');
    expect(css).toContain('.sidebar-peek-toggle,');
    expect(css).toContain('.scroll-top-button');
    expect(css).toContain('display: none !important;');
    expect(css).toContain('.file-url-reader-layout {');
    expect(css).toContain('display: block !important;');
    expect(css).toContain('.content-pane {');
    expect(css).toContain('overflow: visible !important;');
    expect(css).toContain('.markdown-reader,');
    expect(css).toContain('.markdown-source-view');
    expect(css).toContain('width: 100% !important;');
  });

  it('uses a soft mint treatment for the scroll-to-top helper button', async () => {
    const css = await readFile(cssPath, 'utf8');
    const buttonRule = readCssRule(css, '.scroll-top-button');
    const hoverRule = readCssRule(css, '.scroll-top-button:hover');

    expect(buttonRule).toContain('border: 1px solid color-mix(in srgb, var(--accent) 26%, var(--border));');
    expect(buttonRule).toContain('background: color-mix(in srgb, var(--accent-soft) 78%, var(--panel-bg));');
    expect(buttonRule).toContain('color: var(--accent-strong);');
    expect(buttonRule).toContain('box-shadow: 0 10px 24px rgba(15, 118, 110, 0.14);');
    expect(buttonRule).not.toContain('background: var(--accent);');
    expect(buttonRule).not.toContain('color: #fff;');
    expect(hoverRule).toContain('background: color-mix(in srgb, var(--accent-soft-alt) 82%, var(--panel-bg));');
  });
});

function readCssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`));

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match.groups.body;
}

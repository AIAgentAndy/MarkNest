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
});

function readCssRule(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`));

  if (!match?.groups?.body) {
    throw new Error(`Missing CSS rule for ${selector}`);
  }

  return match.groups.body;
}

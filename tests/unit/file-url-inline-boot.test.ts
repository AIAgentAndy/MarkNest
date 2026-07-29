import { describe, expect, it } from 'vitest';
import {
  installFileUrlInlineReaderStyles,
  removeFileUrlInlineReaderStyles,
  shouldLoadFileUrlInlineReader
} from '../../extension/file-url-inline-boot';

describe('file-url-inline-boot', () => {
  it('只在 Markdown 文件和本地目录页加载完整直渲染入口', () => {
    expect(shouldLoadFileUrlInlineReader('file:///Users/example/docs/guide.md')).toBe(true);
    expect(shouldLoadFileUrlInlineReader('file:///Users/example/docs/')).toBe(true);
    expect(shouldLoadFileUrlInlineReader('file:///')).toBe(true);
    expect(shouldLoadFileUrlInlineReader('https://example.com/docs/guide.md?raw=1')).toBe(true);

    expect(
      shouldLoadFileUrlInlineReader(
        'https://www.google.com/search?q=mac+terminal%E7%BE%8E%E5%8C%96'
      )
    ).toBe(false);
    expect(
      shouldLoadFileUrlInlineReader(
        'https://jackchoumine.github.io/others/mac/%E7%BE%8E%E5%8C%96%E7%BB%88%E7%AB%AF.html'
      )
    ).toBe(false);
    expect(shouldLoadFileUrlInlineReader('https://example.com/docs/guide.html')).toBe(false);
  });

  it('按需预载禁用样式且不会重复插入，避免判定渲染前影响原始页面', () => {
    installFileUrlInlineReaderStyles(document, 'chrome-extension://marknest/file-url-inline-entry.css');
    installFileUrlInlineReaderStyles(document, 'chrome-extension://marknest/file-url-inline-entry.css');

    const stylesheets = document.head.querySelectorAll<HTMLLinkElement>(
      'link[data-marknest-inline-reader-style="true"]'
    );
    expect(stylesheets).toHaveLength(1);
    expect(stylesheets[0]?.rel).toBe('stylesheet');
    expect(stylesheets[0]?.href).toBe('chrome-extension://marknest/file-url-inline-entry.css');
    // 预载阶段保持禁用，待阅读器接管页面后再启用。
    expect(stylesheets[0]?.disabled).toBe(true);
  });

  it('不接管页面时移除预载样式，恢复原始页面', () => {
    installFileUrlInlineReaderStyles(document, 'chrome-extension://marknest/file-url-inline-entry.css');
    expect(
      document.head.querySelector('link[data-marknest-inline-reader-style="true"]')
    ).not.toBeNull();

    removeFileUrlInlineReaderStyles(document);
    expect(
      document.head.querySelector('link[data-marknest-inline-reader-style="true"]')
    ).toBeNull();
  });
});

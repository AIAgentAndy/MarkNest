import { describe, expect, it } from 'vitest';
import {
  installFileUrlInlineReaderStyles,
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

  it('按需插入直渲染样式且不会重复插入', () => {
    installFileUrlInlineReaderStyles(document, 'chrome-extension://marknest/file-url-inline-entry.css');
    installFileUrlInlineReaderStyles(document, 'chrome-extension://marknest/file-url-inline-entry.css');

    const stylesheets = document.head.querySelectorAll<HTMLLinkElement>(
      'link[data-marknest-inline-reader-style="true"]'
    );
    expect(stylesheets).toHaveLength(1);
    expect(stylesheets[0]?.rel).toBe('stylesheet');
    expect(stylesheets[0]?.href).toBe('chrome-extension://marknest/file-url-inline-entry.css');
  });
});

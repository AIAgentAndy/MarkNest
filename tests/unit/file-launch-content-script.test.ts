import { describe, expect, it, vi } from 'vitest';
import {
  createLocalMarkdownLaunchMessage,
  shouldLaunchLocalMarkdown
} from '../../extension/file-launch-content-script';

describe('file-launch-content-script', () => {
  it('只处理 file:// 下的 Markdown 文件 URL', () => {
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.md')).toBe(true);
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.markdown')).toBe(true);
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.txt')).toBe(false);
    expect(shouldLaunchLocalMarkdown('https://example.com/demo.md')).toBe(false);
  });

  it('从 Chrome 打开的 Markdown file 页面提取文件名和正文', () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('file:///Users/example/My%20Doc.md')
    });
    document.body.innerHTML = '<pre># Title\n\n正文</pre>';

    const message = createLocalMarkdownLaunchMessage(document, window.location.href);

    expect(message).toEqual({
      type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
      fileName: 'My Doc.md',
      fileUrl: 'file:///Users/example/My%20Doc.md',
      markdown: '# Title\n\n正文'
    });
  });
});

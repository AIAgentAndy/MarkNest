import { describe, expect, it, vi } from 'vitest';
import {
  createFileUrlInlineLaunchPayload,
  createLocalDirectoryLaunchMessage,
  createLocalMarkdownLaunchMessage,
  launchLocalMarkdownFromCurrentPage,
  shouldLaunchLocalMarkdownDirectory,
  shouldLaunchLocalMarkdown
} from '../../extension/file-launch-content-script';

describe('file-launch-content-script', () => {
  it('只处理 file:// 下的 Markdown 文件 URL', () => {
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.md')).toBe(true);
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.markdown')).toBe(true);
    expect(shouldLaunchLocalMarkdown('file:///Users/example/demo.txt')).toBe(false);
    expect(shouldLaunchLocalMarkdown('https://example.com/demo.md')).toBe(true);
    expect(shouldLaunchLocalMarkdown('https://example.com/docs/demo.markdown?raw=1')).toBe(true);
    expect(shouldLaunchLocalMarkdown('https://example.com/demo.txt')).toBe(false);
  });

  it('识别 file:// 本地目录 URL', () => {
    expect(shouldLaunchLocalMarkdownDirectory('file:///Users/example/docs/')).toBe(true);
    expect(shouldLaunchLocalMarkdownDirectory('file:///')).toBe(true);
    expect(shouldLaunchLocalMarkdownDirectory('file:///Users/example/docs/demo.md')).toBe(false);
    expect(shouldLaunchLocalMarkdownDirectory('https://example.com/docs/')).toBe(false);
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

  it('从 Chrome 打开的在线 Markdown 页面提取文件名和正文', () => {
    document.body.innerHTML = '<pre># Online\n\n远程正文</pre>';

    const message = createLocalMarkdownLaunchMessage(document, 'https://example.com/docs/Guide%20Book.md?raw=1');

    expect(message).toEqual({
      type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
      fileName: 'Guide Book.md',
      fileUrl: 'https://example.com/docs/Guide%20Book.md?raw=1',
      markdown: '# Online\n\n远程正文'
    });
  });

  it('从 Chrome 本地目录页提取 Markdown 文件链接', () => {
    document.body.innerHTML = [
      '<a href="README.md">README.md</a>',
      '<a href="设计文档.markdown">设计文档.markdown</a>',
      '<a href="notes.txt">notes.txt</a>',
      '<a href="../">Parent Directory</a>',
      '<a href="sub/">sub/</a>'
    ].join('');

    const message = createLocalDirectoryLaunchMessage(
      document,
      'file:///Users/example/docs/'
    );

    expect(message).toEqual({
      type: 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL',
      directoryName: 'docs',
      directoryUrl: 'file:///Users/example/docs/',
      entries: [
        {
          name: 'README.md',
          fileUrl: 'file:///Users/example/docs/README.md'
        },
        {
          name: '设计文档.markdown',
          fileUrl: 'file:///Users/example/docs/%E8%AE%BE%E8%AE%A1%E6%96%87%E6%A1%A3.markdown'
        }
      ]
    });
  });

  it('为 file:// Markdown 页面创建直渲染启动载荷，包含当前文件和正文', () => {
    document.body.innerHTML = '<pre># Current\n\n正文</pre>';

    const payload = createFileUrlInlineLaunchPayload(document, 'file:///Users/example/docs/current.md');

    expect(payload).toMatchObject({
      type: 'file-url',
      fileName: 'current.md',
      fileUrl: 'file:///Users/example/docs/current.md',
      markdown: '# Current\n\n正文'
    });
  });

  it('直渲染模式不再向后台发送打开扩展页消息', () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('file:///Users/example/docs/current.md')
    });
    document.body.innerHTML = '<pre># Current</pre>';

    launchLocalMarkdownFromCurrentPage();

    expect(sendMessage).not.toHaveBeenCalled();
  });
});

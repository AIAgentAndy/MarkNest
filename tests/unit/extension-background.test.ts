import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleExtensionActionClick, handleExtensionMessage } from '@/../extension/background';

describe('extension background', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('点击工具栏时打开支持说明页，不再打开扩展首页', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn((path: string) => `chrome-extension://marknest/${path}`);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
      },
      tabs: {
        create
      }
    });

    await handleExtensionActionClick();

    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://marknest/support.html'
    });
  });

  it('收到打开扩展详情页消息时创建 Chrome 扩展详情标签页', async () => {
    const create = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      runtime: {
        id: 'marknest-extension-id',
        getURL: vi.fn((path: string) => `chrome-extension://marknest/${path}`)
      },
      tabs: {
        create
      }
    });

    const handled = await handleExtensionMessage(
      {
        type: 'MARKNEST_OPEN_EXTENSION_DETAILS'
      },
      vi.fn()
    );

    expect(handled).toBe(false);
    expect(create).toHaveBeenCalledWith({
      url: 'chrome://extensions/?id=marknest-extension-id'
    });
  });

  it('为 file:// Markdown 直渲染读取当前文件并递归索引父目录', async () => {
    const sendResponse = vi.fn();
    const fetchLocal = vi.fn(async (url: string) => {
      const contentByUrl = new Map([
        ['file:///Users/example/EffiRoom/AGENTS.md', '# Root\n\n## Guide\n\n正文'],
        [
          'file:///Users/example/EffiRoom/',
          [
            '<a href="AGENTS.md">AGENTS.md</a>',
            '<a href="backend/">backend/</a>',
            '<a href="docs/">docs/</a>',
            '<a href="node_modules/">node_modules/</a>',
            '<a href="../">Parent Directory</a>'
          ].join('')
        ],
        ['file:///Users/example/EffiRoom/backend/', '<a href="AGENTS.md">AGENTS.md</a>'],
        [
          'file:///Users/example/EffiRoom/docs/',
          [
            '<a href="AGENTS.md">AGENTS.md</a>',
            '<a href="effiroom-production-architecture.md">effiroom-production-architecture.md</a>'
          ].join('')
        ]
      ]);
      return new Response(contentByUrl.get(url) ?? '', {
        status: contentByUrl.has(url) ? 200 : 404,
        headers: {
          'Content-Type': url.endsWith('/') ? 'text/html' : 'text/markdown'
        }
      });
    });
    vi.stubGlobal('fetch', fetchLocal);

    const keepChannelOpen = await handleExtensionMessage(
      {
        type: 'MARKNEST_READ_FILE_URL_MARKDOWN',
        fileUrl: 'file:///Users/example/EffiRoom/AGENTS.md'
      },
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      payload: {
        type: 'file-directory',
        directoryName: 'EffiRoom',
        directoryUrl: 'file:///Users/example/EffiRoom/',
        selectedPathSegments: ['AGENTS.md'],
        selectedMarkdown: '# Root\n\n## Guide\n\n正文',
        createdAt: expect.any(Number),
        entries: [
          {
            name: 'AGENTS.md',
            fileUrl: 'file:///Users/example/EffiRoom/AGENTS.md',
            pathSegments: ['AGENTS.md']
          },
          {
            name: 'AGENTS.md',
            fileUrl: 'file:///Users/example/EffiRoom/backend/AGENTS.md',
            pathSegments: ['backend', 'AGENTS.md']
          },
          {
            name: 'AGENTS.md',
            fileUrl: 'file:///Users/example/EffiRoom/docs/AGENTS.md',
            pathSegments: ['docs', 'AGENTS.md']
          },
          {
            name: 'effiroom-production-architecture.md',
            fileUrl: 'file:///Users/example/EffiRoom/docs/effiroom-production-architecture.md',
            pathSegments: ['docs', 'effiroom-production-architecture.md']
          }
        ]
      }
    });
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/EffiRoom/AGENTS.md', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/EffiRoom/', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/EffiRoom/backend/', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/EffiRoom/docs/', expect.any(Object));
    expect(fetchLocal).not.toHaveBeenCalledWith('file:///Users/example/EffiRoom/node_modules/', expect.any(Object));
  });

  it('为在线 Markdown 直渲染读取当前文件但不索引目录', async () => {
    const sendResponse = vi.fn();
    const fetchRemote = vi.fn(async (url: string) => {
      return new Response(url === 'https://example.com/docs/guide.md' ? '# Remote\n\n正文' : '', {
        status: url === 'https://example.com/docs/guide.md' ? 200 : 404,
        headers: {
          'Content-Type': 'text/markdown'
        }
      });
    });
    vi.stubGlobal('fetch', fetchRemote);

    const keepChannelOpen = await handleExtensionMessage(
      {
        type: 'MARKNEST_READ_FILE_URL_MARKDOWN',
        fileUrl: 'https://example.com/docs/guide.md'
      },
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(keepChannelOpen).toBe(true);
    expect(fetchRemote).toHaveBeenCalledWith('https://example.com/docs/guide.md', expect.any(Object));
    expect(fetchRemote).not.toHaveBeenCalledWith('https://example.com/docs/', expect.any(Object));
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      payload: {
        type: 'file-url',
        fileName: 'guide.md',
        fileUrl: 'https://example.com/docs/guide.md',
        markdown: '# Remote\n\n正文',
        createdAt: expect.any(Number)
      }
    });
  });

  it('拒绝非 Markdown 后台读取请求', async () => {
    const sendResponse = vi.fn();

    const keepChannelOpen = await handleExtensionMessage(
      {
        type: 'MARKNEST_READ_FILE_URL_MARKDOWN',
        fileUrl: 'https://example.com/demo.txt'
      },
      sendResponse
    );

    await vi.waitFor(() => {
      expect(sendResponse).toHaveBeenCalled();
    });

    expect(keepChannelOpen).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      error: '只能读取 Markdown 文件。'
    });
  });

  it('不再处理旧的本地文件启动消息', async () => {
    const create = vi.fn();
    const set = vi.fn();
    vi.stubGlobal('chrome', {
      runtime: {
        getURL: vi.fn((path: string) => `chrome-extension://marknest/${path}`)
      },
      storage: {
        session: {
          set
        }
      },
      tabs: {
        create
      }
    });

    const handled = await handleExtensionMessage(
      {
        type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
        fileName: 'demo.md',
        fileUrl: 'file:///Users/example/demo.md',
        markdown: '# Demo'
      },
      vi.fn()
    );

    expect(handled).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });
});

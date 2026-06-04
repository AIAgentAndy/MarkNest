import { describe, expect, it, vi } from 'vitest';
import { handleExtensionMessage } from '@/../extension/background';

describe('extension background', () => {
  it('收到本地 Markdown file URL 消息后保存启动载荷并打开扩展页', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn((path: string) => `chrome-extension://marknest/${path}`);
    vi.stubGlobal('crypto', {
      randomUUID: () => 'launch-1'
    });
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
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

    const handled = await handleExtensionMessage({
      type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
      fileName: 'demo.md',
      fileUrl: 'file:///Users/example/demo.md',
      markdown: '# Demo'
    });

    expect(handled).toBe(true);
    expect(set).toHaveBeenCalledWith({
      'marknest-launch:launch-1': {
        type: 'file-url',
        fileName: 'demo.md',
        fileUrl: 'file:///Users/example/demo.md',
        markdown: '# Demo',
        createdAt: expect.any(Number)
      }
    });
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://marknest/index.html?launch=file-url&id=launch-1'
    });
  });

  it('从本地 Markdown 文件启动时递归索引父目录和子目录 Markdown', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn((path: string) => `chrome-extension://marknest/${path}`);
    const fetchLocal = vi.fn(async (url: string) => {
      const htmlByUrl = new Map([
        [
          'file:///Users/example/docs/',
          [
            '<a href="current.md">current.md</a>',
            '<a href="README.md">README.md</a>',
            '<a href="notes.txt">notes.txt</a>',
            '<a href="sub/">sub/</a>',
            '<a href=".hidden/">.hidden/</a>',
            '<a href="../">Parent Directory</a>'
          ].join('')
        ],
        [
          'file:///Users/example/docs/sub/',
          [
            '<a href="guide.markdown">guide.markdown</a>',
            '<a href="image.png">image.png</a>'
          ].join('')
        ]
      ]);
      return new Response(htmlByUrl.get(url) ?? '', {
        status: htmlByUrl.has(url) ? 200 : 404,
        headers: {
          'Content-Type': 'text/html'
        }
      });
    });

    vi.stubGlobal('crypto', {
      randomUUID: () => 'launch-indexed-1'
    });
    vi.stubGlobal('fetch', fetchLocal);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
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

    const handled = await handleExtensionMessage({
      type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
      fileName: 'current.md',
      fileUrl: 'file:///Users/example/docs/current.md',
      markdown: '# Current'
    });

    expect(handled).toBe(true);
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/sub/', expect.any(Object));
    expect(fetchLocal).not.toHaveBeenCalledWith('file:///Users/example/', expect.any(Object));
    expect(set).toHaveBeenCalledWith({
      'marknest-launch:launch-indexed-1': {
        type: 'file-directory',
        directoryName: 'docs',
        directoryUrl: 'file:///Users/example/docs/',
        selectedPathSegments: ['current.md'],
        selectedMarkdown: '# Current',
        entries: [
          {
            name: 'current.md',
            fileUrl: 'file:///Users/example/docs/current.md',
            pathSegments: ['current.md']
          },
          {
            name: 'README.md',
            fileUrl: 'file:///Users/example/docs/README.md',
            pathSegments: ['README.md']
          },
          {
            name: 'guide.markdown',
            fileUrl: 'file:///Users/example/docs/sub/guide.markdown',
            pathSegments: ['sub', 'guide.markdown']
          }
        ],
        createdAt: expect.any(Number)
      }
    });
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://marknest/index.html?launch=file-directory&id=launch-indexed-1'
    });
  });

  it('兼容 Chrome file:// 目录页的 status 0 和 addRow 动态目录项', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn((path: string) => `chrome-extension://marknest/${path}`);
    const fetchLocal = vi.fn(async (url: string) => {
      const htmlByUrl = new Map([
        [
          'file:///Users/example/docs/',
          [
            'addRow("sub","sub",1,160,"160 B",1778564037,"2026/5/12 13:33:57");',
            'addRow("委托查询报表介绍.md","%E5%A7%94%E6%89%98%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md",0,25849,"25.2 kB",1780457078,"2026/6/3 11:24:38");',
            'addRow("成交查询报表介绍.md","%E6%88%90%E4%BA%A4%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md",0,17683,"17.3 kB",1780457078,"2026/6/3 11:24:38");'
          ].join('\n')
        ],
        [
          'file:///Users/example/docs/sub/',
          [
            'addRow("子目录说明.md","%E5%AD%90%E7%9B%AE%E5%BD%95%E8%AF%B4%E6%98%8E.md",0,1024,"1.0 kB",1780457078,"2026/6/3 11:24:38");'
          ].join('\n')
        ]
      ]);
      return {
        ok: false,
        status: htmlByUrl.has(url) ? 0 : 404,
        text: async () => htmlByUrl.get(url) ?? ''
      } as Response;
    });

    vi.stubGlobal('crypto', {
      randomUUID: () => 'launch-chrome-dir-1'
    });
    vi.stubGlobal('fetch', fetchLocal);
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
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

    const handled = await handleExtensionMessage({
      type: 'MARKNEST_OPEN_LOCAL_FILE_URL',
      fileName: '委托查询报表介绍.md',
      fileUrl: 'file:///Users/example/docs/%E5%A7%94%E6%89%98%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md',
      markdown: '# 委托查询'
    });

    expect(handled).toBe(true);
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/sub/', expect.any(Object));
    expect(set).toHaveBeenCalledWith({
      'marknest-launch:launch-chrome-dir-1': {
        type: 'file-directory',
        directoryName: 'docs',
        directoryUrl: 'file:///Users/example/docs/',
        selectedPathSegments: ['委托查询报表介绍.md'],
        selectedMarkdown: '# 委托查询',
        entries: [
          {
            name: '成交查询报表介绍.md',
            fileUrl: 'file:///Users/example/docs/%E6%88%90%E4%BA%A4%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md',
            pathSegments: ['成交查询报表介绍.md']
          },
          {
            name: '委托查询报表介绍.md',
            fileUrl: 'file:///Users/example/docs/%E5%A7%94%E6%89%98%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md',
            pathSegments: ['委托查询报表介绍.md']
          },
          {
            name: '子目录说明.md',
            fileUrl: 'file:///Users/example/docs/sub/%E5%AD%90%E7%9B%AE%E5%BD%95%E8%AF%B4%E6%98%8E.md',
            pathSegments: ['sub', '子目录说明.md']
          }
        ],
        createdAt: expect.any(Number)
      }
    });
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://marknest/index.html?launch=file-directory&id=launch-chrome-dir-1'
    });
  });

  it('收到本地目录 URL 消息后保存目录启动载荷并打开扩展页', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const create = vi.fn().mockResolvedValue(undefined);
    const getURL = vi.fn((path: string) => `chrome-extension://marknest/${path}`);
    vi.stubGlobal('crypto', {
      randomUUID: () => 'launch-dir-1'
    });
    vi.stubGlobal('chrome', {
      runtime: {
        getURL
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

    const handled = await handleExtensionMessage({
      type: 'MARKNEST_OPEN_LOCAL_DIRECTORY_URL',
      directoryName: 'docs',
      directoryUrl: 'file:///Users/example/docs/',
      entries: [
        {
          name: 'README.md',
          fileUrl: 'file:///Users/example/docs/README.md'
        }
      ]
    });

    expect(handled).toBe(true);
    expect(set).toHaveBeenCalledWith({
      'marknest-launch:launch-dir-1': {
        type: 'file-directory',
        directoryName: 'docs',
        directoryUrl: 'file:///Users/example/docs/',
        entries: [
          {
            name: 'README.md',
            fileUrl: 'file:///Users/example/docs/README.md'
          }
        ],
        createdAt: expect.any(Number)
      }
    });
    expect(create).toHaveBeenCalledWith({
      url: 'chrome-extension://marknest/index.html?launch=file-directory&id=launch-dir-1'
    });
  });
});

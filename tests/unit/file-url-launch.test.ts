import { describe, expect, it, vi } from 'vitest';
import { createFileUrlDirectoryLaunchPayload } from '@/features/workspace/lib/file-url-launch';

describe('file-url-launch', () => {
  it('从本地 Markdown 文件启动时递归索引父目录和子目录 Markdown', async () => {
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
    vi.stubGlobal('fetch', fetchLocal);

    const payload = await createFileUrlDirectoryLaunchPayload({
      type: 'file-url',
      fileName: 'current.md',
      fileUrl: 'file:///Users/example/docs/current.md',
      markdown: '# Current',
      createdAt: 1777651200000
    });

    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/', expect.any(Object));
    expect(fetchLocal).toHaveBeenCalledWith('file:///Users/example/docs/sub/', expect.any(Object));
    expect(fetchLocal).not.toHaveBeenCalledWith('file:///Users/example/', expect.any(Object));
    expect(payload).toMatchObject({
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
      ]
    });
  });

  it('兼容 Chrome file:// 目录页的 status 0 和 addRow 动态目录项', async () => {
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
          'addRow("子目录说明.md","%E5%AD%90%E7%9B%AE%E5%BD%95%E8%AF%B4%E6%98%8E.md",0,1024,"1.0 kB",1780457078,"2026/6/3 11:24:38");'
        ]
      ]);
      return {
        ok: false,
        status: htmlByUrl.has(url) ? 0 : 404,
        text: async () => htmlByUrl.get(url) ?? ''
      } as Response;
    });
    vi.stubGlobal('fetch', fetchLocal);

    const payload = await createFileUrlDirectoryLaunchPayload({
      type: 'file-url',
      fileName: '委托查询报表介绍.md',
      fileUrl: 'file:///Users/example/docs/%E5%A7%94%E6%89%98%E6%9F%A5%E8%AF%A2%E6%8A%A5%E8%A1%A8%E4%BB%8B%E7%BB%8D.md',
      markdown: '# 委托查询',
      createdAt: 1777651200000
    });

    expect(payload?.entries).toEqual([
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
    ]);
  });
});

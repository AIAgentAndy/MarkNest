import { describe, expect, it, vi } from 'vitest';
import { consumeExtensionLaunchPayload } from '@/features/workspace/lib/extension-launch';

describe('extension-launch', () => {
  it('读取并校验带当前文件和嵌套路径的本地目录启动载荷', async () => {
    const get = vi.fn().mockResolvedValue({
      'marknest-launch:launch-dir-1': {
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
            name: 'guide.markdown',
            fileUrl: 'file:///Users/example/docs/sub/guide.markdown',
            pathSegments: ['sub', 'guide.markdown']
          }
        ],
        createdAt: 1777651200000
      }
    });
    const remove = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('chrome', {
      storage: {
        session: {
          get,
          remove
        }
      }
    });

    await expect(consumeExtensionLaunchPayload('launch-dir-1')).resolves.toEqual({
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
          name: 'guide.markdown',
          fileUrl: 'file:///Users/example/docs/sub/guide.markdown',
          pathSegments: ['sub', 'guide.markdown']
        }
      ],
      createdAt: 1777651200000
    });
    expect(get).toHaveBeenCalledWith('marknest-launch:launch-dir-1');
    expect(remove).toHaveBeenCalledWith('marknest-launch:launch-dir-1');
  });
});

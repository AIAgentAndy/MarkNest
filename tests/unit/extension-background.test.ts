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
});

import { describe, expect, it, vi } from 'vitest';
import {
  readFileUrlDirectoryPayloadFromBackground,
  readFileUrlMarkdownPayloadFromBackground,
  readFileUrlTextFromBackground
} from '@/features/workspace/lib/file-url-background-client';

describe('file-url-background-client', () => {
  it('向后台请求 file:// Markdown 启动载荷', async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({
        ok: true,
        payload: {
          type: 'file-directory',
          directoryName: 'docs',
          directoryUrl: 'file:///Users/example/docs/',
          entries: [
            {
              name: 'current.md',
              fileUrl: 'file:///Users/example/docs/current.md',
              pathSegments: ['current.md']
            }
          ],
          selectedPathSegments: ['current.md'],
          selectedMarkdown: '# Current',
          createdAt: 1777651200000
        }
      });
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });

    const payload = await readFileUrlMarkdownPayloadFromBackground('file:///Users/example/docs/current.md');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'MARKNEST_READ_FILE_URL_MARKDOWN',
        fileUrl: 'file:///Users/example/docs/current.md'
      },
      expect.any(Function)
    );
    expect(payload).toMatchObject({
      type: 'file-directory',
      directoryName: 'docs',
      selectedMarkdown: '# Current'
    });
  });

  it('向后台请求 file:// 目录启动载荷', async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({
        ok: true,
        payload: {
          type: 'file-directory',
          directoryName: 'docs',
          directoryUrl: 'file:///Users/example/docs/',
          entries: [],
          createdAt: 1777651200000
        }
      });
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });

    const payload = await readFileUrlDirectoryPayloadFromBackground('file:///Users/example/docs/');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'MARKNEST_READ_FILE_URL_DIRECTORY',
        directoryUrl: 'file:///Users/example/docs/'
      },
      expect.any(Function)
    );
    expect(payload).toMatchObject({
      type: 'file-directory',
      directoryName: 'docs'
    });
  });

  it('向后台读取指定 file:// Markdown 正文', async () => {
    const sendMessage = vi.fn((message: unknown, callback: (response: unknown) => void) => {
      callback({
        ok: true,
        markdown: '# Guide'
      });
    });
    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage
      }
    });

    const markdown = await readFileUrlTextFromBackground('file:///Users/example/docs/guide.md');

    expect(sendMessage).toHaveBeenCalledWith(
      {
        type: 'MARKNEST_READ_FILE_URL_TEXT',
        fileUrl: 'file:///Users/example/docs/guide.md'
      },
      expect.any(Function)
    );
    expect(markdown).toBe('# Guide');
  });

  it('后台不可用时返回 null，让调用方走页面内兜底读取', async () => {
    vi.unstubAllGlobals();

    await expect(readFileUrlTextFromBackground('file:///Users/example/docs/guide.md')).resolves.toBeNull();
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  collectMarkdownFilesFromDirectory,
  scanDirectoryHandle
} from '@/features/file-tree/lib/file-system-reader';

describe('file-system-reader', () => {
  it('把 FileSystemDirectoryHandle 转为只包含 Markdown 的目录输入结构', async () => {
    const markdownFile = {
      kind: 'file',
      name: 'README.md',
      getFile: vi.fn().mockResolvedValue({ size: 12, lastModified: 34 })
    };
    const imageFile = {
      kind: 'file',
      name: 'logo.png',
      getFile: vi.fn().mockResolvedValue({ size: 56, lastModified: 78 })
    };
    const rootHandle = {
      kind: 'directory',
      name: 'root',
      async *values() {
        yield markdownFile;
        yield imageFile;
      }
    } as unknown as FileSystemDirectoryHandle;

    await expect(scanDirectoryHandle(rootHandle)).resolves.toEqual({
      kind: 'directory',
      name: 'root',
      children: [{ kind: 'file', name: 'README.md', size: 12, lastModified: 34 }]
    });
    expect(imageFile.getFile).not.toHaveBeenCalled();
  });

  it('扫描目录时跳过被忽略目录和非 Markdown 文件的元数据读取', async () => {
    const markdownFile = {
      kind: 'file',
      name: 'README.md',
      getFile: vi.fn().mockResolvedValue({ size: 12, lastModified: 34 })
    };
    const imageFile = {
      kind: 'file',
      name: 'logo.png',
      getFile: vi.fn()
    };
    const ignoredFile = {
      kind: 'file',
      name: 'ignored.md',
      getFile: vi.fn()
    };
    const ignoredDirectory = {
      kind: 'directory',
      name: 'node_modules',
      async *values() {
        yield ignoredFile;
      }
    };
    const rootHandle = {
      kind: 'directory',
      name: 'root',
      async *values() {
        yield markdownFile;
        yield imageFile;
        yield ignoredDirectory;
      }
    } as unknown as FileSystemDirectoryHandle;

    await expect(scanDirectoryHandle(rootHandle)).resolves.toEqual({
      kind: 'directory',
      name: 'root',
      children: [{ kind: 'file', name: 'README.md', size: 12, lastModified: 34 }]
    });
    expect(imageFile.getFile).not.toHaveBeenCalled();
    expect(ignoredFile.getFile).not.toHaveBeenCalled();
  });

  it('一次递归同时产出 Markdown 目录输入和文件句柄索引', async () => {
    const readmeFile = {
      kind: 'file',
      name: 'README.md',
      getFile: vi.fn().mockResolvedValue({ size: 12, lastModified: 34 })
    };
    const guideFile = {
      kind: 'file',
      name: 'guide.md',
      getFile: vi.fn().mockResolvedValue({ size: 56, lastModified: 78 })
    };
    const docsDirectory = {
      kind: 'directory',
      name: 'docs',
      async *values() {
        yield guideFile;
      }
    };
    const rootHandle = {
      kind: 'directory',
      name: 'root',
      async *values() {
        yield readmeFile;
        yield docsDirectory;
      }
    } as unknown as FileSystemDirectoryHandle;

    const result = await collectMarkdownFilesFromDirectory(rootHandle);

    expect(result.directoryInput).toEqual({
      kind: 'directory',
      name: 'root',
      children: [
        { kind: 'file', name: 'README.md', size: 12, lastModified: 34 },
        {
          kind: 'directory',
          name: 'docs',
          children: [{ kind: 'file', name: 'guide.md', size: 56, lastModified: 78 }]
        }
      ]
    });
    expect(Array.from(result.fileHandles.keys())).toEqual(['README.md', 'docs/guide.md']);
    expect(result.fileHandles.get('README.md')).toMatchObject({
      handle: readmeFile,
      parentHandle: rootHandle
    });
    expect(result.fileHandles.get('docs/guide.md')).toMatchObject({
      handle: guideFile,
      parentHandle: docsDirectory
    });
  });
});

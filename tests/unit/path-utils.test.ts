import { describe, expect, it } from 'vitest';
import {
  getExtension,
  isMarkdownFileName,
  normalizeRelativePath,
  pathSegmentsToId,
  resolveRelativeSegments
} from '@/shared/path/path-utils';

describe('path-utils', () => {
  it('识别常见 Markdown 文件扩展名并忽略大小写', () => {
    expect(isMarkdownFileName('README.md')).toBe(true);
    expect(isMarkdownFileName('guide.MARKDOWN')).toBe(true);
    expect(isMarkdownFileName('note.mdown')).toBe(true);
    expect(isMarkdownFileName('draft.mkd')).toBe(true);
    expect(isMarkdownFileName('image.png')).toBe(false);
  });

  it('提取扩展名时能处理无扩展名和多点文件名', () => {
    expect(getExtension('archive.tar.md')).toBe('.md');
    expect(getExtension('README')).toBe('');
    expect(getExtension('.gitignore')).toBe('');
  });

  it('规范化相对路径并移除无意义片段', () => {
    expect(normalizeRelativePath('./docs/../assets/image.png')).toEqual([
      'assets',
      'image.png'
    ]);
    expect(normalizeRelativePath('docs//intro.md')).toEqual(['docs', 'intro.md']);
  });

  it('解析相对路径时禁止越过授权根目录', () => {
    expect(resolveRelativeSegments(['docs', 'chapter'], '../assets/a.png')).toEqual([
      'docs',
      'assets',
      'a.png'
    ]);
    expect(resolveRelativeSegments([], '../secret.md')).toBeNull();
  });

  it('基于工作区和路径片段生成稳定节点 id', () => {
    expect(pathSegmentsToId('workspace-a', ['docs', 'README.md'])).toBe(
      'workspace-a:docs/README.md'
    );
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildDocumentOutlineTree,
  extractDocumentOutline
} from '@/features/markdown-renderer/lib/document-outline';

describe('extractDocumentOutline', () => {
  it('提取中文标题并保留层级', () => {
    const outline = extractDocumentOutline([
      '# Code And Design 项目架构设计文档',
      '',
      '## 1. 项目定位',
      '',
      '### 1.1 使用场景',
      '',
      '正文'
    ].join('\n'));

    expect(outline).toEqual([
      {
        id: 'code-and-design-项目架构设计文档',
        depth: 1,
        text: 'Code And Design 项目架构设计文档'
      },
      { id: '1-项目定位', depth: 2, text: '1. 项目定位' },
      { id: '11-使用场景', depth: 3, text: '1.1 使用场景' }
    ]);
  });

  it('重复标题生成稳定且唯一的 id', () => {
    const outline = extractDocumentOutline([
      '## 核心运行流程',
      '',
      '## 核心运行流程',
      '',
      '### 核心运行流程'
    ].join('\n'));

    expect(outline.map((item) => item.id)).toEqual([
      '核心运行流程',
      '核心运行流程-1',
      '核心运行流程-2'
    ]);
  });

  it('把扁平大纲转换成可折叠树', () => {
    const tree = buildDocumentOutlineTree([
      { id: 'root', depth: 1, text: '总览' },
      { id: 'a', depth: 2, text: 'A' },
      { id: 'a-1', depth: 3, text: 'A.1' },
      { id: 'b', depth: 2, text: 'B' }
    ]);

    expect(tree).toEqual([
      {
        id: 'root',
        depth: 1,
        text: '总览',
        children: [
          {
            id: 'a',
            depth: 2,
            text: 'A',
            children: [{ id: 'a-1', depth: 3, text: 'A.1', children: [] }]
          },
          { id: 'b', depth: 2, text: 'B', children: [] }
        ]
      }
    ]);
  });
});

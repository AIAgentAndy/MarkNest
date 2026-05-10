import type { DirectoryEntryInput } from '@/features/file-tree/types';

export const sampleDirectory: DirectoryEntryInput = {
  kind: 'directory',
  name: '示例工作区',
  children: [
    {
      kind: 'file',
      name: 'README.md',
      size: 240,
      lastModified: 1
    },
    {
      kind: 'directory',
      name: 'docs',
      children: [
        {
          kind: 'file',
          name: 'architecture.md',
          size: 320,
          lastModified: 2
        }
      ]
    }
  ]
};

export const sampleMarkdownByPath = new Map<string, string>([
  [
    'README.md',
    [
      '# MarkNest 示例',
      '',
      '这是一个本地优先的 Markdown 文档工作区。',
      '',
      '- [x] 支持目录树',
      '- [x] 支持 GFM 表格',
      '- [x] 支持 Mermaid 图表',
      '',
      '## 核心流程',
      '',
      '| 能力 | 状态 |',
      '| --- | --- |',
      '| 本地目录 | 已接入架构 |',
      '| Markdown 渲染 | 已接入 |',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[打开目录] --> B[扫描 Markdown]',
      '  B --> C[渲染阅读页]',
      '```'
    ].join('\n')
  ],
  [
    'docs/architecture.md',
    [
      '# 架构说明',
      '',
      '方案 A 使用 Manifest V3 扩展承载 Next.js 静态导出的页面。',
      '',
      '```ts',
      'type Workspace = {',
      '  id: string;',
      '  name: string;',
      '};',
      '```'
    ].join('\n')
  ]
]);

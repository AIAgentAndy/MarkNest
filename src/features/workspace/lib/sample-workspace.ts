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
      '- [x] 支持代码高亮',
      '- [x] 支持数学公式',
      '- [x] 支持 Mermaid 图表',
      '',
      '## 能力速览',
      '',
      '| 能力 | 示例 | 状态 |',
      '| --- | --- | --- |',
      '| GFM 表格 | 当前能力清单 | 已支持 |',
      '| 代码高亮 | TypeScript 示例 | 已支持 |',
      '| 数学公式 | `E = mc^2` | 已支持 |',
      '| Mermaid | 流程图 / 时序图 | 已支持 |',
      '',
      '## 代码示例',
      '',
      '```ts',
      'type Workspace = {',
      '  id: string;',
      '  name: string;',
      '  markdownCount: number;',
      '};',
      '',
      'function createWorkspace(name: string): Workspace {',
      '  return {',
      '    id: `workspace:${name}`,',
      '    name,',
      '    markdownCount: 0',
      '  };',
      '}',
      '```',
      '',
      '## 数学公式',
      '',
      '行内公式：$E = mc^2$。',
      '',
      '$$',
      '\\int_0^1 x^2\\,dx = \\frac{1}{3}',
      '$$',
      '',
      '## Mermaid 流程图',
      '',
      '```mermaid',
      'flowchart LR',
      '  A[Chrome 打开 Markdown] --> B[MarkNest 识别地址]',
      '  B --> C[渲染正文]',
      '  B --> D[构建目录和大纲]',
      '  C --> E[沉浸阅读]',
      '  D --> E',
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
      '```',
      '',
      '## 时序图',
      '',
      '```mermaid',
      'sequenceDiagram',
      '  participant User as 用户',
      '  participant Chrome as Chrome',
      '  participant MarkNest as MarkNest',
      '  User->>Chrome: 打开 .md 文件',
      '  Chrome->>MarkNest: 注入渲染入口',
      '  MarkNest->>MarkNest: 解析 Markdown / Mermaid / 公式',
      '  MarkNest-->>User: 展示阅读页',
      '```'
    ].join('\n')
  ]
]);

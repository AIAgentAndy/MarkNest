import { describe, expect, it } from 'vitest';
import { renderMarkdownToHtml } from '@/features/markdown-renderer/lib/render-markdown';

describe('renderMarkdownToHtml', () => {
  it('渲染 GFM 表格、任务列表和标题锚点', async () => {
    const html = await renderMarkdownToHtml({
      markdown: [
        '# 项目说明',
        '',
        '- [x] 已完成',
        '',
        '| 名称 | 状态 |',
        '| --- | --- |',
        '| 文档 | OK |'
      ].join('\n')
    });

    expect(html).toContain('id="项目说明"');
    expect(html).toContain('<table>');
    expect(html).toContain('type="checkbox"');
    expect(html).toContain('checked');
  });

  it('默认过滤危险 HTML', async () => {
    const html = await renderMarkdownToHtml({
      markdown: '<script>alert(1)</script><p onclick="alert(2)">安全文本</p>'
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('onclick');
    expect(html).toContain('安全文本');
  });

  it('把 Mermaid 代码块转成安全占位节点', async () => {
    const html = await renderMarkdownToHtml({
      markdown: ['```mermaid', 'flowchart LR', 'A-->B', '```'].join('\n')
    });

    expect(html).toContain('data-mermaid-source=');
    expect(html).toContain('flowchart LR');
  });

  it('重写本地相对图片为调用方提供的 URL', async () => {
    const html = await renderMarkdownToHtml({
      markdown: '![架构图](./assets/diagram.png)',
      resolveAssetUrl: async (src) => `blob://local/${src}`
    });

    expect(html).toContain('src="blob://local/./assets/diagram.png"');
    expect(html).toContain('alt="架构图"');
  });
});

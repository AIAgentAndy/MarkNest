import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import 'fake-indexeddb/auto';

// Markdown 渲染链路包含 unified/rehype 和 Mermaid 增强，全量并发测试时默认 1 秒等待容易误判。
configure({
  asyncUtilTimeout: 5_000
});

if (typeof window.PointerEvent === 'undefined') {
  window.PointerEvent = window.MouseEvent as typeof PointerEvent;
}

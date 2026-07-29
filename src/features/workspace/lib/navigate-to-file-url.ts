// 通过整页导航跳转到目标文件 URL。
// file:// 文档的 origin 为 null，history.pushState/replaceState 会抛 SecurityError，
// 无法在不重载的情况下更新地址栏；因此点击目录树中的本地文件时采用整页导航，
// 确保浏览器地址栏更新为该文件的完整路径，方便复制。
export function navigateToFileUrl(fileUrl: string): void {
  window.location.assign(fileUrl);
}

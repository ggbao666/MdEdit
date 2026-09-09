/**
 * 桌面版能力：文件保存走系统对话框，菜单动作由主进程推过来。
 * Tiptora 只以桌面应用形态运行，没有 bridge 说明是被当成网页打开了。
 */

export const hasBridge = (): boolean => typeof window !== 'undefined' && !!window.tiptora

/** 保存文本到用户选定的位置；用户取消时返回 false */
export async function saveTextNative(suggestedName: string, content: string): Promise<boolean> {
  const api = window.tiptora
  if (!api) return false
  try {
    return await api.saveText(suggestedName, content)
  } catch {
    return false
  }
}

/** 保存二进制（ZIP 等）；用户取消时返回 false */
export async function saveBlobNative(suggestedName: string, blob: Blob): Promise<boolean> {
  const api = window.tiptora
  if (!api) return false
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    return await api.saveBytes(suggestedName, bytes)
  } catch {
    return false
  }
}

/** 订阅原生菜单动作，返回取消订阅函数 */
export function onMenuAction(action: string, handler: () => void): () => void {
  const api = window.tiptora
  if (!api) return () => {}
  return api.onMenu(action, handler)
}

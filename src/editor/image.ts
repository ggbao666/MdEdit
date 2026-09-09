import { Node, mergeAttributes } from '@tiptap/core'
import { assetUrl } from '../lib/workspace'

export interface TiptoraImageOptions {
  HTMLAttributes: Record<string, unknown>
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tiptoraImage: {
      /** 插入一张图片；rel 是写进 Markdown 的相对引用，src 由渲染时自动推导 */
      insertImage: (attrs: { rel: string; alt?: string; title?: string }) => ReturnType
    }
  }
}

/**
 * 图片节点。
 *
 * 关键设计：节点只存「相对引用」`rel`（如 `笔记.assets/图.png`），
 * 真正用于显示的 `src` 在渲染时才由 assetUrl() 推导出来（tiptora:// 协议 / data: URI）。
 * 这样导出的 Markdown 里永远是可移植的相对路径，而不是本机协议地址。
 */
export const TiptoraImage = Node.create<TiptoraImageOptions>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,

  addOptions() {
    return { HTMLAttributes: {} }
  },

  addAttributes() {
    return {
      rel: {
        default: null,
        keepOnSplit: false,
        parseHTML: (element) => element.getAttribute('data-rel') ?? element.getAttribute('src'),
        // rel 不直接输出成属性，统一在 renderHTML 里输出为 data-rel
        renderHTML: () => ({}),
      },
      alt: {
        default: null,
        parseHTML: (element) => element.getAttribute('alt'),
        renderHTML: (attributes) => (attributes.alt ? { alt: attributes.alt } : {}),
      },
      title: {
        default: null,
        parseHTML: (element) => element.getAttribute('title'),
        renderHTML: (attributes) => (attributes.title ? { title: attributes.title } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'img[src]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const rel = String(node.attrs.rel ?? '')
    return [
      'img',
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes, {
        src: assetUrl(rel),
        'data-rel': rel,
      }),
    ]
  },

  addCommands() {
    return {
      insertImage:
        (attrs) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs }),
    }
  },
})

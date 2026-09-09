import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { ReactRenderer } from '@tiptap/react'
import { exitSuggestion, Suggestion } from '@tiptap/suggestion'
import {
  Code,
  Heading1,
  Heading2,
  Heading3,
  Highlighter,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Table as TableIcon,
  Type,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import SlashMenu, { type SlashMenuHandle } from '../components/SlashMenu'

export interface SlashItem {
  id: string
  title: string
  /** 右侧灰色说明 */
  hint: string
  group: string
  icon: LucideIcon
  /** 额外的搜索关键词（中文 / 英文 / Markdown 记号） */
  aliases: string[]
  run: (editor: Editor, range: Range) => void
}

const G_TEXT = '文本'
const G_LIST = '列表'
const G_BLOCK = '插入'

export const SLASH_ITEMS: SlashItem[] = [
  {
    id: 'paragraph',
    title: '正文',
    hint: '普通段落',
    group: G_TEXT,
    icon: Type,
    aliases: ['正文', '段落', '文本', 'p', 'text', 'paragraph'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setParagraph().run(),
  },
  {
    id: 'heading1',
    title: '一级标题',
    hint: '# 标题',
    group: G_TEXT,
    icon: Heading1,
    aliases: ['标题', '一级标题', '大标题', 'h1', 'heading', 'title'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run(),
  },
  {
    id: 'heading2',
    title: '二级标题',
    hint: '## 标题',
    group: G_TEXT,
    icon: Heading2,
    aliases: ['二级标题', '中标题', 'h2', 'heading2'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run(),
  },
  {
    id: 'heading3',
    title: '三级标题',
    hint: '### 标题',
    group: G_TEXT,
    icon: Heading3,
    aliases: ['三级标题', '小标题', 'h3', 'heading3'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run(),
  },
  {
    id: 'highlight',
    title: '高亮',
    hint: '== 标记重点',
    group: G_TEXT,
    icon: Highlighter,
    aliases: ['高亮', '标记', '荧光', 'highlight', 'mark'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setMark('highlight').run(),
  },
  {
    id: 'inline-code',
    title: '行内代码',
    hint: '`代码`',
    group: G_TEXT,
    icon: Code,
    aliases: ['行内代码', '内联代码', 'inline', 'inline code', 'codeinline'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setMark('code').run(),
  },

  {
    id: 'bulletList',
    title: '无序列表',
    hint: '- 项目',
    group: G_LIST,
    icon: List,
    aliases: ['无序列表', '列表', '项目符号', 'ul', 'bullet', 'list'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    title: '有序列表',
    hint: '1. 项目',
    group: G_LIST,
    icon: ListOrdered,
    aliases: ['有序列表', '编号', '排序列表', 'ol', 'number', 'ordered'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: 'taskList',
    title: '待办清单',
    hint: '- [ ] 任务',
    group: G_LIST,
    icon: ListChecks,
    aliases: ['待办', '任务', '清单', '勾选', 'todo', 'task', 'check', 'checkbox'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleTaskList().run(),
  },

  {
    id: 'blockquote',
    title: '引用',
    hint: '> 引述',
    group: G_BLOCK,
    icon: Quote,
    aliases: ['引用', '引述', 'quote', 'blockquote'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    title: '代码块',
    hint: '``` 带语法高亮',
    group: G_BLOCK,
    icon: SquareCode,
    aliases: ['代码块', '代码', 'codeblock', 'code', 'pre'],
    run: (ed, range) =>
      ed.chain().focus().deleteRange(range).toggleCodeBlock({ language: 'javascript' }).run(),
  },
  {
    id: 'table',
    title: '表格',
    hint: '3 × 3',
    group: G_BLOCK,
    icon: TableIcon,
    aliases: ['表格', 'table', 'grid'],
    run: (ed, range) =>
      ed.chain().focus().deleteRange(range).insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
  {
    id: 'divider',
    title: '分割线',
    hint: '---',
    group: G_BLOCK,
    icon: Minus,
    aliases: ['分割线', '分隔线', '横线', 'hr', 'divider', 'separator'],
    run: (ed, range) => ed.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]

/** 匹配质量打分：标题完全命中 > 标题前缀 > 标题包含 > 说明 > 别名 */
function scoreItem(item: SlashItem, q: string): number {
  const title = item.title.toLowerCase()
  const hint = item.hint.toLowerCase()

  if (title === q) return 100
  if (title.startsWith(q)) return 80
  if (title.includes(q)) return 60
  if (hint.includes(q)) return 40
  if (item.aliases.some((a) => a.toLowerCase() === q)) return 30
  if (item.aliases.some((a) => a.toLowerCase().startsWith(q))) return 20
  return 10
}

/**
 * 关键词过滤：标题、说明、别名任意命中即可。
 * 按匹配质量排序（最高分优先），同分保持定义顺序。
 */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return SLASH_ITEMS

  return SLASH_ITEMS.map((item, i) => {
    const haystack = [item.title.toLowerCase(), item.hint.toLowerCase(), ...item.aliases.map((a) => a.toLowerCase())]
    return { item, i, hit: haystack.some((s) => s.includes(q)) }
  })
    .filter((r) => r.hit)
    .sort((a, b) => scoreItem(b.item, q) - scoreItem(a.item, q) || a.i - b.i)
    .map((r) => r.item)
}

export const slashPluginKey = new PluginKey('slashCommand')

interface MenuProps {
  items: SlashItem[]
  command: (item: SlashItem) => void
  onClose: () => void
}

/**
 * 斜杠命令：在空行输入 `/` 唤出命令面板。
 * 借助 Suggestion 内置的 Floating UI 托管定位（props.mount），无需手写坐标计算。
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    let renderer: ReactRenderer<SlashMenuHandle, MenuProps> | null = null
    let unmount: (() => void) | null = null

    const close = (view: EditorView) => exitSuggestion(view, slashPluginKey)

    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        pluginKey: slashPluginKey,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        // 默认值 [' ']：行首（前缀为空）或空格后触发，输入 and/or、path/to 时不会误唤出
        decorationTag: 'span',
        decorationClass: 'slash-trigger',
        placement: 'bottom-start',
        offset: { mainAxis: 6, crossAxis: 0 },
        // 浮层挂在 body 上，用 fixed 比默认的 absolute 更稳（不受滚动容器影响）
        floatingUi: { strategy: 'fixed' },

        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          // 代码块内不触发
          if ($from.parent.type.name === 'codeBlock') return false
          // 行内代码内不触发
          const codeMark = state.schema.marks.code
          if (codeMark && codeMark.isInSet($from.marks())) return false
          return true
        },

        items: ({ query }) => filterSlashItems(query),

        command: ({ editor, range, props }) => {
          props.run(editor, range)
        },

        render: () => ({
          onStart: (props) => {
            renderer = new ReactRenderer<SlashMenuHandle, MenuProps>(SlashMenu, {
              editor: props.editor,
              props: {
                items: props.items,
                command: props.command,
                onClose: () => close(props.editor.view),
              },
            })
            const el = renderer.element
            // 首次定位完成前先藏起来，避免在 (0,0) 闪一下
            el.style.visibility = 'hidden'
            // 自行接管坐标：默认的 mount() 会写死 inline width: max-content，覆盖 CSS 宽度
            unmount = props.mount(el, {
              onPosition: ({ x, y, strategy }) => {
                Object.assign(el.style, {
                  position: strategy,
                  left: `${x}px`,
                  top: `${y}px`,
                  visibility: '',
                })
              },
            })
          },

          onUpdate: (props) => {
            renderer?.updateProps({
              items: props.items,
              command: props.command,
              onClose: () => close(props.editor.view),
            })
          },

          onKeyDown: (props) => {
            if (props.event.key === 'Escape') {
              close(props.view)
              return true
            }
            if (!renderer?.ref) return false
            return renderer.ref.onKeyDown({ event: props.event })
          },

          onExit: () => {
            unmount?.()
            unmount = null
            renderer?.destroy()
            renderer = null
          },
        }),
      }),
    ]
  },
})

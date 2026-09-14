import Highlight from '@tiptap/extension-highlight'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Table } from '@tiptap/extension-table'
import { TableCell } from '@tiptap/extension-table-cell'
import { TableHeader } from '@tiptap/extension-table-header'
import { TableRow } from '@tiptap/extension-table-row'
import type { Extensions } from '@tiptap/core'
import { CharacterCount, Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { lowlight } from './lowlight'
import { TiptoraCodeBlock } from './codeBlock'
import { TiptoraImage } from './image'
import { SlashCommand } from './slashCommand'

/** 中文按字计、西文按空格计，避免「一段中文只算 1 个词」 */
const CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/g

export function countWords(text: string): number {
  const cjk = text.match(CJK_RE)?.length ?? 0
  const rest = text.replace(CJK_RE, ' ').trim()
  const latin = rest ? rest.split(/\s+/).filter(Boolean).length : 0
  return cjk + latin
}

export function countChars(text: string): number {
  return Array.from(text).length
}

export function createExtensions(): Extensions {
  return [
    StarterKit.configure({
      // 使用带语法高亮的代码块替代内置版本
      codeBlock: false,
      heading: { levels: [1, 2, 3, 4] },
      link: {
        openOnClick: false,
        autolink: true,
        HTMLAttributes: { target: '_blank', rel: 'noopener noreferrer nofollow' },
      },
    }),

    TiptoraCodeBlock.configure({ lowlight }),

    Highlight.configure({ multicolor: false }),

    TaskList,
    TaskItem.configure({ nested: true }),

    Table.configure({
      resizable: true,
      lastColumnResizable: false,
      allowTableNodeSelection: false,
    }),
    TableRow,
    TableHeader,
    TableCell,

    // 图片：只存相对引用，导出时就是可移植的 ![](相对路径)
    TiptoraImage,

    Placeholder.configure({
      showOnlyCurrent: true,
      includeChildren: false,
      placeholder: ({ node, pos }) => {
        if (node.type.name === 'heading') return '标题'
        if (node.type.name === 'paragraph') {
          return pos === 0 ? '开始书写…' : '继续输入…'
        }
        return ''
      },
    }),

    CharacterCount.configure({
      textCounter: countChars,
      wordCounter: countWords,
    }),

    // 输入 `/` 唤出命令面板
    SlashCommand,
  ]
}

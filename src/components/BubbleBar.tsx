import { useCallback, useMemo } from 'react'
import type { Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Highlighter,
  Italic,
  Link2,
  Quote,
  Strikethrough,
  Underline,
} from 'lucide-react'

interface Props {
  editor: Editor
  scrollEl: HTMLElement | null
}

export default function BubbleBar({ editor, scrollEl }: Props) {
  const icon = { size: 15, strokeWidth: 2 } as const

  /* 必须稳定引用：BubbleMenu 内部 effect 把这两个 prop 放进 deps，
     一旦引用变化就会 dispatch 一个 updateOptions 事务，
     配合 shouldRerenderOnTransaction 会形成「事务 → 重渲染 → 新引用 → 事务」死循环。 */
  const shouldShow = useCallback(
    ({ editor: ed, from, to }: { editor: Editor; from: number; to: number }) =>
      ed.isEditable && ed.isFocused && from !== to && !ed.isActive('codeBlock') && !ed.isActive('link'),
    [],
  )

  const options = useMemo(
    () => ({
      placement: 'top' as const,
      offset: 10,
      flip: true,
      shift: true,
      scrollTarget: (scrollEl ?? window) as HTMLElement | Window,
    }),
    [scrollEl],
  )

  const toggleLink = () => {
    const previous = (editor.getAttributes('link').href as string | undefined) ?? ''
    const input = window.prompt('链接地址（留空则移除）', previous || 'https://')
    if (input === null) return
    if (input.trim() === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const url = input.trim()
    const safe = /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`
    editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run()
  }

  return (
    <BubbleMenu
      editor={editor}
      updateDelay={80}
      shouldShow={shouldShow}
      options={options}
    >
      <div className="bubble">
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('heading', { level: 1 }) ? ' is-active' : '')}
          title="标题 1"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          <Heading1 {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('heading', { level: 2 }) ? ' is-active' : '')}
          title="标题 2"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          <Heading2 {...icon} />
        </button>

        <div className="divider-v" />

        <button
          type="button"
          className={'tool-btn' + (editor.isActive('bold') ? ' is-active' : '')}
          title="加粗"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <Bold {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('italic') ? ' is-active' : '')}
          title="斜体"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <Italic {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('underline') ? ' is-active' : '')}
          title="下划线"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          <Underline {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('strike') ? ' is-active' : '')}
          title="删除线"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          <Strikethrough {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('highlight') ? ' is-active' : '')}
          title="高亮"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleHighlight().run()}
        >
          <Highlighter {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('code') ? ' is-active' : '')}
          title="行内代码"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleCode().run()}
        >
          <Code {...icon} />
        </button>
        <button
          type="button"
          className={'tool-btn' + (editor.isActive('link') ? ' is-active' : '')}
          title="链接"
          onMouseDown={(e) => e.preventDefault()}
          onClick={toggleLink}
        >
          <Link2 {...icon} />
        </button>

        <div className="divider-v" />

        <button
          type="button"
          className={'tool-btn' + (editor.isActive('blockquote') ? ' is-active' : '')}
          title="引用"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
        >
          <Quote {...icon} />
        </button>
      </div>
    </BubbleMenu>
  )
}

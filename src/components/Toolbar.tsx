import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  Bold,
  Check,
  ChevronDown,
  Code,
  CodeXml,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Highlighter,
  ImagePlus,
  Italic,
  Link2,
  Link2Off,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Pilcrow,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Underline,
  Undo2,
} from 'lucide-react'

interface ToolProps {
  editor: Editor
}

interface ToolbarProps extends ToolProps {
  onInsertImage: () => void
}

function ToolButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className={'tool-btn' + (active ? ' is-active' : '')}
      title={title}
      aria-label={title}
      aria-pressed={active ?? false}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function Group({ children }: { children: ReactNode }) {
  return <div className="tool-group">{children}</div>
}

function Sep() {
  return <div className="divider-v" />
}

const BLOCK_ITEMS = [
  { key: 'p', label: '正文', icon: Pilcrow, hint: '' },
  { key: 'h1', label: '标题 1', icon: Heading1, hint: '# ' },
  { key: 'h2', label: '标题 2', icon: Heading2, hint: '## ' },
  { key: 'h3', label: '标题 3', icon: Heading3, hint: '### ' },
  { key: 'h4', label: '标题 4', icon: Heading4, hint: '#### ' },
  { key: 'quote', label: '引用', icon: Quote, hint: '> ' },
  { key: 'code', label: '代码块', icon: CodeXml, hint: '```' },
] as const

type BlockKey = (typeof BLOCK_ITEMS)[number]['key']

function currentBlock(editor: Editor): BlockKey {
  if (editor.isActive('heading', { level: 1 })) return 'h1'
  if (editor.isActive('heading', { level: 2 })) return 'h2'
  if (editor.isActive('heading', { level: 3 })) return 'h3'
  if (editor.isActive('heading', { level: 4 })) return 'h4'
  if (editor.isActive('blockquote')) return 'quote'
  if (editor.isActive('codeBlock')) return 'code'
  return 'p'
}

function applyBlock(editor: Editor, key: BlockKey) {
  const chain = editor.chain().focus()
  switch (key) {
    case 'h1':
      chain.setNode('heading', { level: 1 }).run()
      break
    case 'h2':
      chain.setNode('heading', { level: 2 }).run()
      break
    case 'h3':
      chain.setNode('heading', { level: 3 }).run()
      break
    case 'h4':
      chain.setNode('heading', { level: 4 }).run()
      break
    case 'quote':
      chain.toggleBlockquote().run()
      break
    case 'code':
      chain.toggleCodeBlock({ language: 'javascript' }).run()
      break
    default:
      chain.setParagraph().run()
  }
}

function BlockSelect({ editor }: ToolProps) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const active = currentBlock(editor)
  const activeItem = BLOCK_ITEMS.find((i) => i.key === active) ?? BLOCK_ITEMS[0]
  const ActiveIcon = activeItem.icon

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className="block-select" ref={wrapRef}>
      <button
        type="button"
        className="block-select-trigger"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <ActiveIcon size={15} strokeWidth={2} />
          {activeItem.label}
        </span>
        <ChevronDown size={14} strokeWidth={2} />
      </button>

      {open && (
        <div className="block-menu" role="menu">
          {BLOCK_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = item.key === active
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={'block-menu-item' + (isActive ? ' is-active' : '')}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  applyBlock(editor, item.key)
                  setOpen(false)
                }}
              >
                <Icon size={15} strokeWidth={2} />
                {item.label}
                {item.hint && <span className="kbd">{item.hint.trim()}</span>}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function LinkControl({ editor }: ToolProps) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const href = (editor.getAttributes('link').href as string | undefined) ?? ''
  const isLink = editor.isActive('link')

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const openPanel = () => {
    setValue(href)
    setOpen(true)
    requestAnimationFrame(() => inputRef.current?.select())
  }

  const apply = () => {
    const url = value.trim()
    if (!url) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
    } else {
      const safe = /^(https?:\/\/|mailto:|tel:|#|\/)/i.test(url) ? url : `https://${url}`
      editor.chain().focus().extendMarkRange('link').setLink({ href: safe }).run()
    }
    setOpen(false)
  }

  return (
    <div className="link-wrap" ref={wrapRef}>
      <ToolButton title={isLink ? '编辑链接' : '插入链接'} active={isLink} onClick={openPanel}>
        <Link2 size={16} strokeWidth={2} />
      </ToolButton>

      {open && (
        <div className="link-pop">
          <input
            ref={inputRef}
            className="link-input"
            placeholder="粘贴或输入链接地址"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                apply()
              } else if (e.key === 'Escape') {
                e.preventDefault()
                setOpen(false)
              }
            }}
          />
          <ToolButton title="应用" onClick={apply}>
            <Check size={16} strokeWidth={2.2} />
          </ToolButton>
          {isLink && (
            <ToolButton
              title="移除链接"
              onClick={() => {
                editor.chain().focus().extendMarkRange('link').unsetLink().run()
                setOpen(false)
              }}
            >
              <Link2Off size={16} strokeWidth={2} />
            </ToolButton>
          )}
        </div>
      )}
    </div>
  )
}

export default function Toolbar({ editor, onInsertImage }: ToolbarProps) {
  const icon = { size: 16, strokeWidth: 2 } as const

  // Editor 实例本身不会随光标移动而改变；订阅事务才能及时刷新
  // 代码块语言、按钮激活状态以及表格工具。
  useEditorState({
    editor,
    selector: ({ transactionNumber }) => transactionNumber,
  })

  return (
    <div className="toolbar">
      <div className="toolbar-inner">
        <Group>
          <ToolButton title="撤销 (Ctrl/⌘ + Z)" disabled={!editor.can().undo()} onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 {...icon} />
          </ToolButton>
          <ToolButton title="重做 (Ctrl/⌘ + Shift + Z)" disabled={!editor.can().redo()} onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 {...icon} />
          </ToolButton>
        </Group>

        <Sep />
        <Group>
          <BlockSelect editor={editor} />
        </Group>

        <Sep />
        <Group>
          <ToolButton title="加粗 (Ctrl/⌘ + B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold {...icon} />
          </ToolButton>
          <ToolButton title="斜体 (Ctrl/⌘ + I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic {...icon} />
          </ToolButton>
          <ToolButton title="下划线 (Ctrl/⌘ + U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <Underline {...icon} />
          </ToolButton>
          <ToolButton title="删除线 (Ctrl/⌘ + Shift + X)" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough {...icon} />
          </ToolButton>
          <ToolButton title="高亮 (Ctrl/⌘ + Shift + H)" active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()}>
            <Highlighter {...icon} />
          </ToolButton>
          <ToolButton title="行内代码 (Ctrl/⌘ + E)" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
            <Code {...icon} />
          </ToolButton>
          <LinkControl editor={editor} />
        </Group>

        <Sep />
        <Group>
          <ToolButton title="无序列表" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List {...icon} />
          </ToolButton>
          <ToolButton title="有序列表" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered {...icon} />
          </ToolButton>
          <ToolButton title="待办列表" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
            <ListChecks {...icon} />
          </ToolButton>
          <ToolButton title="引用" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote {...icon} />
          </ToolButton>
        </Group>

        <Sep />
        <Group>
          <ToolButton title="插入图片（也可粘贴或拖入）" onClick={onInsertImage}>
            <ImagePlus {...icon} />
          </ToolButton>
          <ToolButton
            title="代码块"
            active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock({ language: 'javascript' }).run()}
          >
            <CodeXml {...icon} />
          </ToolButton>
          <ToolButton
            title="插入表格"
            active={editor.isActive('table')}
            onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}
          >
            <Table {...icon} />
          </ToolButton>
          <ToolButton title="分割线" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
            <Minus {...icon} />
          </ToolButton>
        </Group>

        {editor.isActive('table') && (
          <>
            <Sep />
            <Group>
              <ToolButton title="在上方插入行" onClick={() => editor.chain().focus().addRowBefore().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>行↑</span>
              </ToolButton>
              <ToolButton title="在下方插入行" onClick={() => editor.chain().focus().addRowAfter().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>行↓</span>
              </ToolButton>
              <ToolButton title="在左侧插入列" onClick={() => editor.chain().focus().addColumnBefore().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>列←</span>
              </ToolButton>
              <ToolButton title="在右侧插入列" onClick={() => editor.chain().focus().addColumnAfter().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>列→</span>
              </ToolButton>
              <ToolButton title="删除整行" onClick={() => editor.chain().focus().deleteRow().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>删行</span>
              </ToolButton>
              <ToolButton title="删除整列" onClick={() => editor.chain().focus().deleteColumn().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>删列</span>
              </ToolButton>
              <ToolButton title="删除表格" onClick={() => editor.chain().focus().deleteTable().run()}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>删表</span>
              </ToolButton>
            </Group>
          </>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { TextSelection } from '@tiptap/pm/state'
import {
  ArrowDownToLine,
  ArrowLeftToLine,
  ArrowRightToLine,
  ArrowUpToLine,
  Columns3,
  Rows3,
  Trash2,
} from 'lucide-react'

interface TableContextMenuProps {
  editor: Editor
}

interface MenuPosition {
  x: number
  y: number
}

export default function TableContextMenu({ editor }: TableContextMenuProps) {
  const [position, setPosition] = useState<MenuPosition | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const close = useCallback(() => setPosition(null), [])

  useEffect(() => {
    const editorDom = editor.view.dom

    const handleContextMenu = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return

      const cell = target.closest('td, th')
      if (!cell || !editorDom.contains(cell)) {
        close()
        return
      }

      event.preventDefault()

      let cellPosition: number | null = null
      try {
        cellPosition = editor.view.posAtDOM(cell, 0, 1)
      } catch {
        cellPosition = editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null
      }

      if (cellPosition === null) return

      const resolvedPosition = editor.state.doc.resolve(cellPosition)
      const selection = TextSelection.near(resolvedPosition, 1)
      editor.view.dispatch(editor.state.tr.setSelection(selection))
      editor.view.focus()
      setPosition({ x: event.clientX, y: event.clientY })
    }

    editorDom.addEventListener('contextmenu', handleContextMenu)
    return () => editorDom.removeEventListener('contextmenu', handleContextMenu)
  }, [close, editor])

  useEffect(() => {
    if (!position) return

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close()
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', close)
    window.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', close)
      window.removeEventListener('scroll', close, true)
    }
  }, [close, position])

  useLayoutEffect(() => {
    if (!position || !menuRef.current) return

    const menu = menuRef.current
    const rect = menu.getBoundingClientRect()
    const gap = 8
    const left = Math.max(gap, Math.min(position.x, window.innerWidth - rect.width - gap))
    const top = Math.max(gap, Math.min(position.y, window.innerHeight - rect.height - gap))
    menu.style.left = `${left}px`
    menu.style.top = `${top}px`
  }, [position])

  if (!position) return null

  const run = (command: () => boolean) => {
    command()
    close()
  }

  const iconProps = { size: 16, strokeWidth: 2 } as const

  return createPortal(
    <div
      ref={menuRef}
      className="table-context-menu"
      role="menu"
      aria-label="表格操作"
      style={{ left: position.x, top: position.y }}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button
        type="button"
        role="menuitem"
        disabled={!editor.can().addRowBefore()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().addRowBefore().run())}
      >
        <ArrowUpToLine {...iconProps} />
        <span>在上方插入行</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!editor.can().addRowAfter()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().addRowAfter().run())}
      >
        <ArrowDownToLine {...iconProps} />
        <span>在下方插入行</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!editor.can().addColumnBefore()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().addColumnBefore().run())}
      >
        <ArrowLeftToLine {...iconProps} />
        <span>在左侧插入列</span>
      </button>
      <button
        type="button"
        role="menuitem"
        disabled={!editor.can().addColumnAfter()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().addColumnAfter().run())}
      >
        <ArrowRightToLine {...iconProps} />
        <span>在右侧插入列</span>
      </button>

      <div className="table-context-menu-separator" role="separator" />

      <button
        type="button"
        role="menuitem"
        className="is-danger"
        disabled={!editor.can().deleteRow()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().deleteRow().run())}
      >
        <Rows3 {...iconProps} />
        <span>删除当前行</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        disabled={!editor.can().deleteColumn()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().deleteColumn().run())}
      >
        <Columns3 {...iconProps} />
        <span>删除当前列</span>
      </button>
      <button
        type="button"
        role="menuitem"
        className="is-danger"
        disabled={!editor.can().deleteTable()}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => run(() => editor.chain().focus().deleteTable().run())}
      >
        <Trash2 {...iconProps} />
        <span>删除整个表格</span>
      </button>
    </div>,
    document.body,
  )
}

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SlashItem } from '../editor/slashCommand'

interface Props {
  items: SlashItem[]
  /** 选中某项后执行（由 Suggestion 的 command 传入） */
  command: (item: SlashItem) => void
  /** Esc / 点击外部时关闭菜单 */
  onClose: () => void
}

export interface SlashMenuHandle {
  onKeyDown: (args: { event: KeyboardEvent }) => boolean
}

const SlashMenu = forwardRef<SlashMenuHandle, Props>(function SlashMenu({ items, command, onClose }, ref) {
  const [index, setIndex] = useState(0)
  const indexRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  /** 按 group 归组，同时展开成一个扁平列表供键盘导航使用 */
  const groups = useMemo(() => {
    const map = new Map<string, SlashItem[]>()
    for (const item of items) {
      const bucket = map.get(item.group)
      if (bucket) bucket.push(item)
      else map.set(item.group, [item])
    }
    return [...map.entries()]
  }, [items])

  const flat = useMemo(() => groups.flatMap(([, list]) => list), [groups])

  // 查询词变化后回到第一项
  useEffect(() => {
    setIndex(0)
  }, [items])

  useEffect(() => {
    indexRef.current = index
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' })
  }, [index])

  const select = (item: SlashItem | undefined) => {
    if (item) command(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      const total = flat.length

      if (event.key === 'Escape') {
        onClose()
        return true
      }
      if (!total) return false

      if (event.key === 'ArrowDown') {
        setIndex((i) => (i + 1) % total)
        return true
      }
      if (event.key === 'ArrowUp') {
        setIndex((i) => (i - 1 + total) % total)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        select(flat[indexRef.current])
        return true
      }
      return false
    },
  }))

  const pick = (item: SlashItem) => {
    // 阻止默认行为，避免编辑器在 mousedown 时先把选区清掉
    return (event: React.MouseEvent) => {
      event.preventDefault()
      select(item)
    }
  }

  if (!flat.length) {
    return (
      <div className="slash-menu">
        <div className="slash-empty">没有匹配的命令</div>
      </div>
    )
  }

  let cursor = -1

  return (
    <div className="slash-menu" ref={listRef}>
      {groups.map(([group, list]) => (
        <div className="slash-group" key={group}>
          <div className="slash-group-title">{group}</div>
          {list.map((item) => {
            cursor += 1
            const current = cursor
            const Icon = item.icon
            return (
              <button
                type="button"
                key={item.id}
                data-index={current}
                className={'slash-item' + (current === index ? ' is-active' : '')}
                onMouseEnter={() => setIndex(current)}
                onMouseDown={pick(item)}
              >
                <span className="slash-icon">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="slash-text">
                  <span className="slash-title">{item.title}</span>
                  <span className="slash-hint">{item.hint}</span>
                </span>
              </button>
            )
          })}
        </div>
      ))}
      <div className="slash-foot">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> 选择
        </span>
        <span>
          <kbd>Enter</kbd> 确认
        </span>
        <span>
          <kbd>Esc</kbd> 关闭
        </span>
      </div>
    </div>
  )
})

export default SlashMenu

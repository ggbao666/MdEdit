export interface HeadingItem {
  pos: number
  level: number
  text: string
}

interface Props {
  items: HeadingItem[]
  activeIndex: number
  onJump: (item: HeadingItem) => void
}

export default function Outline({ items, activeIndex, onJump }: Props) {
  return (
    <nav className="outline" aria-label="文档大纲">
      {items.length === 0 ? (
        <p className="outline-empty">
          还没有标题。
          <br />
          用 <b>#</b> 开头，或选中文字后设为标题，大纲会自动出现。
        </p>
      ) : (
        items.map((item, index) => (
          <button
            key={`${item.pos}-${index}`}
            type="button"
            data-level={item.level}
            className={'outline-item' + (index === activeIndex ? ' is-active' : '')}
            title={item.text}
            onClick={() => onJump(item)}
          >
            {item.text}
          </button>
        ))
      )}
    </nav>
  )
}

import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { NodeViewContent, NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { CODE_LANGUAGES } from './lowlight'

function CodeBlockView({ node, updateAttributes }: NodeViewProps) {
  const language = String(node.attrs.language ?? '')
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const selected = CODE_LANGUAGES.find((item) => item.value === language) ?? CODE_LANGUAGES[0]

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <NodeViewWrapper className="code-block-wrap">
      <div ref={menuRef} className="code-block-language" contentEditable={false}>
        <button
          type="button"
          className={'code-language-trigger' + (open ? ' is-open' : '')}
          aria-label="代码语言"
          title="切换代码语言"
          aria-haspopup="menu"
          aria-expanded={open}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setOpen((value) => !value)}
        >
          <span>{selected.label}</span>
          <ChevronDown size={12} strokeWidth={2} />
        </button>
        {open && (
          <div className="code-language-menu" role="menu">
            {CODE_LANGUAGES.map((item) => (
              <button
                key={item.value || 'auto'}
                type="button"
                role="menuitemradio"
                aria-checked={item.value === language}
                className={item.value === language ? 'is-active' : ''}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  updateAttributes({ language: item.value || null })
                  setOpen(false)
                }}
              >
                <span>{item.label}</span>
                {item.value === language && <Check size={13} strokeWidth={2.3} />}
              </button>
            ))}
          </div>
        )}
      </div>
      <NodeViewContent<'pre'> as="pre" />
    </NodeViewWrapper>
  )
}

export const TiptoraCodeBlock = CodeBlockLowlight.extend({
  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView, { contentDOMElementTag: 'code' })
  },
})

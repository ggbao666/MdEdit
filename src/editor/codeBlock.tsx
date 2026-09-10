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
    <NodeViewWrapper className={'code-block-wrap' + (open ? ' is-language-menu-open' : '')}>
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
          <ChevronDown size={10} strokeWidth={2} />
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
  addKeyboardShortcuts() {
    return {
      ...this.parent?.(),

      // Tiptap 原生还会在代码块位于整篇文档开头时直接清除格式；
      // 这里仅收紧这一条：只有代码块已经为空，Backspace 才转为普通段落。
      Backspace: () => {
        const { empty, $anchor } = this.editor.state.selection

        if (!empty || $anchor.parent.type.name !== this.name) return false
        if (!$anchor.parent.textContent.length) return this.editor.commands.clearNodes()

        // 非空代码块首行行首没有可删除的字符，阻止通用 joinBackward
        // 合并上一段、删除上一空行或把光标移出代码块。
        if ($anchor.parentOffset === 0) return true

        return false
      },
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(CodeBlockView, { contentDOMElementTag: 'code' })
  },
})

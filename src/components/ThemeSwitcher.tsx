import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Check, Palette } from 'lucide-react'

import { THEME_OPTIONS, type Theme } from '../config/themes'

interface ThemeSwitcherProps {
  theme: Theme
  onChange: (theme: Theme) => void
}

export default function ThemeSwitcher({ theme, onChange }: ThemeSwitcherProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const activeTheme = THEME_OPTIONS.find((option) => option.id === theme) ?? THEME_OPTIONS[0]

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setOpen(false)
      triggerRef.current?.focus()
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  const focusOption = (position: 'active' | 'first' | 'last' = 'active') => {
    requestAnimationFrame(() => {
      const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
      const activeIndex = items.findIndex((item) => item.dataset.themeId === theme)
      const index = position === 'first' ? 0 : position === 'last' ? items.length - 1 : Math.max(0, activeIndex)
      items[index]?.focus()
    })
  }

  const openMenu = (position: 'active' | 'first' | 'last' = 'active') => {
    setOpen(true)
    focusOption(position)
  }

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [])
    const index = items.indexOf(document.activeElement as HTMLButtonElement)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      items[Math.min(items.length - 1, index + 1)]?.focus()
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      items[Math.max(0, index - 1)]?.focus()
    } else if (event.key === 'Home') {
      event.preventDefault()
      items[0]?.focus()
    } else if (event.key === 'End') {
      event.preventDefault()
      items.at(-1)?.focus()
    }
  }

  if (!activeTheme) return null

  return (
    <div className="topbar-theme-switcher" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={'btn topbar-theme-trigger' + (open ? ' is-active' : '')}
        title={`界面主题：${activeTheme.name}`}
        aria-label={`选择界面主题，当前为${activeTheme.name}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            openMenu(open ? 'first' : 'active')
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            openMenu(open ? 'last' : 'active')
          }
        }}
      >
        <Palette size={17} strokeWidth={2} aria-hidden="true" />
        <span className="topbar-theme-dot" style={{ background: activeTheme.preview.accent }} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="topbar-theme-menu"
          role="listbox"
          aria-label="界面主题"
          onKeyDown={handleMenuKeyDown}
        >
          {(['light', 'dark'] as const).map((appearance) => (
            <div className="theme-select-group" role="group" aria-label={appearance === 'light' ? '亮色主题' : '暗色主题'} key={appearance}>
              <div className="theme-select-group-label">{appearance === 'light' ? '亮色主题' : '暗色主题'}</div>
              {THEME_OPTIONS.filter((option) => option.appearance === appearance).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={theme === option.id}
                  data-theme-id={option.id}
                  className={'theme-select-option' + (theme === option.id ? ' is-active' : '')}
                  title={option.description}
                  onClick={() => {
                    onChange(option.id)
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                >
                  <span className="theme-option-color" style={{ background: option.preview.accent }} aria-hidden="true" />
                  <span>{option.name}</span>
                  {theme === option.id && <Check size={14} strokeWidth={2.2} aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

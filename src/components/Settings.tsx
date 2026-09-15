import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown, FolderOpen, Image as ImageIcon, Settings as SettingsIcon, X } from 'lucide-react'

import { ASSET_DIR_PRESETS, DEFAULT_ASSET_DIR, resolveAssetDir, safeSegment } from '../lib/assets'
import { THEME_OPTIONS, type Theme } from '../config/themes'
import { pickAssetDirectory, type WorkspaceInfo } from '../lib/workspace'
import type { Prefs } from '../lib/storage'

const SAMPLE_DOC = '示例文档.md'
const SAMPLE_IMG = '截图.png'

interface SettingsProps {
  prefs: Prefs
  onChange: (patch: Partial<Prefs>) => void
  theme: Theme
  onThemeChange: (theme: Theme) => void
  /** 已挂载的目录 */
  roots: WorkspaceInfo[]
  /** 把目录从侧栏移除，不动磁盘文件 */
  onDetachRoot: (root: string) => void
  onClose: () => void
}

function ThemePicker({ theme, onChange }: { theme: Theme; onChange: (theme: Theme) => void }) {
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
    const handleEscape = (event: KeyboardEvent) => {
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

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
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

  return (
    <div className="theme-select-wrap" ref={rootRef}>
      <button
        ref={triggerRef}
        id="theme-select"
        type="button"
        className="theme-select-control"
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
        <span
          className="theme-swatch"
          style={{
            background: activeTheme.preview.bg,
            borderColor: activeTheme.preview.border,
          }}
          aria-hidden="true"
        >
          <i style={{ background: activeTheme.preview.surface }} />
          <b style={{ background: activeTheme.preview.accent }} />
        </span>
        <span className="theme-select-name">{activeTheme.name}</span>
        <ChevronDown className="theme-select-chevron" size={16} strokeWidth={2} aria-hidden="true" />
      </button>

      {open && (
        <div
          ref={menuRef}
          className="theme-select-menu"
          role="listbox"
          aria-label="界面主题"
          onKeyDown={handleMenuKeyDown}
        >
          {(['light', 'dark'] as const).map((appearance) => (
            <div className="theme-select-group" role="group" aria-label={appearance === 'light' ? '亮色主题' : '深色主题'} key={appearance}>
              <div className="theme-select-group-label">{appearance === 'light' ? '亮色主题' : '深色主题'}</div>
              {THEME_OPTIONS.filter((option) => option.appearance === appearance).map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={theme === option.id}
                  data-theme-id={option.id}
                  className={'theme-select-option' + (theme === option.id ? ' is-active' : '')}
                  onClick={() => {
                    onChange(option.id)
                    setOpen(false)
                    triggerRef.current?.focus()
                  }}
                >
                  <span
                    className="theme-option-color"
                    style={{ background: option.preview.accent }}
                    aria-hidden="true"
                  />
                  <span>{option.name}</span>
                  {theme === option.id && <Check size={14} strokeWidth={2.2} aria-hidden="true" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {activeTheme.description && (
        <span className="theme-select-description">{activeTheme.description}</span>
      )}
    </div>
  )
}

export default function Settings({
  prefs,
  onChange,
  theme,
  onThemeChange,
  roots,
  onDetachRoot,
  onClose,
}: SettingsProps) {
  const dirPreview = prefs.assetDirMode === 'custom'
    ? prefs.customAssetDir || '尚未指定目录'
    : resolveAssetDir(prefs.assetDir, SAMPLE_DOC.replace(/\.md$/, ''))

  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">
            <SettingsIcon size={15} strokeWidth={2} /> 设置
          </div>
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn" onClick={onClose} aria-label="关闭">
              关闭
            </button>
          </div>
        </div>

        <div className="sheet-body">
          {/* ---------------- 外观 ---------------- */}
          <div className="set-group">
            <div className="set-group-title">外观</div>
            <div className="set-row theme-select-row">
              <label className="set-label" htmlFor="theme-select">
                界面主题
              </label>
              <ThemePicker theme={theme} onChange={onThemeChange} />
            </div>

            <div className="set-row">
              <label className="set-label" htmlFor="editor-font-size">
                文档字号
              </label>
              <div className="set-font-size">
                <input
                  id="editor-font-size"
                  type="range"
                  min={12}
                  max={24}
                  step={0.5}
                  value={prefs.editorFontSize}
                  aria-valuetext={`${prefs.editorFontSize} 像素`}
                  onChange={(event) => onChange({ editorFontSize: Number(event.target.value) })}
                />
                <output htmlFor="editor-font-size">{prefs.editorFontSize}px</output>
                <button
                  type="button"
                  className="set-reset"
                  disabled={prefs.editorFontSize === 16.5}
                  onClick={() => onChange({ editorFontSize: 16.5 })}
                >
                  默认
                </button>
              </div>
            </div>

          </div>

          {/* ---------------- 目录 ---------------- */}
          <div className="set-group">
            <div className="set-group-title">目录</div>

            {roots.length === 0 ? (
              <div className="set-hint">还没有打开目录，文档会先保存在临时草稿中。</div>
            ) : (
              <div className="root-list">
                {roots.map((dir) => (
                  <div className="root-row" key={dir.root}>
                    <FolderOpen size={14} strokeWidth={2} className="root-icon" />
                    <span className="root-name">{dir.name}</span>
                    <span className="root-path">{dir.root}</span>
                    <button
                      type="button"
                      className="root-remove"
                      title="从侧栏移除（不会删除磁盘文件）"
                      onClick={() => onDetachRoot(dir.root)}
                    >
                      <X size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="set-hint">
              可以同时打开多个目录，侧栏按目录分组显示，每个目录下都能单独新建文档。
            </div>

          </div>

          {/* ---------------- 保存 ---------------- */}
          <div className="set-group">
            <div className="set-group-title">保存</div>

            <div className="set-row">
              <span className="set-label">自动保存</span>
              <div className="seg">
                <button
                  type="button"
                  className={'seg-item' + (prefs.autoSave ? ' is-active' : '')}
                  onClick={() => onChange({ autoSave: true })}
                >
                  开启
                </button>
                <button
                  type="button"
                  className={'seg-item' + (!prefs.autoSave ? ' is-active' : '')}
                  onClick={() => onChange({ autoSave: false })}
                >
                  关闭
                </button>
              </div>
            </div>

            {prefs.autoSave ? (
              <div className="set-row">
                <span className="set-label">保存延迟</span>
                <div className="set-delay">
                  <input
                    className="set-input"
                    type="number"
                    min={100}
                    max={60000}
                    step={100}
                    value={prefs.autoSaveDelay}
                    onChange={(e) => {
                      const value = Number(e.target.value)
                      if (Number.isFinite(value)) {
                        onChange({ autoSaveDelay: Math.min(60000, Math.max(100, Math.round(value))) })
                      }
                    }}
                  />
                  <span>毫秒</span>
                </div>
              </div>
            ) : (
              <div className="set-hint">关闭后请使用顶部保存按钮或 Ctrl/⌘ + S 保存当前文档。</div>
            )}
          </div>

          {/* ---------------- 图片 ---------------- */}
          <div className="set-group">
            <div className="set-group-title">图片</div>

            <div className="set-row">
              <span className="set-label">存储方式</span>
              <div className="seg">
                <button
                  type="button"
                  className={'seg-item' + (prefs.imageMode === 'file' ? ' is-active' : '')}
                  onClick={() => onChange({ imageMode: 'file' })}
                >
                  原图 + 相对路径
                </button>
                <button
                  type="button"
                  className={'seg-item' + (prefs.imageMode === 'inline' ? ' is-active' : '')}
                  onClick={() => onChange({ imageMode: 'inline' })}
                >
                  内联进文档
                </button>
              </div>
            </div>

            <div className="set-hint">
              {prefs.imageMode === 'file'
                ? '原图按原格式写入资源目录，Markdown 里引用相对路径，用别的编辑器打开也能正常显示。'
                : '图片转成 base64 嵌进文档，单文件自包含、方便传输，但文档体积会明显变大。'}
            </div>

            {prefs.imageMode === 'file' && (
              <>
                <div className="set-row">
                  <span className="set-label">资源目录</span>
                  <input
                    className="set-input"
                    value={prefs.assetDirMode === 'custom' ? prefs.customAssetDir : prefs.assetDir}
                    spellCheck={false}
                    placeholder={DEFAULT_ASSET_DIR}
                    readOnly={prefs.assetDirMode === 'custom'}
                    title={prefs.assetDirMode === 'custom' ? prefs.customAssetDir : undefined}
                    onChange={(e) => onChange({
                      assetDirMode: 'relative',
                      assetDir: safeSegment(e.target.value, DEFAULT_ASSET_DIR),
                    })}
                  />
                </div>

                <div className="set-chips">
                  {ASSET_DIR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={
                        'chip' +
                        (prefs.assetDirMode === 'relative' && prefs.assetDir === preset.value ? ' is-active' : '')
                      }
                      title={preset.hint}
                      onClick={() => onChange({ assetDirMode: 'relative', assetDir: preset.value })}
                    >
                      <ImageIcon size={13} strokeWidth={2} />
                      {preset.value}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={'chip' + (prefs.assetDirMode === 'custom' ? ' is-active' : '')}
                    title="选择工作区外的本机图片目录"
                    onClick={async () => {
                      const directory = await pickAssetDirectory()
                      if (directory) onChange({ assetDirMode: 'custom', customAssetDir: directory })
                    }}
                  >
                    <FolderOpen size={13} strokeWidth={2} />
                    指定目录…
                  </button>
                </div>

                <div className="set-preview">
                  <code>
                    {SAMPLE_DOC}
                    <br />
                    {dirPreview}{prefs.assetDirMode === 'custom' ? '\\' : '/'}{SAMPLE_IMG}
                  </code>
                  <span className="set-hint">
                    {prefs.assetDirMode === 'custom' ? (
                      <>插入图片时会在 Markdown 中保存对应的本地文件地址。</>
                    ) : (
                      <>Markdown 引用：<code>![{''}]({dirPreview}/{SAMPLE_IMG})</code></>
                    )}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

import { FolderOpen, Image as ImageIcon, Settings as SettingsIcon, X } from 'lucide-react'

import { ASSET_DIR_PRESETS, DEFAULT_ASSET_DIR, resolveAssetDir, safeSegment } from '../lib/assets'
import { THEME_OPTIONS, type Theme } from '../config/themes'
import type { WorkspaceInfo } from '../lib/workspace'
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

export default function Settings({
  prefs,
  onChange,
  theme,
  onThemeChange,
  roots,
  onDetachRoot,
  onClose,
}: SettingsProps) {
  const dirPreview = resolveAssetDir(prefs.assetDir, SAMPLE_DOC.replace(/\.md$/, ''))

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
            <div className="theme-options">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={'theme-option' + (theme === option.id ? ' is-active' : '')}
                  onClick={() => onThemeChange(option.id)}
                >
                  <span
                    className="theme-swatch"
                    style={{
                      background: option.preview.bg,
                      borderColor: option.preview.border,
                    }}
                  >
                    <i style={{ background: option.preview.surface }} />
                    <b style={{ background: option.preview.accent }} />
                  </span>
                  <span className="theme-option-copy">
                    <strong>{option.name}</strong>
                    <small>{option.description}</small>
                  </span>
                </button>
              ))}
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
                    value={prefs.assetDir}
                    spellCheck={false}
                    placeholder={DEFAULT_ASSET_DIR}
                    onChange={(e) => onChange({ assetDir: safeSegment(e.target.value, DEFAULT_ASSET_DIR) })}
                  />
                </div>

                <div className="set-chips">
                  {ASSET_DIR_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      className={'chip' + (prefs.assetDir === preset.value ? ' is-active' : '')}
                      title={preset.hint}
                      onClick={() => onChange({ assetDir: preset.value })}
                    >
                      <ImageIcon size={13} strokeWidth={2} />
                      {preset.value}
                    </button>
                  ))}
                </div>

                <div className="set-preview">
                  <code>
                    {SAMPLE_DOC}
                    <br />
                    {dirPreview}/{SAMPLE_IMG}
                  </code>
                  <span className="set-hint">
                    Markdown 引用：<code>![{''}]({dirPreview}/{SAMPLE_IMG})</code>
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

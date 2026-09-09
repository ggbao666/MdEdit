import { FolderClock, FolderOpen, PencilLine } from 'lucide-react'
import appIcon from '../assets/jianmo-icon.svg'
import type { WorkspaceInfo } from '../lib/workspace'

interface LauncherProps {
  /** 上次会话打开过的目录，可能为空 */
  last: WorkspaceInfo[]
  remember: boolean
  onRemember: (value: boolean) => void
  onOpenLast: () => void
  onOpenOther: () => void
  onSkip: () => void
}

/**
 * 启动面板：只有「上次打开过目录且用户没说过别问了」时才出现。
 * 三个出口：接着用上次的 / 换一个 / 什么都不打开直接写。
 */
export default function Launcher({
  last,
  remember,
  onRemember,
  onOpenLast,
  onOpenOther,
  onSkip,
}: LauncherProps) {
  const name = last.length === 1 ? last[0].name : `${last.length} 个目录`

  return (
    <div className="launcher">
      <div className="launcher-card">
        <img className="launcher-logo" src={appIcon} alt="" />
        <h1 className="launcher-title">简墨</h1>
        <p className="launcher-desc">要从哪个目录开始？随时都能在侧栏里改。</p>

        {last.length > 0 && (
          <button type="button" className="launcher-main" onClick={onOpenLast}>
            <FolderClock size={16} strokeWidth={2} />
            <span className="launcher-main-text">
              <b>打开上次的目录</b>
              <em>{name}</em>
            </span>
          </button>
        )}

        <button
          type="button"
          className={'launcher-sub' + (last.length > 0 ? '' : ' is-primary')}
          onClick={onOpenOther}
        >
          <FolderOpen size={15} strokeWidth={2} />
          选择其他目录…
        </button>

        <button type="button" className="launcher-sub" onClick={onSkip}>
          <PencilLine size={15} strokeWidth={2} />
          不打开目录，直接开始
        </button>

        <label className="launcher-remember">
          <input type="checkbox" checked={remember} onChange={(e) => onRemember(e.target.checked)} />
          记住这次选择，下次不再询问
        </label>

        <p className="launcher-note">
          直接开始时会保留临时草稿，随时可以将它正式保存为 <code>.md</code>。
        </p>
      </div>
    </div>
  )
}

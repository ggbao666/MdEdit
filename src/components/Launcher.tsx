import { FilePlus2, FileText, FolderClock, FolderOpen } from 'lucide-react'
import appIcon from '../assets/mdedit-icon-offset.svg'
import { APP_NAME } from '../config/app'
import type { WorkspaceInfo } from '../lib/workspace'

interface LauncherProps {
  /** 上次会话打开过的目录，可能为空 */
  last: WorkspaceInfo[]
  onOpenLast: () => void
  onOpenFolder: () => void
  onOpenFile: () => void
  onNewBlank: () => void
}

/**
 * 冷启动选择页：打开上次目录、目录、单个文档或新建空白文档。
 */
export default function Launcher({
  last,
  onOpenLast,
  onOpenFolder,
  onOpenFile,
  onNewBlank,
}: LauncherProps) {
  const name = last.length === 1 ? last[0].name : `${last.length} 个目录`

  return (
    <div className="launcher">
      <div className="launcher-card">
        <img className="launcher-logo" src={appIcon} alt="" />
        <h1 className="launcher-title">{APP_NAME}</h1>
        <p className="launcher-desc">选择要从哪里开始</p>

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
          onClick={onOpenFolder}
        >
          <FolderOpen size={15} strokeWidth={2} />
          打开目录…
        </button>

        <button type="button" className="launcher-sub" onClick={onOpenFile}>
          <FileText size={15} strokeWidth={2} />
          打开文档…
        </button>

        <button type="button" className="launcher-sub" onClick={onNewBlank}>
          <FilePlus2 size={15} strokeWidth={2} />
          新建空白文档
        </button>
      </div>
    </div>
  )
}

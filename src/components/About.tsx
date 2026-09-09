import { X } from 'lucide-react'

import appIcon from '../assets/mdedit-icon-offset.svg'
import { APP_NAME, APP_VERSION } from '../config/app'

export default function About({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <section
        className="about-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button type="button" className="about-close" onClick={onClose} aria-label="关闭">
          <X size={17} strokeWidth={2} />
        </button>
        <img className="about-logo" src={appIcon} alt="" />
        <h2 id="about-title">{APP_NAME}</h2>
        <p>简洁专注的 Markdown 编辑器</p>
        <span>版本 {APP_VERSION}</span>
      </section>
    </div>
  )
}

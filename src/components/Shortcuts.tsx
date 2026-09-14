interface Shortcut {
  keys: string
  desc: string
}

const GROUPS: { title: string; items: Shortcut[] }[] = [
  {
    title: '行内格式',
    items: [
      { keys: 'Ctrl/⌘ + B', desc: '加粗' },
      { keys: 'Ctrl/⌘ + I', desc: '斜体' },
      { keys: 'Ctrl/⌘ + U', desc: '下划线' },
      { keys: 'Ctrl/⌘ + Shift + X', desc: '删除线' },
      { keys: 'Ctrl/⌘ + E', desc: '行内代码' },
      { keys: 'Ctrl/⌘ + Shift + H', desc: '高亮' },
    ],
  },
  {
    title: '块级格式',
    items: [
      { keys: 'Ctrl/⌘ + Alt + 1~4', desc: '一~四级标题' },
      { keys: 'Ctrl/⌘ + Alt + 0', desc: '正文段落' },
      { keys: 'Ctrl/⌘ + Shift + 8', desc: '无序列表' },
      { keys: 'Ctrl/⌘ + Shift + 7', desc: '有序列表' },
      { keys: 'Ctrl/⌘ + Shift + 9', desc: '待办列表' },
      { keys: 'Ctrl/⌘ + Shift + B', desc: '引用' },
      { keys: 'Ctrl/⌘ + Alt + C', desc: '代码块' },
      { keys: 'Tab / Shift + Tab', desc: '列表缩进与升级' },
    ],
  },
  {
    title: '文档',
    items: [
      { keys: 'Ctrl/⌘ + O', desc: '打开 / 更换工作区文件夹' },
      { keys: 'Ctrl/⌘ + Shift + O', desc: '打开 Markdown 文件' },
      { keys: 'Ctrl/⌘ + Alt + N', desc: '新建文档' },
      { keys: 'Ctrl/⌘ + S', desc: '立即保存回 .md 文件' },
      { keys: 'Ctrl/⌘ + Shift + Alt + E', desc: '导出全部为 ZIP' },
      { keys: 'Ctrl/⌘ + \\', desc: '折叠 / 展开侧栏' },
      { keys: '工具栏右侧按钮', desc: '显示 / 隐藏右侧大纲' },
      { keys: 'Ctrl/⌘ + ,', desc: '打开设置' },
      { keys: 'Ctrl/⌘ + /', desc: '切换源码 / 所见即所得模式' },
      { keys: 'F1', desc: '打开本面板' },
      { keys: '拖入 .md 文件', desc: '挂载所在目录并打开文档' },
    ],
  },
  {
    title: '图片',
    items: [
      { keys: '粘贴 / 拖入', desc: '插入图片（原图或截图）' },
      { keys: '原图 + 相对路径', desc: '写入资源目录，引用形如 ![](x.assets/a.png)' },
      { keys: '内联', desc: 'base64 嵌进文档，单文件自包含' },
      { keys: '设置里切换', desc: '存储方式与资源目录命名模板' },
    ],
  },
  {
    title: '文档列表（侧栏）',
    items: [
      { keys: '单击', desc: '切换到该文档' },
      { keys: '双击标题', desc: '原地重命名' },
      { keys: '拖拽条目', desc: '手动调整排序' },
      { keys: '搜索框', desc: '按标题与正文过滤' },
      { keys: '目录右键', desc: '把 Markdown 文件或 ZIP 导入到所选目录' },
      { keys: 'Esc', desc: '清空搜索' },
    ],
  },
  {
    title: '斜杠命令',
    items: [
      { keys: '/', desc: '唤出命令面板（行首或空格后）' },
      { keys: '输入关键词', desc: '如 /表格、/待办、/code' },
      { keys: '↑ ↓', desc: '在命令间移动' },
      { keys: 'Enter / Tab', desc: '执行选中命令' },
      { keys: 'Esc', desc: '关闭面板' },
    ],
  },
  {
    title: 'Markdown 输入规则',
    items: [
      { keys: '# + 空格', desc: '标题（## 二级，以此类推）' },
      { keys: '- / 1. + 空格', desc: '无序 / 有序列表' },
      { keys: '[ ] + 空格', desc: '待办事项' },
      { keys: '> + 空格', desc: '引用' },
      { keys: '``` + 回车', desc: '代码块' },
      { keys: '--- + 回车', desc: '分割线' },
      { keys: '**粗体** *斜体*', desc: '自动识别的行内语法' },
      { keys: '粘贴纯文本', desc: '自动识别 Markdown 并转换' },
    ],
  },
]

export default function Shortcuts({ onClose }: { onClose: () => void }) {
  return (
    <div className="overlay" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <div className="sheet-title">快捷键</div>
          <div style={{ marginLeft: 'auto' }}>
            <button type="button" className="btn" onClick={onClose} aria-label="关闭">
              关闭
            </button>
          </div>
        </div>
        <div className="sheet-body">
          {GROUPS.map((group) => (
            <div key={group.title} style={{ marginBottom: 14 }}>
              <div
                style={{
                  fontSize: 11.5,
                  fontWeight: 650,
                  letterSpacing: 0.9,
                  textTransform: 'uppercase',
                  color: 'var(--text-3)',
                  padding: '10px 0 4px',
                }}
              >
                {group.title}
              </div>
              <div className="kbd-grid">
                {group.items.map((item) => (
                  <div className="kbd-row" key={item.keys + item.desc}>
                    <span>{item.desc}</span>
                    <span className="kbd">{item.keys}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

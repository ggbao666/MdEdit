interface ThemeMetadata {
  name: string
  appearance: 'light' | 'dark'
  description?: string
  order?: number
}

export interface ThemeDefinition extends ThemeMetadata {
  id: string
  css: string
  preview: {
    bg: string
    surface: string
    border: string
    accent: string
  }
}

const themeFiles = import.meta.glob('../themes/*.css', {
  eager: true,
  query: '?inline',
  import: 'default',
}) as Record<string, string>

function parseMetadata(path: string, css: string): ThemeMetadata {
  const match = css.match(/\/\*\s*@theme\s+(\{[\s\S]*?\})\s*\*\//)
  if (!match) throw new Error(`主题文件缺少 @theme 元信息：${path}`)
  const parsed = JSON.parse(match[1]) as Partial<ThemeMetadata>
  if (!parsed.name || (parsed.appearance !== 'light' && parsed.appearance !== 'dark')) {
    throw new Error(`主题文件的 name 或 appearance 无效：${path}`)
  }
  return {
    name: parsed.name,
    appearance: parsed.appearance,
    description: parsed.description ?? '',
    order: typeof parsed.order === 'number' ? parsed.order : 100,
  }
}

function cssVariable(css: string, name: string, fallback: string): string {
  const match = css.match(new RegExp(`--${name}\\s*:\\s*([^;]+);`))
  return match?.[1]?.trim() || fallback
}

function definitionFrom(path: string, css: string): ThemeDefinition {
  const id = path.split('/').pop()?.replace(/\.css$/i, '') ?? path
  const metadata = parseMetadata(path, css)
  return {
    id,
    css,
    ...metadata,
    preview: {
      bg: cssVariable(css, 'bg', metadata.appearance === 'dark' ? '#111315' : '#ffffff'),
      surface: cssVariable(css, 'surface', metadata.appearance === 'dark' ? '#1a1c1f' : '#ffffff'),
      border: cssVariable(css, 'border-strong', '#666666'),
      accent: cssVariable(css, 'accent', '#888888'),
    },
  }
}

export const THEMES: Record<string, ThemeDefinition> = Object.fromEntries(
  Object.entries(themeFiles).map(([path, css]) => {
    const definition = definitionFrom(path, css)
    return [definition.id, definition]
  }),
)

export type Theme = string

export const THEME_OPTIONS = Object.values(THEMES).sort(
  (a, b) => (a.order ?? 100) - (b.order ?? 100) || a.name.localeCompare(b.name, 'zh-Hans-CN'),
)
export const DEFAULT_LIGHT_THEME: Theme = THEMES.light ? 'light' : THEME_OPTIONS[0]?.id ?? ''
export const DEFAULT_DARK_THEME: Theme = THEMES['minimal-dark']
  ? 'minimal-dark'
  : THEME_OPTIONS.find((theme) => theme.appearance === 'dark')?.id ?? DEFAULT_LIGHT_THEME

export function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && value in THEMES
}

export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return
  const definition = THEMES[theme] ?? THEMES[DEFAULT_LIGHT_THEME]
  if (!definition) return

  const root = document.documentElement
  root.dataset.theme = definition.id
  root.dataset.appearance = definition.appearance
  root.style.colorScheme = definition.appearance

  let style = document.querySelector<HTMLStyleElement>('#tiptora-theme')
  if (!style) {
    style = document.createElement('style')
    style.id = 'tiptora-theme'
    document.head.appendChild(style)
  }
  style.textContent = definition.css
}

# 添加主题

在本目录新增一个 `.css` 文件即可自动注册主题，不需要修改 TypeScript 配置。

文件的 `:root` 中必须包含以下元信息变量：

```css
:root {
  --theme-name: "我的主题";
  --theme-appearance: dark;
  --theme-description: "主题说明";
  --theme-order: 40;
}
```

- 文件名就是主题 ID，例如 `my-theme.css` 对应 `my-theme`。
- `appearance` 只能是 `light` 或 `dark`，用于系统控件和顶部快捷切换。
- `order` 控制设置面板中的顺序，可省略。
- 复制任一现有主题的变量作为起点；也可以在文件中继续编写普通 CSS，覆盖组件样式。
- 开发环境新增文件后如未立即出现，重新运行 `npm run dev:all`；发布版本需要重新构建。

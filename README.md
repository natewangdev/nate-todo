# NateTodo

Windows 10 / 11 侧边悬浮球待办：点击展开列表，右上角「收起」回到悬浮球；未完成数量显示在球体角标上。数据保存在本机，无需联网。

## 环境要求

- 需要 **Node.js 18+**（当前工具链在 **Node 22** 上与 `electron-vite@5`、`vite@6` 对齐）。
- 仅支持 **Windows**（`win32`）打包与运行。

## 开发

```bash
npm install
npm run dev
```

若 `npm install` 报 `EBUSY` 无法替换 `node_modules\electron`，请先退出本应用、开发者工具及可能占用该目录的程序，再重试；仍不行可重启终端或系统后执行 `npm ci`。

## 构建安装包

```bash
npm run build
```

产物输出在 `release/`：`nsis` 安装包与 `portable` 单文件便携版（名称见构建日志）。

仅编译应用代码（不打包）：

```bash
npm run build:app
```

## 数据文件

应用首次运行后，数据位于 Electron 用户目录，例如：

- `%APPDATA%\nate-todo\todos.json` — 待办列表  
- `%APPDATA%\nate-todo\settings.json` — 悬浮球位置、`alwaysOnTopPinned`（主窗口是否始终在最前，**默认 false**）等

## 操作说明

| 操作 | 说明 |
|------|------|
| 单击悬浮球 | 打开待办面板 |
| 拖动悬浮球 | 在工作区内自由拖动（轻微移动视为单击） |
| 右上角图钉 | 一键将**所有未完成代办**以便签形式置顶到屏幕右上角（再次点击关闭） |
| 收起 | 面板右上角 **右箭头** 图标，回到悬浮球 |
| 便签样式 | 每张便签仅单行显示代办内容，超长内容自动省略 |
| 角标 | 仅在有未完成待办时显示未完成条数 |

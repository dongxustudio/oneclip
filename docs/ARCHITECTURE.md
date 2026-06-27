# OneClip 架构

Electron 34，零生产依赖。主进程 Node.js + 渲染进程 Browser，preload contextBridge 桥接。

## 进程

```
Main (Node)              Preload              Renderer (Browser)
index.js      ──►   contextBridge   ──►   index.html
tray.js             30 API                 css/style.css
storage.js                                 js/app.js
ipc-handlers.js                            js/snippet-list.js
icons.js                                   js/editor.js
shortcut.js                                js/search.js
```

## 文件

```
src/main/index.js          窗口生命周期、单实例、热键、托盘回调
src/main/tray.js           托盘图标/菜单、开机自启
src/main/storage.js        JSON 读写、片段 CRUD、分组管理、导入导出、数据迁移
src/main/ipc-handlers.js   25 个 ipcMain.handle
src/main/icons.js          SVG → PNG/ICO 自动生成（隐藏 BrowserWindow + Canvas 渲染）
src/main/shortcut.js       OS 级快捷键注册（开始菜单 .lnk 快捷方式 + WScript.Shell COM）
src/preload/index.js       24 invoke + 6 on
src/renderer/index.html    DOM（含分组创建弹窗、右键菜单、空分组引导）
src/renderer/css/style.css 设计令牌 + 全部样式
src/renderer/js/app.js     入口、芯片栏、搜索联动、键盘导航、分组右键菜单、重命名
src/renderer/js/snippet-list.js  双视图、拖拽排序、复制动画、空分组状态
src/renderer/js/editor.js  新增/编辑弹窗、Group 自定义下拉选择器
src/renderer/js/search.js  客户端过滤, 120ms 防抖
```

加载顺序 search → snippet-list → editor → app，全部 IIFE，`window.OneClip` 通信。

## 数据

```json
{
  "id": "uuid",
  "title": "",
  "content": "",
  "group": "",
  "created_at": ""
}
```

```json
{
  "snippets": [...],
  "groups": ["Work", "Personal"],
  "settings": {
    "window_width": 600, "window_height": 400,
    "window_x": null, "window_y": null,
    "always_on_top": false,
    "group_order": []
  }
}
```

`data.json` + `.bak` 双文件，写入走 tmp → rename。自定义路径通过 `datadir.txt` 指针。

`groups` 字段独立存储分组名（可与 snippet 派生分组共存），支持空分组。

## IPC

```
invoke:  get-snippets add-snippet update-snippet delete-snippet
         search-snippets get-groups add-group delete-group rename-group
         sync-order save-group-order
         copy-to-clipboard get-settings save-settings
         minimize-window hide-window toggle-always-on-top get-always-on-top
         get-auto-start toggle-auto-start register-global-shortcut
         export-snippets import-snippets get-data-dir change-data-dir

send:    open-editor snippets-changed data-dir-changed toast
```

## 视图

无过滤时按分组折叠面板展示（默认全部折叠），点分组标签则切换为该组平铺列表。搜索与过滤 AND 叠加。空分组显示引导页（No snippets in "xxx" + New Snippet 按钮）。

## 图标

SVG 源文件（`assets/hugeicons--quill-write-02.svg`）→ 每次启动时通过隐藏 BrowserWindow + Canvas 渲染 → 生成透明背景 PNG → 缩放出 16/32/48/256 多尺寸 ICO + 256px PNG + 64px 托盘 PNG。SVG 比 PNG 新时自动重新生成。托盘图标通过 nativeImage 从 256px 缩放至 64px。

# OneClip

> 常驻系统托盘的文本片段管理器 — 存一次，一键粘贴，永不重复打字。

把常用文字（问候语、地址、签名、模板、客服回复）提前存进去，`Ctrl+Shift+V` 呼出，点一下复制，到任何地方 `Ctrl+V` 粘贴。

---

## 特性

- **系统托盘常驻** — 不占任务栏，后台静默运行
- **全局热键** — `Ctrl+Shift+V` 任意位置唤出/隐藏；同时注册为 OS 级快捷方式，应用未启动时也能一键打开
- **一键复制** — 点击卡片 Copy 按钮，内容进剪贴板，按钮反馈 Copied（绿）/ Failed（红）
- **分组管理** — 手风琴折叠面板（默认折叠）+ 芯片栏过滤，两种浏览模式自动切换；右键菜单增删改分组；支持拖拽排序、跨组移动；删除分组时可选择将片段移入指定分组或永久删除
- **实时搜索** — 标题、内容、分组名全匹配，120ms 防抖
- **键盘操作** — 方向键导航卡片和分组，Enter 复制，Esc 取消，全键盘可用
- **编辑器键盘流** — `↓↑ Enter` 在 Title → Group → Content 字段间跳转；Group 字段带自定义下拉选择器（聚焦/点 ▾ 展示所有分组，打字时收起）
- **数据安全** — 每次写入自动备份 `.bak`，原子写入（tmp → rename），JSON 损坏自动恢复
- **自定义存储目录** — 数据文件想放哪里放哪里，选目录自动迁移
- **导入导出** — JSON 格式，导入自动按 ID 去重
- **窗口置顶** — 一键图钉，状态持久化
- **开机自启** — 托盘菜单勾选即生效
- **图标自生成** — 基于 SVG 源文件自动渲染 PNG + ICO，换图标只需替换 SVG 重启
- **零生产依赖** — 只用 Electron/Node.js 内置 API，不引入第三方 npm 包

---

## 安装

### 用户安装（Windows）

从 [Releases](../../releases) 下载 `OneClip-Setup-1.0.0.exe`，双击安装。支持自定义安装目录，可选桌面快捷方式。

### 开发者运行

```bash
# 环境要求: Node.js ≥ 18
git clone <repo-url>
cd OneClip
npm install
npm start
```

---

## 快速上手

| 操作 | 方法 |
|------|------|
| 新建片段 | 点击 **New** 按钮，或 `Ctrl+N`，填写标题、分组、内容 |
| 复制内容 | 点击卡片 **Copy** 按钮，或用 `↑↓` 选中卡片后按 `Enter` |
| 编辑片段 | 双击卡片 |
| 删除片段 | 点击 **Del** → 确认 |
| 搜索 | `Ctrl+F` 聚焦搜索框，输入关键词实时过滤 |
| 切换分组 | 点击搜索框下方的分组芯片，或 `← →` 键 |
| 新建分组 | 点芯片栏 `+` 按钮 → 输入名称 → 确定 |
| 重命名 / 删除分组 | 右键分组标题或芯片 → Rename / Delete |
| 导出数据 | `Ctrl+Shift+E`，选择保存路径 |
| 导入数据 | `Ctrl+Shift+I`，选择 JSON 文件 |
| 更改存储目录 | `Ctrl+Shift+D`，选择文件夹，数据自动迁移 |
| 退出程序 | 右键托盘图标 → **Exit** |

> 窗口 ✕ 是隐藏到托盘，不是退出。

---

## 快捷键速查

### 全局

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+Shift+V` | 唤出/隐藏 OneClip（应用运行时）；启动 OneClip（未运行时） |

### 窗口内

| 快捷键 | 作用 |
|--------|------|
| `Ctrl+N` | 新建片段 |
| `Ctrl+F` | 聚焦搜索框 |
| `Ctrl+Shift+E` | 导出 |
| `Ctrl+Shift+I` | 导入 |
| `Ctrl+Shift+D` | 更改数据目录 |
| `← →` | 切换分组芯片 |
| `↑ ↓` | 导航卡片选中 |
| `Enter` | 复制选中卡片 |
| `Esc` | 取消选中 / 清除搜索 |

### 编辑弹窗

| 快捷键 | 作用 |
|--------|------|
| `↓ / Enter` | 下一字段（Title → Group → Content） |
| `↑` | 上一字段 |
| `Enter`（在 Content） | 保存（等同于 Ctrl+Enter） |
| `Shift+Enter`（在 Content） | 换行 |
| `Ctrl+Enter` | 保存 |
| `Esc` | 取消 |
| `▾`（Group 右侧） | 展开所有已有分组供选择 |

---

## 技术栈

| 层 | 技术 |
|----|------|
| 运行时 | Electron 34 |
| 语言 | HTML + CSS + 原生 JavaScript |
| 生产依赖 | **零**（Tray、clipboard、globalShortcut、fs 全部内置） |
| 打包 | electron-builder (NSIS) |
| 图标 | SVG 源 → 隐藏 BrowserWindow Canvas 渲染 → PNG + 多尺寸 ICO |

---

## 项目结构

```
OneClip/
├── src/
│   ├── main/           # 主进程 — 生命周期、托盘、存储、IPC、图标生成、快捷键注册
│   │   ├── index.js        # 窗口 / 单实例 / 生命周期
│   │   ├── tray.js         # 托盘图标与菜单
│   │   ├── storage.js      # JSON 读写、片段 CRUD、分组管理、导入导出
│   │   ├── ipc-handlers.js # 24 个 IPC 通道
│   │   ├── icons.js        # SVG → PNG/ICO 自动生成
│   │   └── shortcut.js     # OS 级快捷键注册（开始菜单快捷方式）
│   ├── preload/        # contextBridge 安全桥接
│   └── renderer/       # 渲染进程 — HTML + CSS + JS
│       ├── index.html
│       ├── css/style.css
│       └── js/（app / snippet-list / editor / search）
├── assets/             # SVG 源图标 + 自动生成的 PNG/ICO
├── docs/               # 架构书 + 使用说明书
├── dist/               # 构建产物
└── package.json
```

---

## 开发

```bash
npm start              # 开发运行
npm run build:win      # 打包 Windows NSIS 安装包
npm run build:mac      # 打包 macOS DMG
npm run build:linux    # 打包 Linux AppImage/deb
```

### 更换图标

替换 `assets/hugeicons--quill-write-02.svg` → 删除 `assets/icon.png` `assets/icon.ico` `assets/tray-icon.png` → 重启 `npm start`，自动重新生成全部尺寸。

---

## 许可

MIT

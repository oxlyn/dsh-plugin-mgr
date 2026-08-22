# dsh-plugin-mgr

[![npm version](https://img.shields.io/npm/v/dsh-plugin-mgr.svg)](https://www.npmjs.com/package/dsh-plugin-mgr)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](#license)

> DeepSeek Harness (DSH) 插件：在 设置 → 插件 页面新增「插件管理」子页面——卡片式管理已安装插件，支持启停切换、详情查看与卸载。
>
> 中文 ｜ [EN](README_EN.md)

![插件管理面板](snapshot1.png)

![插件详情](snapshot2.png)

## 功能 / Features

| # | 形式 | 说明 |
|---|------|------|
| 1 | 已安装插件列表 | 卡片式布局，支持 单列 / 双列 切换（记忆偏好）；显示名称、版本、运行状态、启停开关 |
| 2 | 启动 / 停止 | 通过 profile 用户补丁层（`cordis.patch.yml`）写入 `disabled: true/false`，HMR 约 1s 热生效，跨重启保留 |
| 3 | 详情展开 | 点卡片展开：版本 / 安装来源（npm·GitHub·本地分类 + 版本范围 + 可点击的仓库地址）/ 插件介绍 |
| 4 | 卸载 | 展开详情中的卸载按钮（二次确认），先清理启停行再执行 `dsh plugin --profile <name> remove <pkg>` |

**特性一览：**

- 现代化卡片 UI，设计语言对齐 DSH 官方设置卡片（bg-layer-3 卡面、12px 圆角、hover 提亮）
- 明暗主题适配（全部取主题 CSS 变量），中英双语（语言跟随 harness 设置即时切换）
- 刷新带明确反馈：按钮态变化 + 「列表已刷新 · 时间」横幅
- 安全防护：宿主基础设施模块拒绝启停/卸载；插件管理器自身开关与卸载置灰（悬停提示"本插件"），host 侧 API 双重校验
- 补丁层写入做了串行化（防并发交错）、空 `[]` 占位恢复（防 profile 无法启动）、非法 YAML 拒绝写入
- POST 接口校验 `Content-Type: application/json`（CSRF 门卫）+ 64KB 请求体上限

## 实现方式 / How it works

插件分为 host 侧与 client 侧两部分（`package.json` 的 `dsh.client` 字段声明 client 入口）：

```
┌─ host 侧  src/index.ts → dist/index.js ─────────────────────────┐
│  ctx.webServer.register：                                          │
│    GET  /api/plugin-manager/list     读取 profile 依赖+补丁层状态    │
│    POST /api/plugin-manager/toggle   启停（写 cordis.patch.yml）    │
│    POST /api/plugin-manager/uninstall spawn dsh plugin remove      │
│  profile 定位：loader 的 cordis:include entry 实际路径              │
└──────────────────────────────────────────────────────────────────┘
                          │ fetch (JSON)
┌─ client 侧 src/client.js（浏览器端模块）───────────────────────────┐
│  settings.plugins.tab slot 注入「插件管理」tab                      │
│  React 卡片列表 + switch + 手风琴详情；locale 服务注册 zh/en 词典    │
└──────────────────────────────────────────────────────────────────┘
```

启停机制（与 dshmarket / dsh-plugin-hub 的 plugin console 同源）：profile 用户补丁层逐行覆盖语义，`- id: X` + `disabled: true` 停用、`disabled: false` 强制启用，DSH 配置热重载（HMR）约 1s 内重新组合插件树。

## 安装 / Install

### npm 安装（推荐）

```sh
dsh plugin --profile web add dsh-plugin-mgr
```

### 源码 / GitHub 安装

```sh
git clone https://github.com/<你的用户名>/dsh-plugin-mgr.git
cd dsh-plugin-mgr && pnpm install && pnpm run build

# 在插件父目录执行（dsh plugin add 相对路径锚定调用目录）：
cd ..
dsh plugin --profile web add ./dsh-plugin-mgr
dsh web
# 启动日志应出现：[dsh-plugin-mgr] ready — routes GET /api/plugin-manager/list ...
```

GitHub 直装（自动跑 prepare 构建出 dist）：

```sh
dsh plugin --profile web add github:<你的用户名>/dsh-plugin-mgr
```

### 验证 / Verify

打开 `dsh web` → 设置 → 插件 → 「插件管理」tab，应能看到已安装插件卡片。

## 环境要求 / Requirements

- Node `^22.19.0 || >=24.0.0`（DSH 宿主要求）
- pnpm（源码构建用）

## 开发 / Development

```sh
pnpm install
pnpm run typecheck   # 类型检查
pnpm run build       # 构建 dist/
```

项目结构：

```
dsh-plugin-mgr/
├── src/index.ts          # host 侧：list/toggle/uninstall 三条路由 + 补丁层读写
├── src/client.js         # client 侧：插件管理 tab（卡片 UI + 中英词典）
├── cordis.patch.yml      # bundle 层声明（id/name 走包名解析）
└── dist/                 # 构建产物（npm 发布包含在 files 字段中）
```

## License

[MIT](LICENSE)

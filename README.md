# dsh-plugin-mgr

> DeepSeek Harness (DSH) 插件：在 设置 → 插件 页面新增「已安装管理」子页面——列出 profile 中已安装的插件，支持启动/停止切换与卸载。

## 功能

| # | 功能 | 说明 |
|---|------|------|
| 1 | 已安装列表 | 插件包名 / 版本 / 安装来源（registry、link:、git 等）/ 运行状态 |
| 2 | 启动 / 停止 | 通过 profile 用户补丁层（`cordis.patch.yml`）写入 `disabled: true/false`，DSH HMR 约 1s 内热生效，跨重启保留 |
| 3 | 卸载 | 先清理该插件的启停行，再执行 `dsh plugin --profile <name> remove <pkg>` |

安全约束：宿主基础设施模块（webserver / settings / loader 链路等）拒绝启停与卸载；纯 client 插件（无 bundle 行）标记为「不可启停」；卸载自身需要二次确认。

## 实现

- **host 侧 `src/index.ts`**：三条 HTTP 路由（`/api/plugin-manager/list|toggle|uninstall`）。profile 定位优先取 loader 的 `cordis:include` entry 实际路径（宿主自有 profile 目录也正确）；补丁层写入做了序列化（防并发交错）、占位符恢复（防纯注释文件导致 profile 无法启动）、非法 YAML 拒绝写入。
- **client 侧 `src/client.js`**：通过官方插件设置页暴露的 `settings.plugins.tab` slot 注册「已安装管理」tab，React 渲染表格与操作按钮。

## 安装

```sh
dsh plugin --profile web add dsh-plugin-mgr   # npm（发布后）
dsh plugin --profile webdev add ./dsh-plugin-mgr   # 源码（在父目录执行）
```

## 开发

```sh
pnpm install && pnpm run build
```

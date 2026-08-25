// 样式表：一次性注入 <style>；类名 dshpm- 前缀隔离，不污染宿主。
//
// 设计语言对齐 DSH 官方设置卡片（ui-settings-plugins 的 Card.module.css）：
// bg-layer-3 卡面 + border-l2 1px 边框 + 12px 圆角 + .16s 过渡 + hover 提亮边框；
// 展开态切 bg-layer-2 并提亮边框。卡片行：图标 + 名称 + 状态文本 + switch；
// 点箭头展开详情（版本 / 安装来源 / 插件介绍 / 卸载按钮）。

export const CSS = `
/* 布局：根容器限高（JS 按宿主滚动容器计算），只有列表区滚动。
   不用 sticky —— 所有元素保持透明，直接复用宿主主题背景，深浅色天然一致 */
.dshpm-root { display:flex; flex-direction:column; gap:12px; color:var(--dsw-alias-label-primary,#333); overflow:hidden; }
.dshpm-toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; flex:none; }
/* 列表滚动区：占满剩余高度，内部滚动；overscroll 防止滚到底带动外层页面 */
.dshpm-list-area { flex:1 1 auto; min-height:0; overflow-y:auto; overscroll-behavior:contain; }
.dshpm-meta { font-size:13px; color:var(--dsw-alias-label-tertiary,#888); margin-right:auto; }
.dshpm-seg { display:inline-flex; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:8px; overflow:hidden; }
.dshpm-seg-btn { border:none; background:transparent; padding:4px 10px; font-size:12px; line-height:18px; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:color .16s,background .16s; display:inline-flex; align-items:center; justify-content:center; }
.dshpm-seg-btn:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-seg-btn.is-active { background:var(--dsw-alias-button-primary-fill,#4f46e5); color:var(--dsw-alias-label-primary-foreground,#fff); }
.dshpm-seg-btn svg { width:14px; height:14px; display:block; }
/* 可折叠搜索框：默认 28px 圆形图标按钮，点击后容器向左滑开到 190px。
   展开态最左是搜索图标（input 让出 padding-left），有内容时右侧出现清除按钮 */
.dshpm-search { flex:none; }
.dshpm-search-box { position:relative; display:flex; align-items:center; box-sizing:border-box; width:28px; height:28px; border:1px solid transparent; border-radius:999px; background:transparent; overflow:hidden; transition:width .25s ease,border-color .16s,background .16s,box-shadow .16s; }
.dshpm-search.is-open .dshpm-search-box { width:190px; border-color:var(--dsw-alias-border-l2,#ddd); background:var(--dsw-alias-bg-layer-1,#f5f5f5); }
.dshpm-search.is-open .dshpm-search-box:focus-within { border-color:var(--dsw-alias-state-business-primary,#1967d2); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-state-business-primary,#1967d2) 18%, transparent); }
.dshpm-search-box input[type="text"] { box-sizing:border-box; width:100%; min-width:0; border:none; outline:none; background:transparent; color:var(--dsw-alias-label-primary,#333); font-size:12px; line-height:18px; padding:0 24px 0 30px; opacity:0; pointer-events:none; transition:opacity .18s ease; }
.dshpm-search.is-open .dshpm-search-box input[type="text"] { opacity:1; pointer-events:auto; }
.dshpm-search-box input[type="text"]::placeholder { color:var(--dsw-alias-label-tertiary,#888); }
/* 左侧搜索图标：折叠态即整个控件（可点展开），展开态点击=聚焦输入框 */
.dshpm-search-icon { position:absolute; left:0; top:0; width:26px; height:26px; display:flex; align-items:center; justify-content:center; border:none; background:transparent; padding:0; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:color .16s; flex:none; }
.dshpm-search-icon:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-search-icon svg { width:15px; height:15px; display:block; }
/* 右侧清除按钮：仅展开且有内容时渲染 */
.dshpm-search-clear { position:absolute; right:4px; width:20px; height:20px; display:flex; align-items:center; justify-content:center; border:none; border-radius:50%; background:transparent; padding:0; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:color .16s,background .16s; flex:none; }
.dshpm-search-clear:hover { color:var(--dsw-alias-label-primary,#333); background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06)); }
.dshpm-search-clear svg { width:12px; height:12px; display:block; }
/* 两按钮之间的分隔竖线。span 默认 inline、width 不生效，必须显式 block；
   1px 在部分渲染下过细，用 2px + label-dimmed 保证可见 */
.dshpm-seg-divider { display:block; width:2px; align-self:stretch; background:var(--dsw-alias-label-dimmed,#999); }
.dshpm-list { display:grid; grid-template-columns:minmax(0,1fr); align-items:start; gap:10px; list-style:none; margin:0; padding:0; }
.dshpm-root.is-cols-2 .dshpm-list { grid-template-columns:repeat(2, minmax(0,1fr)); }
/* 单列时横条更扁：收紧行距 + 缩小图标 */
.dshpm-root:not(.is-cols-2) .dshpm-row { padding:7px 16px; }
.dshpm-root:not(.is-cols-2) .dshpm-icon { width:28px; height:28px; border-radius:8px; }
.dshpm-root:not(.is-cols-2) .dshpm-icon svg { width:15px; height:15px; }
/* 双列下卡片更紧凑：隐藏状态文字（switch 已表达状态）和插件图标，给名称留足空间 */
.dshpm-root.is-cols-2 .dshpm-state { display:none; }
.dshpm-root.is-cols-2 .dshpm-icon { display:none; }
.dshpm-root.is-cols-2 .dshpm-row { padding:10px 14px; gap:10px; }
.dshpm-root.is-cols-2 .dshpm-detail { padding:8px 14px 12px 14px; }
.dshpm-card { display:flex; flex-direction:column; border:1px solid var(--dsw-alias-border-l2,#e2e2e2); background:var(--dsw-alias-bg-layer-3,#fff); border-radius:12px; transition:border-color .16s,background .16s; }
.dshpm-card:hover { border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-card.is-open { background:var(--dsw-alias-bg-layer-2,#fafafa); border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-row { display:flex; align-items:center; gap:12px; padding:12px 16px; cursor:pointer; user-select:none; min-width:0; }
.dshpm-arrow { flex:none; width:20px; height:20px; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--dsw-alias-label-tertiary,#888); transition:transform .16s,color .16s; }
.dshpm-arrow:hover { color:var(--dsw-alias-label-primary,#333); }
.dshpm-arrow.is-open { transform:rotate(180deg); }
.dshpm-arrow svg { width:14px; height:14px; display:block; }
.dshpm-icon { width:36px; height:36px; border-radius:10px; flex:none; display:flex; align-items:center; justify-content:center; color:var(--dsw-alias-label-secondary,#555); transition:opacity .16s; }
.dshpm-icon svg { width:18px; height:18px; display:block; }
.dshpm-card.is-off .dshpm-icon { opacity:.5; }
.dshpm-name { font-size:13px; font-weight:600; color:var(--dsw-alias-label-primary,#333); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.dshpm-card.is-off .dshpm-name { color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-actions { margin-left:auto; display:flex; align-items:center; gap:12px; flex:none; }
.dshpm-state { font-size:11px; line-height:17px; white-space:nowrap; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-state.is-on { color:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-state.is-err { color:var(--dsw-alias-state-error-primary,#d32f2f); font-weight:600; }
/* 小圆角标签：来源分类（中性）与「可更新」徽标（信息蓝）共用底样式 */
.dshpm-pill { display:inline-flex; align-items:center; padding:0 8px; border:1px solid var(--dsw-alias-border-l2,#ddd); border-radius:999px; font-size:11px; line-height:17px; white-space:nowrap; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-pill.is-update { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); }
/* 最新版本行里跟在版本号后的发布时间（弱化色，非等宽） */
.dshpm-published { color:var(--dsw-alias-label-tertiary,#888); font-family:inherit; font-weight:400; }
.dshpm-switch { display:inline-block; box-sizing:border-box; width:36px; height:20px; border-radius:10px; padding:2px; cursor:pointer; background:var(--dsw-alias-label-tertiary,#888); transition:background .16s; flex:none; }
.dshpm-switch.is-on { background:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-switch.is-busy { opacity:.5; cursor:wait; }
.dshpm-switch.is-frozen { opacity:.4; cursor:not-allowed; }
.dshpm-knob { display:block; width:16px; height:16px; border-radius:50%; background:#fff; box-shadow:0 1px 2px rgba(0,0,0,.2); transition:transform .16s; }
.dshpm-switch.is-on .dshpm-knob { transform:translateX(16px); }
.dshpm-detail { border-top:1px solid var(--dsw-alias-border-l2,#eee); padding:10px 16px 14px 48px; display:flex; flex-direction:column; gap:4px; }
.dshpm-field { display:flex; gap:10px; font-size:12px; line-height:1.6; }
.dshpm-field-key { flex:none; width:60px; color:var(--dsw-alias-label-tertiary,#888); }
.dshpm-field-val { color:var(--dsw-alias-label-primary,#333); word-break:break-all; min-width:0; }
.dshpm-field-val.is-code { font-family:var(--ds-font-family-code,monospace); }
.dshpm-repo-link { color:var(--dsw-alias-state-info-primary,#1967d2); text-decoration:none; font-size:12px; word-break:break-all; }
.dshpm-repo-link:hover { text-decoration:underline; }
.dshpm-detail-actions { display:flex; justify-content:flex-end; align-items:center; gap:16px; margin-top:8px; }
.dshpm-btn { border-radius:8px; padding:5px 14px; font-size:13px; line-height:1.5; cursor:pointer; border:1px solid var(--dsw-alias-border-l2,#ddd); color:var(--dsw-alias-label-secondary,#555); background:transparent; white-space:nowrap; transition:color .16s,border-color .16s,background .16s; }
.dshpm-btn:hover:not(:disabled) { color:var(--dsw-alias-label-primary,#333); border-color:var(--dsw-alias-label-dimmed,#999); }
.dshpm-btn:disabled { opacity:.5; cursor:not-allowed; }
.dshpm-btn-danger { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); }
.dshpm-btn-danger:hover:not(:disabled) { color:var(--dsw-alias-state-error-primary,#d32f2f); border-color:var(--dsw-alias-state-error-primary,#d32f2f); background:var(--dsw-alias-state-error-bg,#fce8e6); }
/* 更新按钮：信息蓝（与「可更新」徽标同色系），与右侧卸载按钮拉开间距 */
.dshpm-btn-update { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); }
.dshpm-btn-update:hover:not(:disabled) { color:var(--dsw-alias-state-info-primary,#1967d2); border-color:var(--dsw-alias-state-info-primary,#1967d2); background:var(--dsw-alias-state-info-bg,#e8f0fe); }
.dshpm-banner { font-size:12px; line-height:1.6; padding:8px 12px; border-radius:8px; word-break:break-all; }
.dshpm-banner-ok { background:var(--dsw-alias-state-success-bg,#e6f4ea); color:var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-banner-err { background:var(--dsw-alias-state-error-bg,#fce8e6); color:var(--dsw-alias-state-error-primary,#d32f2f); white-space:pre-wrap; }
/* Toast 通知容器：固定在视口正中央，不随页面滚动 */
.dshpm-toast-container { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); z-index:10000; display:flex; flex-direction:column-reverse; gap:8px; pointer-events:none; align-items:center; }
.dshpm-toast { pointer-events:auto; font-size:13px; line-height:1.5; padding:10px 16px; border-radius:10px; box-shadow:0 4px 12px rgba(0,0,0,.15); word-break:break-all; max-width:360px; animation:dshpm-toast-in .3s ease-out; transition:opacity .3s,transform .3s; }
.dshpm-toast.is-leaving { opacity:0; transform:translateY(10px); }
.dshpm-toast-ok { background:var(--dsw-alias-state-success-bg,#e6f4ea); color:var(--dsw-alias-state-success-primary,#1e8e3e); border:1px solid var(--dsw-alias-state-success-primary,#1e8e3e); }
.dshpm-toast-err { background:var(--dsw-alias-state-error-bg,#fce8e6); color:var(--dsw-alias-state-error-primary,#d32f2f); border:1px solid var(--dsw-alias-state-error-primary,#d32f2f); white-space:pre-wrap; display:flex; align-items:flex-start; gap:12px; }
.dshpm-toast-close { flex:none; width:18px; height:18px; display:flex; align-items:center; justify-content:center; cursor:pointer; opacity:.6; transition:opacity .16s; border:none; background:transparent; padding:0; color:inherit; }
.dshpm-toast-close:hover { opacity:1; }
.dshpm-toast-close svg { width:14px; height:14px; display:block; }
@keyframes dshpm-toast-in { from { opacity:0; transform:translateY(10px); } to { opacity:1; transform:translateY(0); } }
.dshpm-empty { padding:40px 16px; text-align:center; color:var(--dsw-alias-label-tertiary,#999); border:1px dashed var(--dsw-alias-border-l2,#e2e2e2); border-radius:12px; font-size:13px; }
.dshpm-loading { padding:32px 0; text-align:center; color:var(--dsw-alias-label-tertiary,#999); font-size:13px; }
.dshpm-hint { font-size:12px; color:var(--dsw-alias-label-tertiary,#888); }
`;

/** 往 <head> 注入样式表（幂等）。 */
export function ensureCss() {
    const id = "dsh-plugin-mgr-style";
    if (document.getElementById(id)) return;
    const el = document.createElement("style");
    el.id = id;
    el.textContent = CSS;
    document.head.appendChild(el);
}

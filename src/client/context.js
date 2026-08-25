// 平台桥：把 ModuleLoader 工厂注入的运行时 require 转成可按需调用的取用器。
//
// 为什么需要它：bundle 后的模块在工厂执行前就会求值，而平台依赖（react、
// @deepseek-ai/dsh-client-ui-primitives）只有工厂里的 require 才能解析。
// 所以业务模块一律通过本模块的惰性取用器访问平台能力，禁止直接 require。

let platformRequire = null;
let reactModule = null;
let primitives; // undefined = 未探测；{ Modal, Button }

/** 在 boot() 里绑定工厂参数；此后各模块才能取用平台模块。 */
export function bindPlatformRequire(requireFn) {
    platformRequire = requireFn;
}

function req(id) {
    if (platformRequire === null) {
        throw new Error("dsh-plugin-mgr: platform require 尚未绑定（boot 未被调用）");
    }
    return platformRequire(id);
}

/** react 模块（首次取用后缓存）。 */
export function react() {
    if (reactModule === null) reactModule = req("react");
    return reactModule;
}

/** createElement 快捷方式。 */
export function h(type, props, ...children) {
    return react().createElement(type, props, ...children);
}

/** 常用 hooks 集合（组件函数体内调用，勿在模块顶层使用）。 */
export function hooks() {
    const R = react();
    return {
        useState: R.useState,
        useEffect: R.useEffect,
        useCallback: R.useCallback,
        useRef: R.useRef,
        Fragment: R.Fragment,
    };
}

/**
 * 平台 UI 原语（Modal/Button，dshmarket 同款确认框）。
 * 老宿主没有该模块或形状不符时返回 null 成员，调用方回退原生 confirm。
 * 结果缓存：探测一次。
 */
export function uiPrimitives() {
    if (primitives === undefined) {
        try {
            const p = req("@deepseek-ai/dsh-client-ui-primitives");
            primitives = {
                Modal: typeof p.Modal === "function" ? p.Modal : null,
                Button: typeof p.Button === "function" ? p.Button : null,
            };
        } catch {
            primitives = { Modal: null, Button: null };
        }
    }
    return primitives;
}

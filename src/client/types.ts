// dsh-plugin-mgr — client 侧最小类型声明。
//
// 与 @deepseek-ai/dsh-client-runtime 的对外接口解耦：按本插件实际用到的
// 最小面声明（locale、slots、effect）。宿主若接口扩展，本包无需重编。

export interface DictionaryEntry {
  [key: string]: string
}

export interface LocaleService {
  register(namespace: string, dicts: { zh: DictionaryEntry; en: DictionaryEntry }): void
  bind(namespace: string): (key: string, ...args: unknown[]) => string
  subscribe(cb: () => void): () => void
}

export interface SlotDescriptor {
  name: string
  id: string
  order?: number
  label?: () => string
  locale?: string
}

export interface SlotRegistry {
  register(descriptor: SlotDescriptor, render: () => unknown): () => void
  inject(name: string, factory: () => unknown): void
}

export interface ClientContext {
  effect(fn: () => void | (() => void), label?: string): void
  locale: LocaleService
  slots: SlotRegistry
}

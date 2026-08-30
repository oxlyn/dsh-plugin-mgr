// dsh-plugin-mgr — 单测专用导出（构建为 dist/internal.js）。
//
// 不进 package.json exports：内部纯逻辑只供 test/ 通过相对路径
// import '../dist/internal.js' 使用，公共入口 index.ts 不再暴露 _internal。

import {
  readUserPatchState,
  appendPatchEntry,
  prepareAppend,
  rowBlock,
  withPlaceholderRestored,
  escapeRegExp,
  disableRows,
  enableRows,
  removeRowBlocks,
} from './server/patch-layer.js'
import { failureText } from './server/lifecycle.js'
import { chooseIncludeLayer, locateProfile } from './server/paths.js'
import { parseNpmrcRegistry, compareSemver, publishTimeOf } from './server/registry.js'
import { cleanRepoUrl, sourceTypeOf, SELF_NAME } from './server/inspect.js'
import { isSameOrigin, isValidPackageName } from './server/http.js'

export const _internal = {
  // patch-layer
  readUserPatchState,
  appendPatchEntry,
  prepareAppend,
  rowBlock,
  withPlaceholderRestored,
  escapeRegExp,
  disableRows,
  enableRows,
  removeRowBlocks,
  // inspect
  cleanRepoUrl,
  sourceTypeOf,
  SELF_NAME,
  // registry
  parseNpmrcRegistry,
  compareSemver,
  publishTimeOf,
  // paths
  chooseIncludeLayer,
  locateProfile,
  // lifecycle
  failureText,
  // http
  isSameOrigin,
  isValidPackageName,
}

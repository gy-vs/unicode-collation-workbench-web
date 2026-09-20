# Unicode 排序与检索工作台

在同一组字符串上比较 **locale、灵敏度（sensitivity）与数字排序（numeric）**
对排序和子串检索的影响。浏览器中编辑样本与查询，服务端保存带 `revision`
的实验并生成稳定结果。不是通用报表或数据看板。

技术栈：TypeScript · React 18 · Express 4 · Vite · Vitest。仅使用平台
`Intl`（`Intl.Collator`、`Intl.Segmenter`、`toLocaleLowerCase`），
不引入任何搜索服务。

## 快速开始

```bash
npm install
npm run dev        # API(tsx watch): 3001，Vite: 5173（/api 已代理）
# 生产形态
npm run build && npm start
npm test
```

打开 http://localhost:5173 。首次启动内置一个 `demo` 实验，覆盖：

- 预组合字符与分解形式（`café` vs `café`，含 U+0301 组合符）
- 代理对与 emoji（`𝕦𝕟𝕚𝕔𝕠𝕕𝕖`、`😀`）
- 土耳其语大小写（`İ` → `i`、`I` → `ı`，locale `tr`）
- 数字片段（`File 2` / `File 10`，numeric 开关）
- 排序并列（`sensitivity: base` 下多个 café 变体键值相等）

## 关键设计

### 高亮范围不漂移（`src/lib/unicode.ts`）

`Intl.Collator` 只告诉我们两个字符串是否相等，不告诉我们*哪些字符*匹配。
朴素做法是先 `toLowerCase` + 去音符再 `indexOf`，但组合字符和代理对会让
匹配位置映射回原串时错位。

本模块用 `Intl.Segmenter`（extended grapheme cluster）逐簇处理：

```
原文 → 字形簇 → NFC → 按 locale 大小写折叠 → NFD 去组合记号(Mn) → NFC
                                         折叠结果的每个 UTF-16 码元
                                         都记录来源簇索引（owner）
```

匹配在折叠串上做 `indexOf`，再经 owner 把折叠偏移映射回**原始**簇边界：
组合序列和代理对永远不会被切成一半。

### 排序与并列决胜

`Intl.Collator.compare` 做稳定排序；比较相等时按**原始样本 id** 升序决胜，
同一结果重复计算顺序一致。连续的相等行形成 tie group，UI 用「并列」标记。

### Revision 与并发保存

- `PUT /api/experiments/:id` 携带 `baseRevision`；服务端只接受当前
  revision，其余返回 `409 { error:'REVISION_CONFLICT', server }`。
- 页面不会丢弃本地更改：弹出三路合并对话框（`src/lib/merge.ts`），
  base（本标签页编辑的快照）/ local / server。互不冲突的字段与样本
  自动合并，真正的冲突（双方改了同一字段/同一行、删除对编辑、同 id 新增）
  逐项选择保留本地或服务器版本，合并后基于获胜 revision 保存。
- 标签页间用 `BroadcastChannel` 广播已保存事件；干净标签页直接采用新版本，
  有本地编辑的标签页显示提示并在保存时合并。

### 状态不重置

- 选中项按样本 id 存放在 `Set` 中，重排/灵敏度切换只改变行的位置。
- 窄屏（≤760px）编辑/结果用标签切换，两个面板始终挂载，仅切换
  `display`，输入、查询与选中状态都保留。

### 稳定结果

编辑时浏览器用**同一个引擎**实时求值；`GET`/保存成功响应中包含服务端
生成的 `results`，作为该 revision 的稳定快照。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/experiments` | 列表（id/name/revision） |
| POST | `/api/experiments` | 新建 |
| GET | `/api/experiments/:id` | 实验 + 服务端稳定结果 |
| PUT | `/api/experiments/:id` | `{ baseRevision, content }` 条件保存，409 见上 |

样本 id 是稳定行 id：编辑文本不变，删除行不复用；新增取
`nextSampleId`（服务端校验唯一性与单调性）。

## 已知边界（如实记录）

- `Straße` 的大小写折叠在多数 locale 下不会变成 `strasse`（那是 collation
  的特殊等价，不是字符折叠）。范围精确的字面子串检索因此不匹配
  `ß`/`ss`；排序层面 `Intl.Collator` 仍按 locale 规则处理。
- 合字 `ﬁ`（U+FB01）不参与 NFD 分解，字面搜索 `file` 不命中 `ﬁle`，
  高亮也不会虚假地声称匹配。

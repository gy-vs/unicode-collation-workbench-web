# Unicode 排序与检索工作台

比较不同 locale、灵敏度与数字排序配置对同一组字符串的影响。浏览器编辑样本与查询，
服务端保存带 revision 的实验并生成稳定结果。仅基于平台 `Intl` 与 Unicode API，无搜索服务。

## 运行

```bash
npm install
npm run dev        # 服务端 :3001 + Vite :5173（/api 代理到服务端）
npm test           # Vitest：匹配/排序/API 并发
npm run build      # 类型检查 + 客户端构建
npm start          # 生产模式：:3001 托管 API 与 dist/
```

服务端默认内存存储；设 `DATA_FILE=data/experiments.json` 可持久化到文件。

## 关键设计

**高亮范围不漂移**（`shared/match.ts`）：按字素簇（`Intl.Segmenter`）切分原串，逐簇做
规范化 → 大小写折叠 → 变音符剥离，并为每个输出 code unit 记录它在**原始字符串**中的
区间。匹配在变换后的文本上进行，命中范围经映射表回到原串——组合序列、代理对、
土耳其 `İ→i̇` 这类长度变化都不会让高亮落到错误字符。范围是 UTF-16 code unit
半开区间，前端直接 `slice` 渲染。

**稳定排序**（`shared/sort.ts`）：`Intl.Collator` 比较相等时按样本 id 升序决胜，
结果与输入顺序无关。结果由服务端生成（`POST /api/results/preview` 预览未保存内容，
`GET /api/experiments/:id/results` 取已保存内容），同一载荷输出恒定。

**乐观并发**（`server/src/store.ts`）：保存需带 `baseRevision`，不匹配返回
`409 + 服务端当前版本`。前端保留本地更改，弹出差异对话框：名称/配置逐项对比、
样本与查询按 id 分「本地新增 / 本地已删 / 双方修改」，可选自动合并（并集，冲突时
本地优先）、本地覆盖、或采用服务端。

**前端状态**：选中项是样本 id 的集合，与排序结果解耦，重排不丢选中；窄屏
（≤760px）下编辑/结果面板保持挂载、仅切换可见性，切换标签页不重置任何状态。

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/experiments` | 实验摘要列表 |
| POST | `/api/experiments` | 创建（空体 = 种子数据），返回 r1 |
| GET | `/api/experiments/:id` | 读取实验 |
| PUT | `/api/experiments/:id` | 保存，需 `baseRevision`；冲突 409 |
| DELETE | `/api/experiments/:id` | 删除 |
| GET | `/api/experiments/:id/results` | 已保存实验的稳定结果 |
| POST | `/api/results/preview` | 对未保存载荷生成结果，不落库 |

## 测试覆盖（`tests/`）

- 组合字符：预组合/分解互配、规范化膨胀后范围不漂移
- 代理对：emoji+肤色修饰符、辅助平面字符的 code unit 偏移
- 土耳其大小写：`I→ı`、`İ` 折叠（兼容 ICU 版本差异）
- 数字片段：`numeric` 开/关的 file1/file2/file10
- 排序并列：相等时按 id 决胜、结果与输入顺序无关
- 并发保存：同一 baseRevision 一胜一 409；结果确定性

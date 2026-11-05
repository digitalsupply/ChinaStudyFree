# K12 题目修正 / 删除

学习者在答题反馈里点小旗子 🚩 后，报告会带有题目的 `sourceKey`（例如
`483911bc-...#q1`）。运营/教研把处理决定写进本目录的 JSON，再运行脚本批量应用。

## 流程

1. 学习者在「我的 → 已报告的问题」导出 `cstf-reports-*.json`。
2. 根据报告里的 `sourceKey` 定位题目。
3. 编辑 `k12/corrections/physics-g8.json`。
4. 先 dry-run：

```bash
node scripts/k12/apply-corrections.mjs --dry-run
# 或 npm run k12:apply-corrections
```

5. 确认后写入并重建：

```bash
node scripts/k12/apply-corrections.mjs --write
npm run build:data
npm run validate:quizzes
```

## 修正项格式

```json
{
  "source_key": "483911bc-cda4-4fce-b785-0a57b7ba6524#q1",
  "action": "patch",
  "reason": "学生反馈公式渲染异常",
  "patch": {
    "question": "修正后的题干",
    "explanation": "修正后的解析"
  }
}
```

支持三种动作：

| action | 作用 |
|---|---|
| `delete` | 从题库删除该题 |
| `replace` | 用 `patch` 整体覆盖字段（适合重写题干/选项/答案/解析） |
| `patch` | 只改 `patch` 里的字段（适合改难度、解析、答案） |

`replace` / `patch` 都会合并 `patch.meta`，可以顺带写入修正说明。

## 注意

- `source_key` 在导入时生成，删除/重排题号不会改变它。
- 修改答案后必须重新跑 `validate:quizzes`。
- 删除题目会改变该单元的题量；`apply-corrections` 会自动重排 `id` 和总分。
- 这是离线优先的“后台”方案，不依赖服务器数据库；审核记录本身随 Git 版本化。

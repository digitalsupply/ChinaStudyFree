# K12 生成内容

这里是经过自动校验、但仍需教师审核的 K12 生成内容。它不是 App 的正式题库：
`output/` 才是 `build-data` 读取的源目录，本目录用于版本化、审阅和后续导入。

## physics-g8

初中八年级物理首批试点。

| 项目 | 说明 |
|---|---|
| 来源 | `k12-knowledge-points` 高置信度知识点（confidence ≥ 0.8） |
| 范围 | 12 个正文章节 × 每章 3 个知识点 = 36 个知识点 |
| 题量 | 36 × 4 = 144 道 |
| 模型 | `deepseek-v4.1-flash`（OpenCode Go） |
| 自动校验 | 0 error / 0 warning |
| 状态 | **staging-pending-teacher-review** |

文件：

- `questions.jsonl` — 36 行，每行一个知识点的 4 道题
- `review.csv` — 教师审核表（章节/知识点/题型/难度/题干/答案/解析/迷思）
- `plan.json` — 章节分布与首批 36 个知识点的选择依据
- `validation.json` — 自动校验统计
- `manifest.json` — 批次元数据
- `REPORT.md` — 可读报告与样例

## 重新生成

```bash
# 1. 导入高置信度知识点（需要本地 data/k12-knowledge-points）
npm run k12:import

# 2. 生成八年级物理批次计划
npm run k12:plan -- --stage middle --subject physics --grade 8 --per-chapter 3

# 3. 生成提示词 / 题目
export LLM_BASE_URL=https://opencode.ai/inference/go/openai/v1
export LLM_API_KEY=oc_sk_xxx
export LLM_MODEL=deepseek-v4.1-flash
npm run k12:generate -- --stage middle --subject physics --grade 8 \
  --kp-file data/k12-generated/plan-middle-physics-g8.json \
  --limit 0 --count 4

# 4. 校验
npm run k12:validate -- --file data/k12-generated/physics-g8-ds/questions.jsonl
```

完整 dataset、curated 数据和原始提示词不进入 Git，保留在本地 `data/`。

## 审核后再接入

审核通过后，需要把题目映射到 `output/physics/` 的具体教材/单元，
再运行 `npm run build:data` 和 `npm run validate:quizzes`。不要直接手改
`apps/web/public/data/`，它是构建产物。

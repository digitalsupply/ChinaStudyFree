# K12 知识点出题流水线

这套脚本把 `data/k12-knowledge-points` 的高置信度知识点，规范化为可出题的数据层，并提供
提示词构造、批量生成、质量校验。默认只处理 `confidence >= 0.8` 且可评估性足够的条目。

> 生成结果先进入 `data/k12-generated/`（staging），不会自动改写 `output/` 或前端。
> 经过人工/教师审核后，再由单独的导入步骤写入正式题库。

## 1. 导入高置信度知识点

```bash
node scripts/k12/import-high-confidence.mjs
# 或 npm run k12:import
```

输出：

```text
data/k12-knowledge-points/curated/
  index.json
  primary/<subject>.json
  middle/<subject>.json
  high/<subject>.json
  unsupported.json
```

阈值可调：

```bash
K12_KP_MIN_CONFIDENCE=0.9 node scripts/k12/import-high-confidence.mjs
```

导入时会做：

- 学科映射：语文/数学/英语/物理/化学/生物/历史/地理/思政/通用/科学 → App SubjectId
- 思政在小学/初中映射为 `moral`，高中映射为 `politics`
- 体育/音乐/美术/艺术/俄语/日语暂不进入出题队列，单独归档到 `unsupported.json`
- 解析 `annotations`：知识类型、难度、学习目标、先修、迷思、可评估性
- 解析 `aliases`、教材、章节路径、年级
- 标记同名知识点重复组，供出题去重

当前结果：

```text
源知识点 33765
高置信度 25853
可进入出题队列 22488
暂不支持学科 3365
```

## 2. 先看提示词（dry-run，不需要 API Key）

```bash
node scripts/k12/generate-questions.mjs \
  --stage middle --subject physics --limit 3 --count 5 --dry-run
```

八年级物理试点产物在：

```text
data/k12-generated/physics-g8-pilot/
  questions.jsonl     # 4 个知识点 × 3 题 = 12 道
  review.csv          # 教师审核表
  validation.json     # 自动校验报告
  REPORT.md           # 章节分布、试点题目、后续计划
```

全量八年级物理提示词在：

```text
data/k12-generated/physics-g8/prompts.jsonl   # 351 条
data/k12-generated/plan-middle-physics-g8.json
```

输出 `data/k12-generated/latest/prompts.jsonl`，每个知识点一行，包含：

- `system`：K12 + STEAM + 安全 + JSON only 的通用约束
- `user`：学科画像 + 知识点 + 学习目标 + 先修 + 迷思 + 题型/难度规则 + JSON schema
- `meta`：来源知识点、学段、学科、提示词版本

常用过滤：

```bash
--stage middle|primary|high
--subject math|physics|chemistry|biology|chinese|english|history|geography|moral|politics|computer|science
--grade 8                  # 按年级过滤（可逗号分隔，如 7,8）
--only "欧姆定律"          # 名称/别名包含
--kp-file plan.json        # 使用 plan-batch 输出的推荐批次
--limit 20                 # 默认 20，0 = 全部
--count 5                  # 每知识点题数
--types choice,true_false,fill_blank_text
--min-confidence 0.8
--min-assessability 0.6
```

### 先做批次计划

```bash
node scripts/k12/plan-batch.mjs --stage middle --subject physics --grade 8 --per-chapter 3
# 或 npm run k12:plan -- --stage middle --subject physics --grade 8 --per-chapter 3
```

输出 `data/k12-generated/plan-middle-physics-g8.json`，包含每章知识点数量、难度分布、
推荐首批知识点和 `ids` 数组，可直接传给 `--kp-file`。

当前八年级物理：**351 个高置信度知识点 / 16 个章节**，推荐首批 36 个知识点（12 个正文章节 × 每章 3 个）。

## 3. 生成题目

配置 OpenAI 兼容端点即可。OpenCode Go 的 OpenAI 兼容端点：

```bash
export LLM_BASE_URL=https://opencode.ai/inference/go/openai/v1
export LLM_API_KEY=oc_sk_xxx
# 最便宜的 DS Flash；也可用 glm-5.3-flash / qwen3.8-flash
export LLM_MODEL=deepseek-v4.1-flash
export K12_SESSION_ID=cstf-k12-physics-g8

node scripts/k12/generate-questions.mjs \
  --stage middle --subject physics --grade 8 \
  --kp-file data/k12-generated/plan-middle-physics-g8.json \
  --limit 0 --count 4
# 或 npm run k12:generate -- --stage middle --subject physics --grade 8 --limit 20
```

脚本会发送 `User-Agent: ChinaStudyFree-K12/1.0` 和 `x-opencode-session`，
符合 OpenCode Go 对客户端标识和会话稳定性的要求。

输出：

```text
data/k12-generated/latest/
  questions.jsonl
  errors.jsonl
  run-summary.json
```

`questions.jsonl` 每个知识点一行：

```json
{
  "source_kp_id": "...",
  "source_kp_name": "I-U与I-R实验图像的定量解读",
  "stage": "middle",
  "subject_id": "physics",
  "questions": [
    {
      "id": 1,
      "type": "choice",
      "score": 5,
      "difficulty": 3,
      "knowledge_point": "I-U与I-R实验图像的定量解读",
      "question": "...",
      "options": ["...", "...", "...", "..."],
      "answer": "...",
      "explanation": "...",
      "meta": {
        "cognitive_level": "应用",
        "steam_dimensions": ["S", "M"],
        "steam_context": "...",
        "misconception_target": "...",
        "figure": null,
        "resource_needs": ["formula"]
      }
    }
  ]
}
```

脚本支持断点续跑：已在 `questions.jsonl` 中的 `source_kp_id` 会跳过。

## 4. 校验

```bash
node scripts/k12/validate-questions.mjs
# 或 npm run k12:validate
```

校验内容：

- 结构：题型、字段、选项、答案、分值、难度
- 学科契约：
  - `choice` 4 个不重复选项，答案必须在选项中
  - `true_false` 答案只能是 对/错
  - `fill_blank` / `calculation` 答案必须是数字键盘可输入字符
  - 带单位/中文/表达式的答案必须用 `fill_blank_text`
  - `word_order` 词集合必须与 options 一致
  - `matching` 必须是 8 项 + 4 对
- 质量：解析长度、重复题干、认知层级、STEAM 维度、figure 结构
- 关联：`source_kp_id` 必须存在于 curated 数据

有 error 时退出码为 1，适合接入 CI。

## 5. 提示词设计原则

### 5.1 STEAM 是透镜，不是标签

提示词明确要求：

- 只在真实任务、证据、设计、数据或表达确实需要时使用 STEAM；
- 不强迫每道题都套工程/科技情境；
- 只标注实际使用的维度（S/T/E/A/M）；
- 人文学科优先用数据阅读、真实表达、设计说明、公共说理等自然连接。

### 5.2 学科画像

每个学科有独立的：

- 角色：如“物理教研员 + 实验探究教练”
- 推理要求：如物理的变量控制、单位、误差
- 重点：概念/探究/工程/数据
- 常见陷阱：如“I-U 图像斜率与电阻关系说反”
- 可用题型：避免对学科不合适的题型

### 5.3 认知层级与难度

默认每个知识点生成 5 题：

- 1 道识记
- 1 道理解
- 2 道应用
- 1 道分析或迁移
- 至少 1 道难度 4 或 5

提示词要求解释至少 30 字，并点出对应易错点。

## 6. 图片 / 音频 / 公式 / 图表资源方案

### 公式

优先使用 LaTeX：

- 行内公式：`$...$`
- 前端已有 `katex` / `react-katex`，可直接渲染
- 物理/化学/数学题不要把公式做成图片
- 化学式、方程式用标准符号；避免依赖图片中的上下标

如果出现复杂公式渲染问题：

- 用 KaTeX 做构建期校验（渲染失败即报错）
- 必要时退化为纯文本表达式，但答案仍保持可判定

### 图片 / 示意图

不要让 LLM 直接生成图片或 base64。提示词要求：

```json
"figure": {
  "type": "table | chart | diagram",
  "alt": "给屏幕阅读器的描述",
  "spec": { "...": "结构化数据" }
}
```

后续方案：

1. **表格 / 统计图**：用结构化 `spec` + 前端 SVG 组件渲染，离线、可缩放、可访问。
2. **几何/电路/示意图**：用结构化 `spec` 生成 SVG；复杂图用人工模板。
3. **真实照片/插画**：优先使用开放许可素材（Wikimedia Commons、PhET 等），记录来源与许可证；或使用 Gemini 生图，但必须人工审核且不进入必须离线包的核心题。
4. **教材原页**：已有 `textbook-pages` 管线，按页渲染 JPG；注意版权与离线包体积。

### 音频

项目明确不使用系统语音。方案：

1. **预生成音频**：`scripts/tts/generate-audio.mjs`，按文本 sha1 寻址，离线最佳。
2. **在线 TTS**：`/api/ai/tts`，DashScope 或免费 EdgeTTS。
3. **完全离线**：需要本地 TTS（Piper / Coqui 等）或提前批量生成；推荐预生成 + 打包。
4. **成本控制**：先只给题干和解析生成音频；选项和 UI 短句复用缓存；按学科/年级分批。

### 数学/物理特殊资源

- 计算题：参数化生成，答案由程序计算，模型只负责题干与解析。
- 单位：题干带单位，`answer` 只写数值；需要单位时用 `fill_blank_text`。
- 图象题：用 `figure.spec` 给数据点/坐标轴，前端渲染；不要让模型“想象”一张图。
- 误差/有效数字：在解析中说明，不要求模型做超出课标的精度判断。

## 7. 接入正式题库的路径

八年级物理批次已经自动接受并导入：

```bash
npm run k12:import-output -- --write
npm run build:data
npm run validate:quizzes
npm run build:web
```

导入会生成独立的 `K12知识图谱` 版本（`physics-k12-g8up` / `physics-k12-g8down`），
不覆盖原教材。

后台修正 / 删除：

```bash
# 编辑 k12/corrections/physics-g8.json
npm run k12:apply-corrections            # dry-run
npm run k12:apply-corrections -- --write
npm run build:data
npm run validate:quizzes
```

题目通过 `meta.source_key` 定位；答题反馈导出中的 `sourceKey` 与它一致。

当前 staging 格式与 App `Question` 基本兼容，但还需要一步映射：

```text
data/k12-generated/latest/questions.jsonl
  → 自动接受 / 抽检
  → 按 source_kp_id 映射到 output/{subject}/outlines|quizzes
  → npm run build:data
  → npm run validate:quizzes
  → npm run build:web
```

映射时需要决定：

- 新知识点是新增单元，还是挂到现有单元；
- 题目的全局 `id` 重新编号；
- 是否替换旧题、还是作为变体追加；
- 多出版社版本如何分配。

这一步建议单独写 `import-generated-to-output.mjs`，在审核通过后再执行。

## 8. 质量与成本建议

- 先做 1 个学科、1 个年级的 20–50 个知识点试点。
- 每个知识点 4–6 题，先人工审核 20–30 道，确认提示词和难度分布。
- 通过后再批量扩展到同学科其他年级。
- 不要直接生成 2 万知识点 × 5 题；先验证提示词与审核吞吐。
- 生成结果必须经过：
  1. 自动校验
  2. 学科教师抽检
  3. 重复/歧义/超纲复核
  4. 前端渲染检查（公式、图表、选项长度）

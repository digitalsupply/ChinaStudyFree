#!/usr/bin/env node
/**
 * validate-questions.mjs — K12 生成题目的质量门禁
 *
 * 用法：
 *   node scripts/k12/validate-questions.mjs
 *   node scripts/k12/validate-questions.mjs --file data/k12-generated/pilot/questions.jsonl
 *
 * 校验层级：
 *   1. 结构：字段、类型、选项、答案。
 *   2. 学科契约：数值题答案必须是数字键盘可输入；文字答案走 fill_blank_text。
 *   3. 质量：解析长度、重复题干、难度/认知层级、STEAM 维度合法性。
 *   4. 关联：source_kp_id 必须存在于 curated 数据。
 *
 * 退出码：有 error 时 1；只有 warning 时 0。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CURATED_INDEX = path.join(ROOT, "data", "k12-knowledge-points", "curated", "index.json");
const DEFAULT_FILE = path.join(ROOT, "data", "k12-generated", "latest", "questions.jsonl");

const argv = process.argv.slice(2);
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}
const FILE = path.resolve(ROOT, String(arg("file", path.relative(ROOT, DEFAULT_FILE))));
const OUT = arg("out", "");

const VALID_TYPES = new Set([
  "choice",
  "true_false",
  "fill_blank",
  "calculation",
  "fill_blank_text",
  "word_order",
  "matching",
]);
const NUMERIC_RE = /^[0-9./-]+$/;
const COGNITIVE = new Set([
  "识记",
  "记忆",
  "知道",
  "了解",
  "理解",
  "应用",
  "分析",
  "综合",
  "综合应用",
  "评价",
  "迁移",
  "创造",
]);
const FIGURE_TYPES = new Set([
  "table",
  "chart",
  "line_chart",
  "bar_chart",
  "pie_chart",
  "scatter",
  "diagram",
  "circuit",
  "geometry",
  "map",
]);
const STEAM = new Set(["S", "T", "E", "A", "M"]);

const issues = [];
const seenQuestions = new Map();
const stats = {
  batches: 0,
  questions: 0,
  byType: {},
  byDifficulty: {},
  bySubject: {},
  errors: 0,
  warnings: 0,
};

function add(kind, where, message) {
  issues.push({ kind, where, message });
  if (kind === "error") stats.errors++;
  else stats.warnings++;
}

function loadCuratedIds() {
  const ids = new Set();
  if (!fs.existsSync(CURATED_INDEX)) return ids;
  const index = JSON.parse(fs.readFileSync(CURATED_INDEX, "utf8"));
  for (const file of index.files || []) {
    const doc = JSON.parse(fs.readFileSync(path.join(path.dirname(CURATED_INDEX), file.path), "utf8"));
    for (const kp of doc.knowledgePoints || []) ids.add(kp.id);
  }
  return ids;
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function validateQuestion(q, batch, kpId, indexInBatch, curatedIds) {
  const where = `${batch.source_kp_name || kpId} #${indexInBatch + 1}`;
  const type = q.type;

  if (!VALID_TYPES.has(type)) add("error", where, `未知题型: ${type}`);
  if (!Number.isFinite(Number(q.score)) || Number(q.score) <= 0) add("error", where, "score 必须为正数");
  if (!Number.isInteger(Number(q.difficulty)) || Number(q.difficulty) < 1 || Number(q.difficulty) > 5) {
    add("error", where, `difficulty 必须是 1-5，实际 ${q.difficulty}`);
  }
  if (!isNonEmptyString(q.knowledge_point)) add("error", where, "knowledge_point 为空");
  if (!isNonEmptyString(q.question)) add("error", where, "question 为空");
  if (!isNonEmptyString(q.answer)) add("error", where, "answer 为空");
  if (!isNonEmptyString(q.explanation)) {
    add("error", where, "explanation 为空");
  } else if (q.explanation.trim().length < 30) {
    add("warning", where, `解析偏短（${q.explanation.trim().length} 字，建议 ≥30）`);
  }

  const options = Array.isArray(q.options) ? q.options : [];
  if (type === "choice") {
    if (options.length !== 4) add("error", where, `choice 必须有 4 个选项，实际 ${options.length}`);
    if (new Set(options.map(String)).size !== options.length) add("error", where, "choice 选项重复");
    if (!options.map(String).includes(String(q.answer))) {
      add("error", where, `choice 答案不在选项中: ${q.answer}`);
    }
    if (options.some(o => /以上(都|全|均)|都不对/.test(String(o)))) {
      add("warning", where, "choice 含“以上都/以上全/都不对”类选项，容易歧义");
    }
  } else if (type === "true_false") {
    if (q.answer !== "对" && q.answer !== "错") add("error", where, `true_false 答案必须是 对/错，实际 ${q.answer}`);
    if (options.length > 0) add("error", where, "true_false 的 options 必须为空");
  } else if (type === "fill_blank" || type === "calculation") {
    if (options.length > 0) add("error", where, `${type} 的 options 必须为空`);
    if (!NUMERIC_RE.test(String(q.answer).trim())) {
      add("error", where, `${type} 答案含非数字字符，应改用 fill_blank_text: ${q.answer}`);
    }
  } else if (type === "fill_blank_text") {
    if (options.length > 0) add("error", where, "fill_blank_text 的 options 必须为空");
  } else if (type === "word_order") {
    if (options.length < 2 || options.length > 6) add("error", where, `word_order options 应为 2-6 项，实际 ${options.length}`);
    const ansParts = String(q.answer).split(",").map(s => s.trim()).filter(Boolean);
    if (ansParts.length !== options.length) add("error", where, "word_order answer 词数与 options 不一致");
    const a = [...ansParts].sort().join("\u0000");
    const b = [...options.map(String)].sort().join("\u0000");
    if (a !== b) add("error", where, "word_order answer 词集合与 options 不一致");
  } else if (type === "matching") {
    if (options.length !== 8) add("error", where, `matching options 应为 8 项，实际 ${options.length}`);
    const pairs = String(q.answer).split(",").map(s => s.trim()).filter(Boolean);
    if (pairs.length !== 4) add("error", where, `matching answer 应有 4 对，实际 ${pairs.length}`);
    const keys = pairs.map(p => p.split("-")[0]).sort().join(",");
    const vals = pairs.map(p => p.split("-")[1]).sort().join(",");
    if (keys !== "A,B,C,D" || vals !== "1,2,3,4") add("error", where, "matching answer 必须是 A-1..D-4 的 4 对");
  }

  const meta = q.meta && typeof q.meta === "object" ? q.meta : {};
  if (meta.cognitive_level && !COGNITIVE.has(meta.cognitive_level)) {
    add("warning", where, `未知认知层级: ${meta.cognitive_level}`);
  }
  if (meta.steam_dimensions != null) {
    if (!Array.isArray(meta.steam_dimensions)) add("error", where, "meta.steam_dimensions 必须是数组");
    else {
      for (const d of meta.steam_dimensions) if (!STEAM.has(d)) add("error", where, `未知 STEAM 维度: ${d}`);
    }
  }
  if (meta.figure != null) {
    if (typeof meta.figure !== "object") add("error", where, "meta.figure 必须是对象或 null");
    else {
      if (!FIGURE_TYPES.has(meta.figure.type)) {
        add("error", where, `meta.figure.type 非法: ${meta.figure.type}`);
      }
      if (!isNonEmptyString(meta.figure.alt)) add("warning", where, "meta.figure 缺少 alt 描述");
    }
  }
  if (meta.resource_needs != null && !Array.isArray(meta.resource_needs)) {
    add("warning", where, "meta.resource_needs 建议为数组");
  }

  // 关联知识点
  if (isNonEmptyString(kpId) && curatedIds.size > 0 && !curatedIds.has(kpId)) {
    add("error", where, `source_kp_id 不在 curated 数据中: ${kpId}`);
  }

  // 重复题干（全局）
  const key = String(q.question || "").replace(/\s+/g, "").trim();
  if (key) {
    if (seenQuestions.has(key)) {
      add("warning", where, `题干重复，首次出现于 ${seenQuestions.get(key)}`);
    } else {
      seenQuestions.set(key, where);
    }
  }

  stats.questions++;
  stats.byType[type] = (stats.byType[type] || 0) + 1;
  stats.byDifficulty[q.difficulty] = (stats.byDifficulty[q.difficulty] || 0) + 1;
  const subject = batch.subject_id || "unknown";
  stats.bySubject[subject] = (stats.bySubject[subject] || 0) + 1;
}

function main() {
  if (!fs.existsSync(FILE)) throw new Error(`找不到 ${FILE}`);
  const curatedIds = loadCuratedIds();
  const lines = fs.readFileSync(FILE, "utf8").split("\n").filter(Boolean);

  for (const line of lines) {
    let batch;
    try {
      batch = JSON.parse(line);
    } catch (e) {
      add("error", path.basename(FILE), `JSON 解析失败: ${e.message}`);
      continue;
    }
    stats.batches++;
    const questions = Array.isArray(batch.questions) ? batch.questions : [];
    if (questions.length === 0) add("error", batch.source_kp_name || batch.source_kp_id || "unknown", "questions 为空");
    for (let i = 0; i < questions.length; i++) {
      validateQuestion(questions[i], batch, batch.source_kp_id, i, curatedIds);
    }
  }

  const report = {
    file: path.relative(ROOT, FILE),
    checkedAt: new Date().toISOString(),
    stats,
    issues,
  };
  if (typeof OUT === "string" && OUT) {
    fs.writeFileSync(path.resolve(ROOT, OUT), JSON.stringify(report, null, 2), "utf8");
  }

  console.log("=== K12 题目校验 ===");
  console.log(`文件: ${path.relative(ROOT, FILE)}`);
  console.log(`批次: ${stats.batches}，题目: ${stats.questions}`);
  console.log("题型:", stats.byType);
  console.log("难度:", stats.byDifficulty);
  console.log(`错误: ${stats.errors}，警告: ${stats.warnings}`);
  for (const issue of issues.slice(0, 40)) {
    console.log(`  [${issue.kind}] ${issue.where}: ${issue.message}`);
  }
  if (issues.length > 40) console.log(`  …还有 ${issues.length - 40} 条`);

  if (stats.errors > 0) process.exit(1);
}

main();

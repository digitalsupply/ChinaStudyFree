#!/usr/bin/env node
/**
 * apply-corrections.mjs — 后台修正 / 删除 K12 题目
 *
 * 学习者在小旗子反馈里报告的题目会带 `sourceKey`。运营/教研把决定写进
 * k12/corrections/<batch>.json，然后运行本脚本批量应用：
 *
 *   node scripts/k12/apply-corrections.mjs --dry-run
 *   node scripts/k12/apply-corrections.mjs --write
 *   npm run build:data
 *
 * 支持动作：
 *   delete  — 从题库删除该题
 *   replace — 用 patch 覆盖字段（适合重写题干/选项/答案/解析）
 *   patch   — 只改 patch 中的字段（适合改难度、解析等）
 *
 * 题目定位使用 Question.meta.source_key，例如：
 *   "483911bc-...#q1"
 * 该键在 import-to-output.mjs 写入时生成，后续不会因题目重排而改变。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUTPUT = path.join(ROOT, "output", "physics");
const DEFAULT_CORRECTIONS = path.join(ROOT, "k12", "corrections", "physics-g8.json");

const argv = process.argv.slice(2);
function hasFlag(name) {
  return argv.includes(`--${name}`);
}
function arg(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const next = argv[i + 1];
  return next && !next.startsWith("--") ? next : true;
}

const CORRECTIONS = path.resolve(ROOT, String(arg("corrections", path.relative(ROOT, DEFAULT_CORRECTIONS))));
const WRITE = hasFlag("write");

function loadQuizFiles() {
  const dir = path.join(OUTPUT, "quizzes");
  return fs
    .readdirSync(dir)
    .filter(f => f.startsWith("K12知识图谱") && f.endsWith(".json"))
    .map(f => path.join(dir, f));
}

function main() {
  if (!fs.existsSync(CORRECTIONS)) throw new Error(`找不到修正文件: ${CORRECTIONS}`);
  const doc = JSON.parse(fs.readFileSync(CORRECTIONS, "utf8"));
  const corrections = Array.isArray(doc.corrections) ? doc.corrections : [];
  if (corrections.length === 0) {
    console.log("修正文件为空，无需处理。");
    return;
  }

  const files = loadQuizFiles();
  const index = new Map(); // source_key -> { file, quiz, question }
  for (const file of files) {
    const quiz = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const q of quiz.unit_test?.questions || []) {
      const key = q.meta?.source_key;
      if (!key) continue;
      if (index.has(key)) {
        console.warn(`⚠️ source_key 重复: ${key}`);
      }
      index.set(key, { file, quiz, question: q });
    }
  }

  const summary = { delete: 0, replace: 0, patch: 0, missing: 0 };
  const touched = new Set();

  for (const c of corrections) {
    const key = c.source_key;
    if (!key) {
      console.warn("⚠️ 跳过没有 source_key 的修正项");
      continue;
    }
    const target = index.get(key);
    if (!target) {
      console.warn(`⚠️ 找不到题目: ${key}${c.reason ? `（${c.reason}）` : ""}`);
      summary.missing++;
      continue;
    }
    const { quiz, question } = target;
    const questions = quiz.unit_test.questions;
    const pos = questions.indexOf(question);

    if (c.action === "delete") {
      if (pos >= 0) questions.splice(pos, 1);
      summary.delete++;
    } else if (c.action === "replace" || c.action === "patch") {
      if (!c.patch || typeof c.patch !== "object") {
        console.warn(`⚠️ ${key} 的 ${c.action} 缺少 patch`);
        continue;
      }
      Object.assign(question, c.patch);
      if (c.patch.meta && typeof c.patch.meta === "object") {
        question.meta = { ...(question.meta || {}), ...c.patch.meta };
      }
      summary[c.action]++;
    } else {
      console.warn(`⚠️ 未知动作: ${c.action} (${key})`);
      continue;
    }
    touched.add(target.file);
  }

  // 删除后重排 id + 更新总分
  for (const file of touched) {
    const quiz = JSON.parse(fs.readFileSync(file, "utf8"));
    const questions = quiz.unit_test?.questions || [];
    questions.forEach((q, i) => {
      q.id = i + 1;
    });
    if (quiz.unit_test) {
      quiz.unit_test.total_score = questions.reduce((s, q) => s + (Number(q.score) || 0), 0);
    }
    if (WRITE) fs.writeFileSync(file, JSON.stringify(quiz, null, 2), "utf8");
  }

  console.log(`=== 应用 K12 修正 ${WRITE ? "（写入）" : "（dry-run）"} ===`);
  console.log(`修正项: ${corrections.length}`);
  console.log(`删除: ${summary.delete}，替换: ${summary.replace}，局部修改: ${summary.patch}，未找到: ${summary.missing}`);
  console.log(`涉及题库文件: ${touched.size}`);
  if (!WRITE) {
    console.log("\n这是 dry-run。确认后加 --write，然后运行 npm run build:data。");
  } else {
    console.log("\n下一步：npm run build:data && npm run validate:quizzes");
  }
}

main();

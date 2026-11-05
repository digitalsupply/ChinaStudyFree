#!/usr/bin/env node
/**
 * import-to-output.mjs — 把 K12 staging 题目正式写入 output/。
 *
 * 当前支持八年级物理批次：
 *   k12/generated/physics-g8/questions.jsonl
 *   k12/generated/physics-g8/plan.json
 *
 * 生成一个独立的「K12知识图谱」版本，不覆盖原有教材：
 *   output/physics/outlines/K12知识图谱 · 物理八年级上册.json
 *   output/physics/outlines/K12知识图谱 · 物理八年级下册.json
 *   output/physics/quizzes/K12知识图谱 · 物理八年级上/下册_unitN.json
 *
 * 设计取舍：
 *   - 12 个正文章节按 1-6 / 7-12 分到八上 / 八下；
 *   - 每章 3 个知识点，每个知识点 4 题；
 *   - 不拆 exam 课，全部题进入 unit_test，避免改变题量；
 *   - 题目保留 meta.source_key，供后续后台修正/删除。
 *
 * 用法：
 *   node scripts/k12/import-to-output.mjs --dry-run
 *   node scripts/k12/import-to-output.mjs --write
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const OUT = path.join(ROOT, "output", "physics");

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

const QUESTIONS_FILE = path.resolve(ROOT, String(arg("questions", "k12/generated/physics-g8/questions.jsonl")));
const PLAN_FILE = path.resolve(ROOT, String(arg("plan", "k12/generated/physics-g8/plan.json")));
const WRITE = hasFlag("write");

const CN = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
function cnNumber(s) {
  if (!s) return 0;
  if (s === "十") return 10;
  if (s.startsWith("十")) return 10 + (CN[s[1]] || 0);
  if (s.includes("十")) {
    const [a, b] = s.split("十");
    return (CN[a] || 1) * 10 + (CN[b] || 0);
  }
  return CN[s] || 0;
}
function chapterNumber(title) {
  const m = String(title).match(/^第([一二三四五六七八九十]+)章/);
  return m ? cnNumber(m[1]) : 0;
}

const TYPE_LABEL = {
  choice: "选择",
  true_false: "判断",
  fill_blank: "填空",
  calculation: "计算",
  fill_blank_text: "文字填空",
  word_order: "排序",
  matching: "连线",
};

function readJsonl(file) {
  return fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map(line => JSON.parse(line));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

function main() {
  if (!fs.existsSync(QUESTIONS_FILE)) throw new Error(`缺少 ${QUESTIONS_FILE}`);
  if (!fs.existsSync(PLAN_FILE)) throw new Error(`缺少 ${PLAN_FILE}`);

  const plan = JSON.parse(fs.readFileSync(PLAN_FILE, "utf8"));
  const batches = readJsonl(QUESTIONS_FILE);
  const batchByKp = new Map(batches.map(b => [b.source_kp_id, b]));
  const kpMeta = new Map((plan.recommendedBatch || []).map(kp => [kp.id, kp]));

  const chapters = new Map();
  for (const kp of plan.recommendedBatch || []) {
    const n = chapterNumber(kp.chapter);
    if (!n) {
      console.warn(`⚠️ 跳过无法识别章节的知识点: ${kp.canonicalName} (${kp.chapter})`);
      continue;
    }
    if (!chapters.has(n)) {
      chapters.set(n, { number: n, title: kp.chapter, book: n <= 6 ? "up" : "down", kps: [] });
    }
    chapters.get(n).kps.push(kp);
  }

  const books = {
    up: { stem: "K12知识图谱 · 物理八年级上册", semester: "up", chapters: [] },
    down: { stem: "K12知识图谱 · 物理八年级下册", semester: "down", chapters: [] },
  };
  for (const ch of [...chapters.values()].sort((a, b) => a.number - b.number)) {
    books[ch.book].chapters.push(ch);
  }

  let totalQuestions = 0;
  const files = [];

  for (const book of Object.values(books)) {
    const outline = { textbook: book.stem, units: [] };
    const quizDocs = [];

    for (const ch of book.chapters) {
      const unitNumber = ch.book === "up" ? ch.number : ch.number - 6;
      const kps = [...ch.kps].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName, "zh"));
      const allQuestions = [];
      const knowledgeSummary = [];
      const knowledgePoints = [];

      for (const kp of kps) {
        const batch = batchByKp.get(kp.id);
        if (!batch || !Array.isArray(batch.questions) || batch.questions.length === 0) {
          console.warn(`⚠️ 缺少题目: ${kp.canonicalName}`);
          continue;
        }
        const types = new Set(batch.questions.map(q => TYPE_LABEL[q.type] || q.type));
        knowledgePoints.push({
          name: kp.canonicalName,
          description: (kp.learningObjectives || [])[0] || kp.canonicalName,
          difficulty: kp.difficultyBand || 3,
          question_types: [...types],
        });
        knowledgeSummary.push({
          point: kp.canonicalName,
          core_concept:
            (kp.learningObjectives || []).slice(0, 2).join("；") || kp.canonicalName,
          key_formula: "",
          common_mistakes: kp.misconceptions || [],
          tips: `对应章节：${kp.chapter}。先判断物理量、单位和条件，再作答。`,
        });

        for (const q of batch.questions) {
          const question = clone(q);
          question.id = allQuestions.length + 1;
          question.knowledge_point = kp.canonicalName;
          question.meta = {
            ...(question.meta || {}),
            source_key: question.meta?.source_key || `${kp.id}#q${q.id}`,
            source_kp_id: kp.id,
            source_kp_name: kp.canonicalName,
            imported_from: "k12/generated/physics-g8",
          };
          allQuestions.push(question);
        }
      }

      if (allQuestions.length === 0) continue;
      const totalScore = allQuestions.reduce((s, q) => s + (Number(q.score) || 0), 0);
      outline.units.push({
        unit_number: unitNumber,
        title: ch.title,
        knowledge_points: knowledgePoints,
      });
      quizDocs.push({
        textbook: book.stem,
        unit: ch.title,
        unit_number: unitNumber,
        unit_test: {
          title: `${ch.title} · K12知识图谱练习`,
          total_score: totalScore,
          time_minutes: 40,
          questions: allQuestions,
        },
        knowledge_summary: knowledgeSummary,
        _meta: {
          source: "k12-knowledge-points",
          generated_from: "k12/generated/physics-g8",
          imported_at: new Date().toISOString(),
        },
      });
      totalQuestions += allQuestions.length;
    }

    if (outline.units.length === 0) continue;
    outline._meta = {
      source: "k12-knowledge-points",
      generated_from: "k12/generated/physics-g8",
      imported_at: new Date().toISOString(),
    };

    const outlineFile = path.join(OUT, "outlines", `${book.stem}.json`);
    files.push({ type: "outline", file: outlineFile, units: outline.units.length });
    for (const quiz of quizDocs) {
      const quizFile = path.join(OUT, "quizzes", `${book.stem}_unit${quiz.unit_number}.json`);
      files.push({
        type: "quiz",
        file: quizFile,
        questions: quiz.unit_test.questions.length,
      });
    }

    if (WRITE) {
      ensureDir(path.dirname(outlineFile));
      fs.writeFileSync(outlineFile, JSON.stringify(outline, null, 2), "utf8");
      for (const quiz of quizDocs) {
        const quizFile = path.join(OUT, "quizzes", `${book.stem}_unit${quiz.unit_number}.json`);
        fs.writeFileSync(quizFile, JSON.stringify(quiz, null, 2), "utf8");
      }
    }
  }

  console.log(`=== K12 → output/physics ${WRITE ? "写入" : "dry-run"} ===`);
  console.log(`知识点: ${plan.recommendedBatch?.length || 0}，题目: ${totalQuestions}`);
  for (const f of files) {
    console.log(`  ${f.type === "outline" ? "大纲" : "题库"} ${path.relative(ROOT, f.file)}${f.units ? ` (${f.units} 单元)` : ` (${f.questions} 题)`}`);
  }
  if (!WRITE) {
    console.log("\n这是 dry-run。确认后加 --write 正式写入。");
  } else {
    console.log("\n下一步：");
    console.log("  npm run build:data");
    console.log("  npm run validate:quizzes");
  }
}

main();

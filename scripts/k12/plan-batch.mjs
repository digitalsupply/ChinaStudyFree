#!/usr/bin/env node
/**
 * plan-batch.mjs — 按学段/学科/年级生成出题批次计划
 *
 * 输出：
 *   data/k12-generated/plan-<stage>-<subject>-g<grade>.json
 *
 * 计划包含：
 *   - 每个章节的知识点数量、平均置信度/可评估性、难度分布
 *   - 推荐的首批知识点（默认每章 3 个，按 confidence×assessability 排序）
 *   - ids 数组，可直接传给 generate-questions.mjs --kp-file
 *
 * 示例：
 *   node scripts/k12/plan-batch.mjs --stage middle --subject physics --grade 8
 *   node scripts/k12/generate-questions.mjs --stage middle --subject physics \
 *     --grade 8 --kp-file data/k12-generated/plan-middle-physics-g8.json \
 *     --limit 0 --count 5 --dry-run
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CURATED = path.join(ROOT, "data", "k12-knowledge-points", "curated");

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
function num(v, d) {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
}

const STAGE = String(arg("stage", "middle"));
const SUBJECT = String(arg("subject", "physics"));
const GRADE = String(arg("grade", "8"));
const MIN_CONFIDENCE = num(arg("min-confidence", 0.8), 0.8);
const MIN_ASSESSABILITY = num(arg("min-assessability", 0.6), 0.6);
const PER_CHAPTER = num(arg("per-chapter", 3), 3);
const INCLUDE_MISC = hasFlag("include-misc");
const MISC_CHAPTERS = new Set(["其他", "绪言", "科学之旅", "中考复习", "未分章"]);
const OUT = path.resolve(
  ROOT,
  String(
    arg(
      "out",
      path.relative(ROOT, path.join("data", "k12-generated", `plan-${STAGE}-${SUBJECT}-g${GRADE}.json`)),
    ),
  ),
);

function chapterOf(kp) {
  const pathArr = kp.textbooks?.[0]?.chapterPath || [];
  return String(pathArr[0] || "未分章")
    .replace(/\u3000/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function main() {
  const indexPath = path.join(CURATED, "index.json");
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const files = index.files.filter(f => f.stage === STAGE && f.subjectId === SUBJECT);
  if (files.length === 0) throw new Error(`curated 中没有 ${STAGE}/${SUBJECT}`);

  const gradeNumbers = GRADE.split(",").map(s => Number(s.trim())).filter(n => Number.isFinite(n));
  const kps = [];
  for (const file of files) {
    const doc = JSON.parse(fs.readFileSync(path.join(CURATED, file.path), "utf8"));
    for (const kp of doc.knowledgePoints || []) {
      if ((kp.confidence ?? 0) < MIN_CONFIDENCE) continue;
      if ((kp.assessability ?? 0) < MIN_ASSESSABILITY) continue;
      if (gradeNumbers.length && !(kp.gradeNumbers || []).some(g => gradeNumbers.includes(g))) continue;
      kps.push(kp);
    }
  }

  const byChapter = new Map();
  for (const kp of kps) {
    const ch = chapterOf(kp);
    if (!byChapter.has(ch)) byChapter.set(ch, []);
    byChapter.get(ch).push(kp);
  }

  const chapters = [...byChapter.entries()]
    .map(([chapter, list]) => {
      const diffs = {};
      let conf = 0;
      let assess = 0;
      for (const k of list) {
        conf += k.confidence || 0;
        assess += k.assessability || 0;
        diffs[k.difficultyBand] = (diffs[k.difficultyBand] || 0) + 1;
      }
      return {
        chapter,
        count: list.length,
        avgConfidence: Number((conf / list.length).toFixed(3)),
        avgAssessability: Number((assess / list.length).toFixed(3)),
        difficulty: diffs,
        knowledgePoints: list,
      };
    })
    .sort((a, b) => a.chapter.localeCompare(b.chapter, "zh"));

  const recommended = [];
  for (const ch of chapters) {
    if (!INCLUDE_MISC && MISC_CHAPTERS.has(ch.chapter)) continue;
    const sorted = [...ch.knowledgePoints].sort(
      (a, b) =>
        ((b.confidence || 0) * 0.6 + (b.assessability || 0) * 0.4) -
          ((a.confidence || 0) * 0.6 + (a.assessability || 0) * 0.4) ||
        (a.difficultyBand || 99) - (b.difficultyBand || 99),
    );
    const picked = PER_CHAPTER > 0 ? sorted.slice(0, PER_CHAPTER) : sorted;
    for (const kp of picked) {
      recommended.push({
        id: kp.id,
        canonicalName: kp.canonicalName,
        chapter: ch.chapter,
        gradeNumbers: kp.gradeNumbers,
        confidence: kp.confidence,
        assessability: kp.assessability,
        difficultyBand: kp.difficultyBand,
        knowledgeType: kp.knowledgeType,
        learningObjectives: kp.learningObjectives,
        misconceptions: kp.misconceptions,
      });
    }
  }

  const plan = {
    generatedAt: new Date().toISOString(),
    filters: {
      stage: STAGE,
      subject: SUBJECT,
      grade: GRADE,
      minConfidence: MIN_CONFIDENCE,
      minAssessability: MIN_ASSESSABILITY,
      perChapter: PER_CHAPTER,
      includeMisc: INCLUDE_MISC,
    },
    totals: {
      knowledgePoints: kps.length,
      chapters: chapters.length,
      recommended: recommended.length,
    },
    chapters: chapters.map(({ knowledgePoints, ...rest }) => rest),
    recommendedBatch: recommended,
    ids: recommended.map(r => r.id),
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(plan, null, 2), "utf8");

  console.log("=== K12 出题批次计划 ===");
  console.log(`${STAGE}/${SUBJECT}/grade=${GRADE}，知识点 ${kps.length}，章节 ${chapters.length}，推荐 ${recommended.length}`);
  console.log("章节分布:");
  for (const ch of chapters) {
    console.log(`  ${String(ch.count).padStart(3)}  ${ch.chapter}  conf=${ch.avgConfidence} assess=${ch.avgAssessability} diff=${JSON.stringify(ch.difficulty)}`);
  }
  console.log(`输出: ${path.relative(ROOT, OUT)}`);
  console.log(`推荐 id 数: ${plan.ids.length}（可用于 generate-questions --kp-file）`);
}

main();

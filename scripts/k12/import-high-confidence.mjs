#!/usr/bin/env node
/**
 * import-high-confidence.mjs
 *
 * 把 data/k12-knowledge-points 中高置信度的知识点，规范化成仓库可消费的
 * curated 数据层。默认阈值 0.8，可用 K12_KP_MIN_CONFIDENCE 调整。
 *
 * 输入：
 *   data/k12-knowledge-points/split/index.json
 *   data/k12-knowledge-points/split/<学段>/<学科>.json
 *
 * 输出：
 *   data/k12-knowledge-points/curated/index.json
 *   data/k12-knowledge-points/curated/<stage>/<subjectId>.json
 *   data/k12-knowledge-points/curated/unsupported.json
 *
 * 设计原则：
 *   - 不丢原始字段：保留 source id、教材、章节路径、置信度、标注。
 *   - 学科映射显式化：数据集用中文名，App 用 SubjectId。
 *   - 不强行过滤可评估性：只记录 assessability，由出题脚本按需过滤。
 *   - 非 App 学科（体育/音乐/美术/艺术/俄语/日语）单独归档，不混入主数据。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const SRC = path.join(ROOT, "data", "k12-knowledge-points");
const SPLIT = path.join(SRC, "split");
const OUT = path.join(SRC, "curated");

const MIN_CONFIDENCE = Number(process.env.K12_KP_MIN_CONFIDENCE || 0.8);

const STAGE_MAP = {
  小学: "primary",
  初中: "middle",
  高中: "high",
};

/** 数据集学科 → App SubjectId。null 表示 App 暂无对应学科。 */
const SUBJECT_MAP = {
  语文: "chinese",
  数学: "math",
  英语: "english",
  科学: "science",
  物理: "physics",
  化学: "chemistry",
  生物: "biology",
  历史: "history",
  地理: "geography",
  // 思政在小学/初中对应“道德与法治”，高中对应“思想政治”
  思政: "politics",
  通用: "computer",
  体育: null,
  音乐: null,
  美术: null,
  艺术: null,
  俄语: null,
  日语: null,
};

const CN_NUM = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function parseJson(value, fallback) {
  if (value == null || value === "") return fallback;
  if (typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function annotationValue(annotations, key) {
  const item = annotations?.[key];
  return item && typeof item === "object" && "value" in item ? item.value : undefined;
}

function parseGradeNumbers(grades) {
  const nums = new Set();
  for (const raw of grades || []) {
    const g = String(raw).trim();
    let m = g.match(/^([一二三四五六七八九])年级$/);
    if (m) {
      nums.add(CN_NUM[m[1]]);
      continue;
    }
    m = g.match(/^高([一二三])$/);
    if (m) {
      nums.add(9 + CN_NUM[m[1]]);
      continue;
    }
    m = g.match(/^([一二三四五六七八九])至([一二三四五六七八九])年级$/);
    if (m) {
      const a = CN_NUM[m[1]];
      const b = CN_NUM[m[2]];
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) nums.add(i);
      continue;
    }
    // 学生读本等非年级标签不入 gradeNumbers
  }
  return [...nums].sort((a, b) => a - b);
}

function difficultyBand(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  if (value < 0.2) return 1;
  if (value < 0.4) return 2;
  if (value < 0.6) return 3;
  if (value < 0.8) return 4;
  return 5;
}

function emptyBucket() {
  return { count: 0, byStage: {}, bySubject: {} };
}

function bump(obj, key, n = 1) {
  obj[key] = (obj[key] || 0) + n;
}

function normalizeKp(kp, ctx) {
  const annotations = parseJson(kp.annotations, {});
  const aliases = parseJson(kp.aliases, []);
  const difficulty01 = annotationValue(annotations, "difficulty");
  const assessability = annotationValue(annotations, "assessability");
  const knowledgeType = annotationValue(annotations, "knowledgeType");
  const learningObjectives = annotationValue(annotations, "learningObjectives") || [];
  const prerequisites = annotationValue(annotations, "prerequisites") || [];
  const misconceptions = annotationValue(annotations, "misconceptions") || [];
  const gradeNumbers = parseGradeNumbers(kp.grades);

  return {
    id: kp.id,
    canonicalName: kp.canonical_name,
    title: kp.title || kp.canonical_name,
    subjectName: kp.subject,
    subjectId: ctx.subjectId,
    stage: ctx.stage,
    gradeBand: kp.grade_band,
    grades: kp.grades || [],
    gradeNumbers,
    curriculumSystem: kp.curriculum_system || "",
    confidence: kp.confidence,
    aliases: Array.isArray(aliases) ? aliases : [],
    knowledgeType: knowledgeType || null,
    difficulty01: typeof difficulty01 === "number" ? difficulty01 : null,
    difficultyBand: difficultyBand(difficulty01),
    assessability: typeof assessability === "number" ? assessability : null,
    learningObjectives: Array.isArray(learningObjectives) ? learningObjectives : [],
    prerequisites: Array.isArray(prerequisites) ? prerequisites : [],
    misconceptions: Array.isArray(misconceptions) ? misconceptions : [],
    textbooks: (kp.textbooks || []).map(t => ({
      textbookId: t.textbook_id,
      title: t.textbook_title,
      grade: t.grade,
      volume: t.volume,
      chapterNodeId: t.chapter_node_id,
      chapterPath: t.chapter_path || [],
    })),
    source: {
      dataset: "k12-knowledge-points",
      file: ctx.sourceFile,
      gradeBand: kp.grade_band,
      subject: kp.subject,
    },
  };
}

function main() {
  const indexPath = path.join(SPLIT, "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`找不到 ${indexPath}，请先复制 k12-knowledge-points 数据。`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  fs.mkdirSync(OUT, { recursive: true });

  const groups = new Map(); // `${stage}/${subjectId}` -> array
  const unsupported = [];
  const stats = {
    generatedAt: new Date().toISOString(),
    source: "data/k12-knowledge-points",
    minConfidence: MIN_CONFIDENCE,
    totalSource: index.total_kp,
    totalRelations: index.total_relations,
    highConfidence: 0,
    supported: 0,
    unsupported: 0,
    byStage: {},
    byStageSubject: {},
    confidenceBuckets: { "0.95+": 0, "0.90-0.95": 0, "0.80-0.90": 0 },
    assessabilityBuckets: { "0.80+": 0, "0.60-0.80": 0, "<0.60": 0, missing: 0 },
    unsupportedSubjects: {},
    files: [],
  };

  for (const file of index.files) {
    const stage = STAGE_MAP[file.grade_band];
    if (!stage) continue;
    const subjectIdRaw = SUBJECT_MAP[file.subject];
    const subjectId =
      file.subject === "思政" && stage === "high" ? "politics" : subjectIdRaw;
    const doc = JSON.parse(fs.readFileSync(path.join(SPLIT, file.path), "utf8"));
    const sourceKps = doc.knowledge_points || [];

    for (const kp of sourceKps) {
      if (typeof kp.confidence !== "number" || kp.confidence < MIN_CONFIDENCE) continue;
      stats.highConfidence++;
      if (kp.confidence >= 0.95) stats.confidenceBuckets["0.95+"]++;
      else if (kp.confidence >= 0.9) stats.confidenceBuckets["0.90-0.95"]++;
      else stats.confidenceBuckets["0.80-0.90"]++;

      const ctx = { stage, subjectId, sourceFile: file.path };
      const normalized = normalizeKp(kp, ctx);
      const assess = normalized.assessability;
      if (typeof assess !== "number") stats.assessabilityBuckets.missing++;
      else if (assess >= 0.8) stats.assessabilityBuckets["0.80+"]++;
      else if (assess >= 0.6) stats.assessabilityBuckets["0.60-0.80"]++;
      else stats.assessabilityBuckets["<0.60"]++;

      if (!subjectId) {
        unsupported.push(normalized);
        bump(stats.unsupportedSubjects, file.subject);
        stats.unsupported++;
        continue;
      }

      const key = `${stage}/${subjectId}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(normalized);

      bump(stats.byStage, stage);
      stats.byStageSubject[stage] ??= {};
      bump(stats.byStageSubject[stage], subjectId);
      stats.supported++;
    }
  }

  // 同一学段/学科内，同名知识点可能因多教材重复；记录重复组大小，供出题去重。
  for (const [key, list] of groups) {
    const nameCount = new Map();
    for (const kp of list) {
      const k = kp.canonicalName.trim();
      nameCount.set(k, (nameCount.get(k) || 0) + 1);
    }
    for (const kp of list) {
      kp.duplicateNameGroupSize = nameCount.get(kp.canonicalName.trim()) || 1;
    }
    const [stage, subjectId] = key.split("/");
    list.sort((a, b) => {
      const ga = a.gradeNumbers[0] ?? 99;
      const gb = b.gradeNumbers[0] ?? 99;
      if (ga !== gb) return ga - gb;
      const da = a.difficultyBand ?? 99;
      const db = b.difficultyBand ?? 99;
      if (da !== db) return da - db;
      return a.canonicalName.localeCompare(b.canonicalName, "zh");
    });

    const dir = path.join(OUT, stage);
    fs.mkdirSync(dir, { recursive: true });
    const outPath = path.join(dir, `${subjectId}.json`);
    const payload = {
      generatedAt: stats.generatedAt,
      source: "data/k12-knowledge-points",
      minConfidence: MIN_CONFIDENCE,
      stage,
      subjectId,
      count: list.length,
      knowledgePoints: list,
    };
    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf8");
    stats.files.push({
      path: path.relative(OUT, outPath).split(path.sep).join("/"),
      stage,
      subjectId,
      count: list.length,
    });
  }

  fs.writeFileSync(
    path.join(OUT, "unsupported.json"),
    JSON.stringify(
      {
        generatedAt: stats.generatedAt,
        note: "App 暂无对应 SubjectId 的高置信度知识点，仅归档，不进入出题队列。",
        count: unsupported.length,
        knowledgePoints: unsupported,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(stats, null, 2), "utf8");

  console.log("✅ 高置信度知识点导入完成");
  console.log(`   阈值: confidence >= ${MIN_CONFIDENCE}`);
  console.log(`   源知识点: ${stats.totalSource}`);
  console.log(`   高置信度: ${stats.highConfidence}`);
  console.log(`   可进入出题队列: ${stats.supported}`);
  console.log(`   暂不支持的学科: ${stats.unsupported}`);
  console.log(`   输出目录: ${path.relative(ROOT, OUT)}`);
  console.log("   按学段:");
  for (const [stage, n] of Object.entries(stats.byStage)) console.log(`     ${stage}: ${n}`);
  console.log("   置信度分布:", stats.confidenceBuckets);
  console.log("   可评估性分布:", stats.assessabilityBuckets);
}

main();

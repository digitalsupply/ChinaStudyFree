#!/usr/bin/env node
/**
 * generate-questions.mjs — 按知识点批量出题
 *
 * 默认只处理 curated 中高置信度、可评估性较高的知识点；先 dry-run 看提示词，
 * 再配置 LLM_API_KEY 真正生成。
 *
 * 示例：
 *   node scripts/k12/generate-questions.mjs --stage middle --subject physics \
 *     --limit 3 --count 5 --dry-run
 *
 *   LLM_API_KEY=sk-xxx node scripts/k12/generate-questions.mjs \
 *     --stage middle --subject physics --limit 20 --count 5
 *
 * 输出（默认 data/k12-generated/latest/）：
 *   prompts.jsonl       dry-run 的完整提示词
 *   questions.jsonl     每个知识点一行（含 questions 数组）
 *   errors.jsonl        失败记录
 *   run-summary.json    运行摘要
 *
 * 重要：生成结果只是 staging，不会自动写入 output/ 或前端。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildQuestionPrompt, PROMPT_VERSION } from "./prompt-builder.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");
const CURATED = path.join(ROOT, "data", "k12-knowledge-points", "curated");
const DEFAULT_OUT = path.join(ROOT, "data", "k12-generated", "latest");

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
function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const DRY_RUN = hasFlag("dry-run");
const STAGE = typeof arg("stage", "") === "string" ? arg("stage", "") : "";
const SUBJECT = typeof arg("subject", "") === "string" ? arg("subject", "") : "";
const GRADE = typeof arg("grade", "") === "string" ? arg("grade", "") : "";
const GRADE_NUMBERS = String(GRADE)
  .split(",")
  .map(s => Number(s.trim()))
  .filter(n => Number.isFinite(n));
const LIMIT = num(arg("limit", 20), 20);
const COUNT = num(arg("count", 5), 5);
const MIN_CONFIDENCE = num(arg("min-confidence", 0.8), 0.8);
const MIN_ASSESSABILITY = num(arg("min-assessability", 0.6), 0.6);
const TYPES = String(arg("types", ""))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);
const ONLY = typeof arg("only", "") === "string" ? arg("only", "") : "";
const KP_FILE = typeof arg("kp-file", "") === "string" ? arg("kp-file", "") : "";
const OUT = path.resolve(ROOT, String(arg("out", path.relative(ROOT, DEFAULT_OUT))));
const CONCURRENCY = Math.max(1, num(arg("concurrency", 3), 3));
const TIMEOUT_MS = Math.max(5000, num(arg("timeout", 90000), 90000));

const BASE = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
const KEY = process.env.LLM_API_KEY || "";
const MODEL = process.env.LLM_MODEL || "gpt-4o-mini";
const SESSION_ID = process.env.K12_SESSION_ID || `cstf-k12-${Date.now().toString(36)}`;
const JSON_MODE = process.env.K12_JSON_MODE !== "false";

function loadSelectedIds() {
  if (!KP_FILE) return null;
  const file = path.resolve(ROOT, KP_FILE);
  if (!fs.existsSync(file)) throw new Error(`找不到 --kp-file: ${file}`);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const raw = Array.isArray(doc) ? doc : doc.ids || doc.recommendedBatch || [];
  const ids = new Set(
    raw
      .map(x => (typeof x === "string" ? x : x?.id))
      .filter(Boolean),
  );
  return ids;
}

function loadCurated() {
  const indexPath = path.join(CURATED, "index.json");
  if (!fs.existsSync(indexPath)) {
    throw new Error(`找不到 ${indexPath}，请先运行 node scripts/k12/import-high-confidence.mjs`);
  }
  const index = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  const selectedIds = loadSelectedIds();
  const all = [];
  for (const file of index.files) {
    if (STAGE && file.stage !== STAGE) continue;
    if (SUBJECT && file.subjectId !== SUBJECT) continue;
    const doc = JSON.parse(fs.readFileSync(path.join(CURATED, file.path), "utf8"));
    for (const kp of doc.knowledgePoints || []) all.push(kp);
  }
  return all
    .filter(kp => (kp.confidence ?? 0) >= MIN_CONFIDENCE)
    .filter(kp => (kp.assessability ?? 0) >= MIN_ASSESSABILITY)
    .filter(kp => {
      if (GRADE_NUMBERS.length === 0) return true;
      return (kp.gradeNumbers || []).some(g => GRADE_NUMBERS.includes(g));
    })
    .filter(kp => !selectedIds || selectedIds.has(kp.id))
    .filter(kp => {
      if (!ONLY) return true;
      const q = ONLY.toLowerCase();
      return (
        kp.id === ONLY ||
        kp.canonicalName.toLowerCase().includes(q) ||
        (kp.aliases || []).some(a => String(a).toLowerCase().includes(q))
      );
    })
    .sort(
      (a, b) =>
        (b.confidence ?? 0) - (a.confidence ?? 0) ||
        (b.assessability ?? 0) - (a.assessability ?? 0),
    );
}

function parseJsonLoose(raw) {
  let s = String(raw || "").trim();
  s = s.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  // 找到第一个 { 到最后一个 }，容忍模型在前后加解释
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) s = s.slice(start, end + 1);
  return JSON.parse(s);
}

async function callLLM(prompt) {
  if (!KEY) throw new Error("LLM_API_KEY 未配置");
  const body = {
    model: MODEL,
    messages: [
      { role: "system", content: prompt.system },
      { role: "user", content: prompt.user },
    ],
    temperature: 0.6,
  };
  if (JSON_MODE) body.response_format = { type: "json_object" };

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${KEY}`,
      "User-Agent": "ChinaStudyFree-K12/1.0",
      "x-opencode-session": SESSION_ID,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`LLM ${res.status}: ${text.slice(0, 500)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("LLM 返回内容为空");
  return parseJsonLoose(content);
}

async function pool(items, worker, n) {
  const state = { i: 0 };
  const runners = Array.from({ length: Math.min(n, items.length) }, async () => {
    while (state.i < items.length) {
      const idx = state.i++;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readDoneSourceIds(file) {
  const done = new Set();
  if (!fs.existsSync(file)) return done;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const doc = JSON.parse(line);
      if (doc.source_kp_id) done.add(doc.source_kp_id);
    } catch {
      /* ignore partial line */
    }
  }
  return done;
}

function normalizeQuestionBatch(kp, parsed) {
  const questions = Array.isArray(parsed?.questions) ? parsed.questions : null;
  if (!questions) throw new Error("返回缺少 questions 数组");
  if (questions.length === 0) throw new Error("questions 为空");
  return questions.map((q, i) => {
    const meta = q.meta && typeof q.meta === "object" ? q.meta : {};
    if (meta.figure && typeof meta.figure === "object") {
      const figure = meta.figure;
      const alt =
        figure.alt ||
        figure.description ||
        figure.caption ||
        `${figure.type || "图"}示意`;
      const spec =
        figure.spec && typeof figure.spec === "object"
          ? figure.spec
          : Object.fromEntries(
              Object.entries(figure).filter(([k]) => k !== "type" && k !== "alt"),
            );
      meta.figure = { ...figure, alt, spec };
    }
    return {
      ...q,
      id: Number.isFinite(Number(q.id)) ? Number(q.id) : i + 1,
      meta: {
        ...meta,
        source_kp_id: kp.id,
        source_kp_name: kp.canonicalName,
        stage: kp.stage,
        subject_id: kp.subjectId,
        grade_band: kp.gradeBand,
        prompt_version: PROMPT_VERSION,
        model: MODEL,
        generated_at: new Date().toISOString(),
      },
    };
  });
}

async function main() {
  const kps = loadCurated();
  const selected = LIMIT > 0 ? kps.slice(0, LIMIT) : kps;
  if (selected.length === 0) {
    console.log("没有符合条件的高置信度知识点。");
    return;
  }

  ensureDir(OUT);
  const promptsPath = path.join(OUT, "prompts.jsonl");
  const questionsPath = path.join(OUT, "questions.jsonl");
  const errorsPath = path.join(OUT, "errors.jsonl");
  const summaryPath = path.join(OUT, "run-summary.json");
  const done = readDoneSourceIds(questionsPath);
  const pending = selected.filter(kp => !done.has(kp.id));

  console.log("=== K12 出题 ===");
  console.log(`模式: ${DRY_RUN ? "dry-run（只写提示词）" : "LLM 生成"}`);
  console.log(`知识点候选: ${kps.length}，本次选择: ${selected.length}，已完成跳过: ${selected.length - pending.length}`);
  console.log(
    `stage=${STAGE || "all"} subject=${SUBJECT || "all"} grade=${GRADE || "all"} count=${COUNT} types=${TYPES.join(",") || "subject-default"}`,
  );
  console.log(`model=${MODEL} base=${BASE} concurrency=${CONCURRENCY}`);
  console.log(`输出: ${path.relative(ROOT, OUT)}`);

  if (!DRY_RUN && !KEY) {
    throw new Error("未设置 LLM_API_KEY。先加 --dry-run 看提示词，或配置 Key 后再生成。");
  }

  const started = Date.now();
  let ok = 0;
  let failed = 0;

  if (DRY_RUN) {
    const lines = [];
    for (const kp of pending) {
      const prompt = buildQuestionPrompt(kp, { count: COUNT, types: TYPES });
      lines.push(
        JSON.stringify({
          source_kp_id: kp.id,
          source_kp_name: kp.canonicalName,
          stage: kp.stage,
          subject_id: kp.subjectId,
          confidence: kp.confidence,
          assessability: kp.assessability,
          ...prompt,
        }),
      );
    }
    fs.writeFileSync(promptsPath, lines.join("\n") + (lines.length ? "\n" : ""), "utf8");
    ok = lines.length;
  } else {
    const qStream = fs.createWriteStream(questionsPath, { flags: "a" });
    const eStream = fs.createWriteStream(errorsPath, { flags: "a" });
    await pool(
      pending,
      async kp => {
        const prompt = buildQuestionPrompt(kp, { count: COUNT, types: TYPES });
        try {
          const parsed = await callLLM(prompt);
          const questions = normalizeQuestionBatch(kp, parsed);
          qStream.write(
            JSON.stringify({
              source_kp_id: kp.id,
              source_kp_name: kp.canonicalName,
              stage: kp.stage,
              subject_id: kp.subjectId,
              grade_band: kp.gradeBand,
              questions,
            }) + "\n",
          );
          ok++;
          console.log(`  ✓ ${kp.canonicalName} (${questions.length})`);
        } catch (e) {
          failed++;
          eStream.write(
            JSON.stringify({
              source_kp_id: kp.id,
              source_kp_name: kp.canonicalName,
              error: String(e?.message || e),
              at: new Date().toISOString(),
            }) + "\n",
          );
          console.log(`  ✗ ${kp.canonicalName}: ${e?.message || e}`);
        }
      },
      CONCURRENCY,
    );
    await new Promise(resolve => qStream.end(resolve));
    await new Promise(resolve => eStream.end(resolve));
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    mode: DRY_RUN ? "dry-run" : "llm",
    promptVersion: PROMPT_VERSION,
    model: DRY_RUN ? null : MODEL,
    base: DRY_RUN ? null : BASE,
    sessionId: DRY_RUN ? null : SESSION_ID,
    filters: {
      stage: STAGE || null,
      subject: SUBJECT || null,
      grade: GRADE || null,
      minConfidence: MIN_CONFIDENCE,
      minAssessability: MIN_ASSESSABILITY,
      types: TYPES,
      count: COUNT,
      only: ONLY || null,
      kpFile: KP_FILE || null,
    },
    candidates: kps.length,
    selected: selected.length,
    pending: pending.length,
    ok,
    failed,
    elapsedMs: Date.now() - started,
    outputs: {
      prompts: DRY_RUN ? path.relative(ROOT, promptsPath) : null,
      questions: DRY_RUN ? null : path.relative(ROOT, questionsPath),
      errors: DRY_RUN ? null : path.relative(ROOT, errorsPath),
    },
  };
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2), "utf8");

  console.log(`完成：ok=${ok} failed=${failed}，耗时 ${Math.round(summary.elapsedMs / 1000)}s`);
  console.log(`摘要: ${path.relative(ROOT, summaryPath)}`);
}

main().catch(e => {
  console.error("❌ 出题失败:", e?.message || e);
  process.exit(1);
});

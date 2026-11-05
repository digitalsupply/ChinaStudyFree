/**
 * reports.ts — 学生题目反馈的轻量回收存储。
 *
 * 设计目标：
 *   - 不引入数据库 / 账号系统；JSONL 追加写，方便 Git/备份/导出。
 *   - 按报告 id 去重，客户端重试不会重复入库。
 *   - 不保存任何学生身份信息：只保留题目定位、反馈类型和当次作答。
 *   - 管理接口只读，修正/删除仍走 k12/corrections + apply-corrections。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

export const REPORTS_ENABLED = process.env.REPORT_UPLOAD_ENABLED !== "false";

const REPORT_DIR = process.env.REPORT_DIR
  ? path.resolve(process.env.REPORT_DIR)
  : path.join(ROOT, "data", "reports");
const REPORT_FILE = path.join(REPORT_DIR, "reports.jsonl");

export const REPORT_KINDS = new Set([
  "question_wrong",
  "answer_should_count",
  "audio_issue",
  "formula_issue",
  "figure_issue",
]);

export interface ReportRecord {
  id: string;
  lessonId: string;
  questionId: number;
  questionText: string;
  kind: string;
  createdAt: string;
  answerGiven?: string;
  sourceKey?: string;
}

let seenIds: Set<string> | null = null;

function ensureLoaded(): void {
  if (seenIds) return;
  seenIds = new Set();
  try {
    if (!fs.existsSync(REPORT_FILE)) return;
    const lines = fs.readFileSync(REPORT_FILE, "utf8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const rec = JSON.parse(line) as ReportRecord;
        if (rec?.id) seenIds.add(rec.id);
      } catch {
        /* 忽略损坏行 */
      }
    }
  } catch {
    /* 读不到就按空集处理 */
  }
}

function asString(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s || s.length > max) return null;
  return s;
}

function optionalString(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (!s) return undefined;
  return s.slice(0, max);
}

export type AddReportResult =
  | { ok: true; id: string; duplicate: boolean }
  | { ok: false; error: string };

export function addReport(input: unknown): AddReportResult {
  if (!REPORTS_ENABLED) return { ok: false, error: "反馈回收未启用" };
  if (!input || typeof input !== "object") return { ok: false, error: "反馈内容不是对象" };
  const b = input as Record<string, unknown>;

  const id = asString(b.id, 100);
  const lessonId = asString(b.lessonId, 200);
  const questionText = asString(b.questionText, 500);
  const kind = asString(b.kind, 40);
  const questionId = Number(b.questionId);
  if (!id || !lessonId || !questionText || !kind) {
    return { ok: false, error: "缺少 id / lessonId / questionText / kind" };
  }
  if (!Number.isInteger(questionId) || questionId < 0) {
    return { ok: false, error: "questionId 非法" };
  }
  if (!REPORT_KINDS.has(kind)) {
    return { ok: false, error: "未知反馈类型" };
  }

  ensureLoaded();
  if (seenIds!.has(id)) return { ok: true, id, duplicate: true };

  let createdAt = optionalString(b.createdAt, 40);
  if (!createdAt) createdAt = new Date().toISOString();
  const answerGiven = optionalString(b.answerGiven, 500);
  const sourceKey = optionalString(b.sourceKey, 300);

  const record: ReportRecord = {
    id,
    lessonId,
    questionId,
    questionText,
    kind,
    createdAt,
    ...(answerGiven ? { answerGiven } : {}),
    ...(sourceKey ? { sourceKey } : {}),
  };

  try {
    fs.mkdirSync(REPORT_DIR, { recursive: true });
    fs.appendFileSync(REPORT_FILE, JSON.stringify(record) + "\n", "utf8");
    seenIds!.add(id);
    return { ok: true, id, duplicate: false };
  } catch (e) {
    return { ok: false, error: `写入反馈失败: ${(e as Error).message}` };
  }
}

export function listReports(limit = 200): ReportRecord[] {
  const max = Math.max(1, Math.min(Number(limit) || 200, 2000));
  if (!fs.existsSync(REPORT_FILE)) return [];
  const byId = new Map<string, ReportRecord>();
  for (const line of fs.readFileSync(REPORT_FILE, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line) as ReportRecord;
      if (rec?.id) byId.set(rec.id, rec);
    } catch {
      /* ignore */
    }
  }
  return [...byId.values()]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, max);
}

export interface ReportSummary {
  total: number;
  byKind: Record<string, number>;
  bySourceKey: Array<{
    sourceKey: string;
    count: number;
    kinds: Record<string, number>;
    latest: string;
  }>;
  latest: ReportRecord | null;
}

export function summarizeReports(): ReportSummary {
  const reports = listReports(2000);
  const byKind: Record<string, number> = {};
  const groups = new Map<string, { count: number; kinds: Record<string, number>; latest: string }>();
  for (const r of reports) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    const key = r.sourceKey || "(no sourceKey)";
    const g = groups.get(key) || { count: 0, kinds: {}, latest: "" };
    g.count++;
    g.kinds[r.kind] = (g.kinds[r.kind] || 0) + 1;
    if (r.createdAt > g.latest) g.latest = r.createdAt;
    groups.set(key, g);
  }
  const bySourceKey = [...groups.entries()]
    .map(([sourceKey, g]) => ({ sourceKey, ...g }))
    .sort((a, b) => b.count - a.count);
  return {
    total: reports.length,
    byKind,
    bySourceKey,
    latest: reports[0] || null,
  };
}

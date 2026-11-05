#!/usr/bin/env node
/**
 * reports.mjs — 查看/汇总学生题目反馈
 *
 * 两种来源：
 *   1. 本机 JSONL：data/reports/reports.jsonl（服务端同机）
 *   2. 管理 API：GET /api/admin/reports（需要 ADMIN_TOKEN）
 *
 * 用法：
 *   node scripts/k12/reports.mjs --file data/reports/reports.jsonl
 *   ADMIN_TOKEN=xxx node scripts/k12/reports.mjs --url http://127.0.0.1:8787
 *   ADMIN_TOKEN=xxx node scripts/k12/reports.mjs --export data/reports/summary.json
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..", "..");

const argv = process.argv.slice(2);
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

const URL_BASE = String(arg("url", process.env.REPORT_API_URL || "http://127.0.0.1:8787")).replace(/\/$/, "");
const TOKEN = String(arg("token", process.env.ADMIN_TOKEN || ""));
const FILE = typeof arg("file", "") === "string" ? String(arg("file")) : "";
const LIMIT = num(arg("limit", 200), 200);
const EXPORT = typeof arg("export", "") === "string" ? String(arg("export")) : "";
const LOCAL_DEFAULT = path.join(ROOT, "data", "reports", "reports.jsonl");

function readLocal(file) {
  if (!fs.existsSync(file)) throw new Error(`找不到本地反馈文件: ${file}`);
  const byId = new Map();
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      const rec = JSON.parse(line);
      if (rec?.id) byId.set(rec.id, rec);
    } catch {
      /* ignore */
    }
  }
  return [...byId.values()];
}

async function readApi() {
  if (!TOKEN) throw new Error("缺少 ADMIN_TOKEN；请用 --token 或环境变量提供");
  const headers = { "x-admin-token": TOKEN };
  const res = await fetch(`${URL_BASE}/api/admin/reports?limit=${LIMIT}`, { headers });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${t.slice(0, 300)}`);
  }
  const data = await res.json();
  return Array.isArray(data.reports) ? data.reports : [];
}

function summarize(reports) {
  const byKind = {};
  const groups = new Map();
  for (const r of reports) {
    byKind[r.kind] = (byKind[r.kind] || 0) + 1;
    const key = r.sourceKey || "(no sourceKey)";
    const g = groups.get(key) || { sourceKey: key, count: 0, kinds: {}, latest: "" };
    g.count++;
    g.kinds[r.kind] = (g.kinds[r.kind] || 0) + 1;
    if (String(r.createdAt || "") > g.latest) g.latest = String(r.createdAt || "");
    groups.set(key, g);
  }
  return {
    total: reports.length,
    byKind,
    bySourceKey: [...groups.values()].sort((a, b) => b.count - a.count),
    latest: reports[0] || null,
  };
}

async function main() {
  let reports;
  let source;
  if (FILE) {
    reports = readLocal(path.resolve(ROOT, FILE));
    source = path.relative(ROOT, path.resolve(ROOT, FILE));
  } else if (fs.existsSync(LOCAL_DEFAULT)) {
    reports = readLocal(LOCAL_DEFAULT);
    source = path.relative(ROOT, LOCAL_DEFAULT);
  } else {
    reports = await readApi();
    source = `${URL_BASE}/api/admin/reports`;
  }
  reports = [...reports].sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const summary = summarize(reports);

  console.log("=== K12 学生题目反馈 ===");
  console.log(`来源: ${source}`);
  console.log(`总数: ${summary.total}`);
  console.log("类型:", summary.byKind);
  console.log("按来源键聚合（前 20）:");
  for (const g of summary.bySourceKey.slice(0, 20)) {
    console.log(`  ${String(g.count).padStart(3)}  ${g.sourceKey}  ${JSON.stringify(g.kinds)}  最新 ${g.latest}`);
  }
  if (summary.latest) {
    console.log("最新一条:", {
      id: summary.latest.id,
      kind: summary.latest.kind,
      sourceKey: summary.latest.sourceKey,
      question: String(summary.latest.questionText || "").slice(0, 60),
    });
  }

  if (EXPORT) {
    const out = path.resolve(ROOT, EXPORT);
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(
      out,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source,
          ...summary,
        },
        null,
        2,
      ),
      "utf8",
    );
    console.log(`导出: ${path.relative(ROOT, out)}`);
  }
}

main().catch(e => {
  console.error("❌ 读取反馈失败:", e?.message || e);
  process.exit(1);
});

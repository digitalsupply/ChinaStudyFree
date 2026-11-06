"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

/** 管理页只在浏览器里保存 token；不会写入服务端、也不进构建产物。 */
const TOKEN_KEY = "csf-admin-token";

const KIND_LABELS: Record<string, string> = {
  question_wrong: "题目有误",
  answer_should_count: "答案应该算对",
  audio_issue: "音频有问题",
  formula_issue: "公式/符号有问题",
  figure_issue: "图示/表格有问题",
};

const KIND_COLORS: Record<string, string> = {
  question_wrong: "bg-cardinal/10 text-cardinal",
  answer_should_count: "bg-primary/10 text-primary-dark",
  audio_issue: "bg-secondary/10 text-secondary-dark",
  formula_issue: "bg-warning/20 text-[#9a6b00]",
  figure_issue: "bg-beetle/15 text-[#8a3fd1]",
};

interface ReportRecord {
  id: string;
  lessonId: string;
  questionId: number;
  questionText: string;
  kind: string;
  createdAt: string;
  answerGiven?: string;
  sourceKey?: string;
}

interface ReportSummary {
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

function kindLabel(kind: string): string {
  return KIND_LABELS[kind] || kind;
}

function formatTime(value?: string): string {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("zh-CN", { hour12: false });
}

export function AdminClient() {
  const [token, setToken] = useState("");
  const [draft, setDraft] = useState("");
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [reports, setReports] = useState<ReportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState("");
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");

  const load = useCallback(async (adminToken: string) => {
    const value = adminToken.trim();
    if (!value) {
      setError("请先填写管理员令牌（ADMIN_TOKEN）。");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const headers = { "x-admin-token": value };
      const [summaryRes, listRes] = await Promise.all([
        fetch("/api/admin/reports/summary", { headers, cache: "no-store" }),
        fetch("/api/admin/reports?limit=500", { headers, cache: "no-store" }),
      ]);
      if (summaryRes.status === 401 || listRes.status === 401) {
        throw new Error("令牌无效，或当前网络不在管理白名单内。");
      }
      if (!summaryRes.ok || !listRes.ok) {
        throw new Error(`接口返回异常（summary=${summaryRes.status}, list=${listRes.status}）。`);
      }
      const summaryData = (await summaryRes.json()) as ReportSummary & { ok?: boolean };
      const listData = (await listRes.json()) as { ok?: boolean; reports?: ReportRecord[] };
      setSummary({
        total: Number(summaryData.total) || 0,
        byKind: summaryData.byKind || {},
        bySourceKey: Array.isArray(summaryData.bySourceKey) ? summaryData.bySourceKey : [],
        latest: summaryData.latest || null,
      });
      setReports(Array.isArray(listData.reports) ? listData.reports : []);
      setToken(value);
      setLastLoadedAt(new Date().toISOString());
      localStorage.setItem(TOKEN_KEY, value);
    } catch (e) {
      setError((e as Error).message || "加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY) || "";
    if (!saved) return;
    setToken(saved);
    setDraft(saved);
    void load(saved);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return reports.filter(r => {
      if (kind !== "all" && r.kind !== kind) return false;
      if (!q) return true;
      return [r.questionText, r.lessonId, r.sourceKey, r.id, r.answerGiven]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q));
    });
  }, [reports, query, kind]);

  const kinds = useMemo(() => {
    const set = new Set<string>(Object.keys(KIND_LABELS));
    for (const r of reports) set.add(r.kind);
    return [...set];
  }, [reports]);

  const summaryCards = useMemo(() => {
    if (!summary) return [];
    return [
      { label: "反馈总数", value: summary.total, tone: "text-ink" },
      ...Object.entries(summary.byKind).map(([k, v]) => ({
        label: kindLabel(k),
        value: v,
        tone: "text-ink",
      })),
    ];
  }, [summary]);

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(JSON.stringify({ summary, reports }, null, 2));
      setError("");
    } catch {
      setError("浏览器不允许写剪贴板，请手动导出。");
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    setToken("");
    setDraft("");
    setSummary(null);
    setReports([]);
    setError("");
    setLastLoadedAt("");
  }

  return (
    <main className="min-h-screen bg-bg-soft px-4 py-8 pb-24">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-primary">ChinaStudyFree</p>
            <h1 className="mt-1 text-3xl font-extrabold text-ink">反馈管理台</h1>
            <p className="mt-1 text-sm text-ink-light">
              只读查看学生提交的题目反馈。修正/删除仍通过 <code>k12/corrections</code> 与命令行执行。
            </p>
          </div>
          <div className="text-right text-xs text-ink-light">
            <div>管理域名：admin.studyfree.xyz</div>
            {lastLoadedAt && <div>最近加载：{formatTime(lastLoadedAt)}</div>}
          </div>
        </header>

        <section className="rounded-3xl border-2 border-bg-softer bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-end">
            <label className="flex-1">
              <span className="mb-1 block text-sm font-extrabold text-ink">管理员令牌</span>
              <input
                type="password"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") void load(draft);
                }}
                placeholder="ADMIN_TOKEN"
                autoComplete="off"
                className="w-full rounded-2xl border-2 border-bg-softer bg-bg-soft px-4 py-3 text-sm text-ink outline-none focus:border-primary"
              />
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void load(draft)}
                disabled={loading}
                className="btn-chunky-primary disabled:opacity-60"
              >
                {loading ? "加载中…" : token ? "重新加载" : "连接"}
              </button>
              <button type="button" onClick={clearToken} className="btn-chunky-ghost">
                清除
              </button>
            </div>
          </div>
          <p className="mt-2 text-xs text-ink-softer">
            令牌只保存在本机 localStorage，不会上传。管理接口还需要来源 IP 在内网白名单内。
          </p>
          {error && (
            <div className="mt-3 rounded-2xl border border-cardinal/30 bg-cardinal/10 px-4 py-3 text-sm font-bold text-cardinal">
              {error}
            </div>
          )}
        </section>

        {summary && (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
              {summaryCards.map(card => (
                <div
                  key={card.label}
                  className="rounded-2xl border-2 border-bg-softer bg-white px-4 py-3 shadow-sm"
                >
                  <div className="text-xs font-bold text-ink-light">{card.label}</div>
                  <div className={`mt-1 text-2xl font-extrabold ${card.tone}`}>{card.value}</div>
                </div>
              ))}
            </section>

            <section className="rounded-3xl border-2 border-bg-softer bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-extrabold text-ink">最新反馈</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="搜索题目 / lessonId / sourceKey"
                    className="w-56 rounded-xl border-2 border-bg-softer bg-bg-soft px-3 py-2 text-sm outline-none focus:border-primary"
                  />
                  <select
                    value={kind}
                    onChange={e => setKind(e.target.value)}
                    className="rounded-xl border-2 border-bg-softer bg-bg-soft px-3 py-2 text-sm font-bold text-ink outline-none focus:border-primary"
                  >
                    <option value="all">全部类型</option>
                    {kinds.map(k => (
                      <option key={k} value={k}>
                        {kindLabel(k)}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void load(token)} disabled={loading} className="btn-chunky-sm bg-secondary">
                    刷新
                  </button>
                  <button type="button" onClick={() => void copyJson()} className="btn-chunky-sm bg-ink-light">
                    复制 JSON
                  </button>
                </div>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-bg-softer text-xs uppercase tracking-wide text-ink-light">
                      <th className="px-2 py-2">时间</th>
                      <th className="px-2 py-2">类型</th>
                      <th className="px-2 py-2">题目</th>
                      <th className="px-2 py-2">lessonId</th>
                      <th className="px-2 py-2">sourceKey</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(r => (
                      <tr key={r.id} className="border-b border-bg-softer/70 align-top">
                        <td className="whitespace-nowrap px-2 py-3 text-xs text-ink-light">{formatTime(r.createdAt)}</td>
                        <td className="px-2 py-3">
                          <span
                            className={`inline-flex whitespace-nowrap rounded-full px-2 py-1 text-xs font-extrabold ${
                              KIND_COLORS[r.kind] || "bg-bg-softer text-ink-light"
                            }`}
                          >
                            {kindLabel(r.kind)}
                          </span>
                        </td>
                        <td className="max-w-[360px] px-2 py-3">
                          <div className="font-bold text-ink">{r.questionText}</div>
                          {r.answerGiven && <div className="mt-1 text-xs text-ink-light">作答：{r.answerGiven}</div>}
                        </td>
                        <td className="px-2 py-3 font-mono text-xs text-ink-light">{r.lessonId}</td>
                        <td className="px-2 py-3 font-mono text-xs text-ink-light">{r.sourceKey || "-"}</td>
                      </tr>
                    ))}
                    {filtered.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-2 py-10 text-center text-sm text-ink-softer">
                          没有匹配的反馈
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {summary.bySourceKey.length > 0 && (
                <div className="mt-6">
                  <h3 className="text-sm font-extrabold text-ink">按 sourceKey 聚合</h3>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {summary.bySourceKey.slice(0, 24).map(g => (
                      <span
                        key={g.sourceKey}
                        className="rounded-xl border border-bg-softer bg-bg-soft px-3 py-2 font-mono text-xs text-ink-light"
                      >
                        {g.sourceKey} · {g.count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </section>
          </>
        )}

        {!summary && !loading && (
          <section className="rounded-3xl border-2 border-dashed border-bg-softer bg-white/60 p-10 text-center">
            <div className="text-lg font-extrabold text-ink">输入令牌后查看反馈</div>
            <p className="mt-2 text-sm text-ink-light">
              如果已经访问过，本页会自动读取上次保存的令牌。
            </p>
          </section>
        )}
      </div>
    </main>
  );
}

"use client";

/**
 * ReportSync — 把本机待上传的题目反馈，在在线时补传给后端。
 *
 * 设计：
 *   - 不阻塞答题；addReport 已会立即尝试一次。
 *   - 应用启动后延迟 1.2s 再补传，避免和首屏竞争。
 *   - 浏览器恢复网络时重置“不可用”标记并重试。
 *   - 后端未配置 / 静态站无 /api/reports 时，flushReportQueue 会自动停用本次会话。
 */

import { useEffect } from "react";
import { resetReportUpload, useProgressStore } from "@/store/progress";

export function ReportSync() {
  useEffect(() => {
    const flush = () => {
      void useProgressStore.getState().flushReportQueue();
    };
    const t = window.setTimeout(flush, 1200);
    const onOnline = () => {
      resetReportUpload();
      flush();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("online", onOnline);
    };
  }, []);

  return null;
}

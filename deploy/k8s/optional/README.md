# 可选能力

## HPA / 多副本

当前 `reports.ts` 使用本地 JSONL 追加写，**不要直接开多副本**：

- 每个 Pod 会写自己的本地文件
- RWO PVC 通常只能被单节点单 Pod 写
- 多副本会出现反馈分裂

要先做其中一件事：

1. 把 `reports.ts` 迁移到 Postgres（推荐）
2. 或把反馈写到对象存储 / 消息队列
3. 或关闭 `REPORT_UPLOAD_ENABLED=false` 后再开多副本

## ServiceMonitor / 指标

当前只有 `/api/health`，没有 Prometheus 指标端点。需要时再接入
`prom-client` 或 OpenTelemetry，不要凭空创建无效的 ServiceMonitor。

# 运维清单

适用于 `china-study-free` namespace 的单副本部署。

## 1. 上线前检查

- [ ] Harbor 项目 `china-study-free` 已创建
- [ ] `harbor-auth` imagePullSecret 可用
- [ ] `china-study-free-secrets` 已创建，`ADMIN_TOKEN` 是长随机串
- [ ] `china-study-free-tls` 证书已创建，或 cert-manager 已配置
- [ ] `study.example.com` DNS 指向 ingress-nginx
- [ ] `study-admin.internal` 仅内网可达
- [ ] `pvc-patch.yaml` 的 StorageClass 正确
- [ ] `CORS_ORIGIN` 与正式域名一致
- [ ] Pod 可出网访问 LLM/TTS/Gemini（如启用）
- [ ] `kubectl kustomize` 渲染无错误
- [ ] `kubectl apply --dry-run=server` 通过（有集群时）

## 2. 每日检查

### 2.1 可用性

```bash
kubectl -n china-study-free get pods
kubectl -n china-study-free rollout status deploy/china-study-free
curl -fsS https://study.example.com/api/health
```

关注：

- Pod 是否 `Running`，重启次数是否增长
- `/api/health` 是否 200
- `reports` 是否为 `true`（如果启用）

### 2.2 错误日志

```bash
kubectl -n china-study-free logs deploy/china-study-free --since=24h | grep -E 'error|Error|unhandled|EADDRINUSE' | tail -50
```

### 2.3 反馈写入

```bash
kubectl -n china-study-free exec deploy/china-study-free -- \
  sh -c 'wc -l /app/data/reports/reports.jsonl 2>/dev/null || echo 0'
```

如果持续为 0：

- 检查 `REPORT_UPLOAD_ENABLED`
- 检查 PVC 写权限
- 检查前端是否真的在提交

### 2.4 资源

```bash
kubectl -n china-study-free top pod
kubectl -n china-study-free describe pvc china-study-free-reports
```

关注：

- 内存是否接近 1Gi
- CPU 是否长期打满
- PVC 是否接近 1Gi

## 3. 每周检查

- [ ] `kubectl get pods` 无异常重启
- [ ] Ingress 证书剩余有效期 > 14 天
- [ ] Harbor 镜像 tag 与线上 Deployment 一致
- [ ] GitOps `newTag` 与线上一致
- [ ] Argo CD Application 为 `Synced / Healthy`
- [ ] 反馈 JSONL 备份一次
- [ ] AI 供应商余额/额度充足
- [ ] 检查 401/429/5xx 趋势

命令：

```bash
kubectl -n argocd get application china-study-free
kubectl -n china-study-free get deploy -o jsonpath='{.items[0].spec.template.spec.containers[0].image}'
```

## 4. 每月检查

- [ ] 依赖升级（npm audit / Dependabot）
- [ ] Node 基础镜像更新
- [ ] Harbor robot 账号密码轮换
- [ ] `ADMIN_TOKEN` 轮换
- [ ] LLM/TTS Key 轮换
- [ ] TLS 证书续期演练
- [ ] PVC 备份恢复演练
- [ ] 资源 requests/limits 复盘
- [ ] 清理旧镜像 tag（保留最近 10 个）
- [ ] 检查是否有必要迁移到 Postgres

## 5. 发布检查清单

### 发布前

- [ ] CI 通过：`type-check`、`build:data`、`validate:quizzes`
- [ ] 镜像 tag 是 git sha
- [ ] 变更内容已知（是否有数据库/反馈格式变化）
- [ ] 有回滚 tag
- [ ] 低峰期发布

### 发布中

```bash
kubectl -n china-study-free rollout status deploy/china-study-free --timeout=180s
kubectl -n china-study-free get pods
curl -fsS https://study.example.com/api/health
```

### 发布后

- [ ] 首页可打开
- [ ] `/data/index.json` 200
- [ ] 课程页可打开
- [ ] 答题可提交
- [ ] 反馈可提交
- [ ] 管理汇总可读
- [ ] 无 5xx 峰值

## 6. 告警建议

至少配置：

| 告警 | 条件 | 级别 |
|---|---|---|
| Pod 不可用 | `kube_deployment_status_replicas_available == 0` 持续 2m | P1 |
| 重启过多 | `increase(kube_pod_container_status_restarts_total[10m]) > 3` | P1 |
| HTTP 5xx | ingress 5xx 比例 > 5% 持续 5m | P1 |
| 延迟 | p95 > 5s 持续 10m | P2 |
| PVC 使用率 | > 80% | P2 |
| 证书过期 | < 14 天 | P2 |
| Argo OutOfSync | 持续 10m | P2 |
| AI 501/429 | 突增 | P3 |

## 7. 故障处理

### 7.1 Pod 起不来

```bash
kubectl -n china-study-free describe pod <pod>
kubectl -n china-study-free logs <pod> --previous
```

按顺序检查：

1. ImagePullBackOff → Harbor 凭据/网络
2. CreateContainerConfigError → Secret/ConfigMap 缺失
3. CrashLoopBackOff → 端口/权限/环境变量
4. Pending → 资源不足/PVC 无法绑定

### 7.2 502 / 504

```bash
kubectl -n china-study-free get pods
kubectl -n china-study-free port-forward svc/china-study-free 8787:80
curl -v http://127.0.0.1:8787/api/health
```

- Pod 内正常、外部 502 → Ingress/Service/NetworkPolicy
- 504 → AI 请求超时；调大 Ingress timeout 或检查供应商
- NetworkPolicy 是否只允许 ingress-nginx

### 7.3 反馈写失败

```bash
kubectl -n china-study-free exec deploy/china-study-free -- \
  sh -c 'id; ls -ld /app/data/reports; touch /app/data/reports/.probe'
```

- `runAsUser=1000` 与 PVC 权限
- `fsGroup=1000`
- StorageClass 是否支持
- PVC 是否 ReadOnlyMany/错误挂载

### 7.4 AI 不工作

```bash
curl -s https://study.example.com/api/health
```

- `llm:false` → Secret 没有 `LLM_API_KEY`
- `ttsBackend:none` → DashScope 未配且 EdgeTTS 关闭
- 网络策略是否放行 443
- 供应商 429/余额
- EdgeTTS 端点变更（非官方服务）

### 7.5 Argo CD OutOfSync

```bash
kubectl -n argocd get application china-study-free -o yaml
```

- GitOps 仓库是否有新 commit
- Argo 是否能拉 GitOps 仓库
- 是否有手动 kubectl 改动（selfHeal 会覆盖）
- `prune` 是否误删资源

### 7.6 回滚

```bash
kubectl -n china-study-free rollout undo deploy/china-study-free
kubectl -n china-study-free rollout status deploy/china-study-free
```

然后同步修改 GitOps 的 `newTag`，否则 Argo 会再次升级。

## 8. 备份与恢复

### 8.1 反馈 JSONL

```bash
kubectl -n china-study-free exec deploy/china-study-free -- \
  cat /app/data/reports/reports.jsonl > backup/reports-$(date +%F).jsonl
```

恢复：

```bash
kubectl -n china-study-free cp backup/reports-2026-11-05.jsonl \
  china-study-free-<pod>:/app/data/reports/reports.jsonl
```

注意：单副本时操作；恢复前先停 Pod，避免并发写。

### 8.2 GitOps 仓库

GitOps 仓库本身就是配置备份，确保：

- 有远端备份
- 有 tag/commit 历史
- 不要强推 main

## 9. 安全清单

- [ ] `ADMIN_TOKEN` 长随机，定期轮换
- [ ] `ADMIN_TOKEN` 不在前端 bundle
- [ ] `/api/admin` 不暴露公网
- [ ] Secret 不进 Git
- [ ] Harbor robot 只读拉取
- [ ] GitOps 凭据只写 GitOps 仓库
- [ ] 容器 `runAsNonRoot`、drop ALL
- [ ] NetworkPolicy 限制入口/出口
- [ ] 定期 `npm audit`
- [ ] 不把学生反馈导出文件随意外发

## 10. 容量与扩展

当前：

```text
replicas: 1
requests: 100m / 256Mi
limits:   1 CPU / 1Gi
PVC:      1Gi
```

扩展前必须：

- 反馈迁移到 Postgres/对象存储
- 把 Deployment 改为 RollingUpdate
- 加 HPA / PDB
- 加 ServiceMonitor / 指标
- 做多副本压测

## 11. 日常命令速查

```bash
# 状态
kubectl -n china-study-free get all,pvc,ingress
kubectl -n china-study-free rollout status deploy/china-study-free

# 日志
kubectl -n china-study-free logs deploy/china-study-free -f

# 重启
kubectl -n china-study-free rollout restart deploy/china-study-free

# 健康
curl -fsS https://study.example.com/api/health

# 反馈
kubectl -n china-study-free exec deploy/china-study-free -- \
  tail -20 /app/data/reports/reports.jsonl

# 管理汇总
ADMIN_TOKEN=... npm run k12:reports -- --url https://study-admin.internal
```

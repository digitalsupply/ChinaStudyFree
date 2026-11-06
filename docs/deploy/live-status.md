# 当前集群部署状态

> 记录时间：2026-11-06  
> 集群 kubeconfig：`/root/.kube/deeptutor-config`  
> context：`kubernetes-admin@kubernetes`

## 1. 线上对象

| 项目 | 值 |
|---|---|
| namespace | `china-study-free` |
| Argo CD Application | `argocd/china-study-free` |
| Argo 状态 | 最近确认 `Synced / Healthy`；2026-11-06 集群 API 不可达，新版本待同步 |
| GitOps 仓库 | `http://192.168.67.201/digitalsupply/china-study-free-gitops.git` |
| GitOps revision | `655ba73`（含动态资源路由 + SW v2，待集群恢复后同步） |
| 镜像 | `192.168.67.202:8443/china-study-free/web:694f79f` |
| Deployment | `china-study-free`，1 副本 |
| Service | `china-study-free`，ClusterIP 80 → 8787 |
| IngressClass | `traefik` |
| Traefik LB | `10.0.0.252` |
| PVC | `china-study-free-reports`，1Gi，`nfs-sc` |
| 大资源 PVC | `china-study-free-assets`，8Gi，`nfs-sc`（已写入 GitOps，待同步） |
| 大资源镜像 | `192.168.67.202:8443/china-study-free/assets:v1.4.0` |
| TLS Secret | `studyfree-xyz-tls`（自签，含两个域名 + 10.0.0.252） |
| 反馈存储 | `/app/data/reports/reports.jsonl`（PVC） |

## 2. 地址

```text
Web:       https://studyfree.xyz
Admin UI:  https://admin.studyfree.xyz/
Admin API: https://admin.studyfree.xyz/api/admin/reports/summary
Health:    https://studyfree.xyz/api/health
```

管理页由 Traefik `replacePathRegex` 把 admin 域名根路径 `/` 重写到 `/admin/`，
页面内嵌在 Web 镜像中，输入 `ADMIN_TOKEN` 后读取反馈汇总。

域名到 `10.0.0.252` 的映射由部署侧 DNS 配置；当前执行环境（容器 DNS）
仍解析不到这两个域名，因此本文验证命令统一用 `--resolve` 指向 Traefik。

需要保证的 DNS 记录：

```text
A  studyfree.xyz        10.0.0.252
A  admin.studyfree.xyz  10.0.0.252
```

> `10.0.0.252` 是内网地址。如果要从公网访问，需要在边界做端口映射/反向代理，
> 或给 Traefik 一个公网 IP。Admin 域名建议只在内网 DNS 中存在。

在 DNS 生效前，可用 `--resolve` 验证：

```bash
curl -k --resolve studyfree.xyz:443:10.0.0.252 https://studyfree.xyz/api/health
curl -k --resolve admin.studyfree.xyz:443:10.0.0.252 \
  -H "x-admin-token: $ADMIN_TOKEN" \
  https://admin.studyfree.xyz/api/admin/reports/summary

# 管理页（浏览器打开 admin.studyfree.xyz 即可，需内网来源）
curl -k -o /dev/null -w '%{http_code}\n' --resolve admin.studyfree.xyz:443:10.0.0.252 \
  https://admin.studyfree.xyz/
```

## 3. GitOps 自动发布链路

已实际验证：

```text
git push studyfree source main
  → GitLab webhook http://10.0.0.252/china-study-free-hook
  → Tekton PipelineRun china-study-free-cicd-*
  → BuildKit 构建 + push Harbor
  → 更新 china-study-free-gitops/overlays/prod/kustomization.yaml 的 newTag
  → Argo CD 自动同步
  → Deployment 滚动更新
```

相关对象：

```text
cicd/china-study-free-cicd
cicd/china-study-free-build-push
cicd/china-study-free-update-gitops
cicd/china-study-free-listener
cicd/el-china-study-free-listener
cicd/china-study-free-gitlab-auth
cicd/china-study-free-webhook-secret
argocd/china-study-free
argocd/china-study-free-repo-secret
```

GitLab webhook：

```text
Project: digitalsupply/ChinaStudyFree
URL:     http://10.0.0.252/china-study-free-hook
Event:   Push Hook
Branch:  main
```

## 4. 当前 AI 配置

`/api/health` 当前：

```json
{
  "ok": true,
  "llm": false,
  "tts": true,
  "ttsBackend": "edge",
  "image": false,
  "reports": true
}
```

说明：

- LLM 未配置 Key
- TTS 走免费 EdgeTTS
- Gemini 配图未配置
- 反馈回收已启用

要开启 AI：

```bash
kubectl -n china-study-free patch secret china-study-free-secrets \
  --type merge \
  -p '{"stringData":{"LLM_API_KEY":"sk-...","DASHSCOPE_API_KEY":"...","GEMINI_API_KEY":"..."}}'
kubectl -n china-study-free rollout restart deploy/china-study-free
```

如果要让应用使用 OpenCode Go / 其他兼容端点，还需要改 ConfigMap：

```bash
kubectl -n china-study-free patch configmap china-study-free-config \
  --type merge \
  -p '{"data":{"LLM_BASE_URL":"https://opencode.ai/inference/go/openai/v1","LLM_MODEL":"deepseek-v4.1-flash"}}'
kubectl -n china-study-free rollout restart deploy/china-study-free
```

> 注意：这会让所有在线用户共用该 Key。是否启用、额度、限流需要单独评估。

## 5. 注意事项

### DNS

当前 `studyfree.xyz` 没有 A 记录，浏览器会直接失败。必须先配 DNS。

### TLS

当前是自签证书，浏览器会提示不受信任。正式使用建议：

- cert-manager + Let's Encrypt（需要公网可达）
- 或替换为企业内部 CA 签发的证书

替换：

```bash
kubectl -n china-study-free create secret tls studyfree-xyz-tls \
  --cert=fullchain.pem --key=privkey.pem \
  --dry-run=client -o yaml | kubectl apply -f -
```

### 单副本

当前固定 1 副本 + RWO PVC。不要直接 `kubectl scale` 到 2。

### Admin 白名单

`Middleware china-study-free-admin-allow` 只允许：

```text
10.0.0.0/8
172.16.0.0/12
192.168.0.0/16
```

从公网访问 admin 会被拒绝；这是预期行为。

### 公网 host 的 /api/admin

`studyfree.xyz/api/admin` 也有更长的 PathPrefix 路由并绑定同一个 IP 白名单，
不是只靠 admin 域名保护。

### 大资源

`data/passages` / `data/stories` 已随仓库发布，用于生成阅读和故事 JSON。
音频、课本原页、故事配图不再打进应用镜像，改为 PVC：

```text
PVC: china-study-free-assets
挂载: /app/assets (readOnly)
目录: audio/ textbook-pages/ story-images/
```

应用镜像只保留课程 JSON。完整步骤见 [assets-pvc.md](assets-pvc.md)。

当前状态：资源镜像已推送到 Harbor，PVC/Deployment 清单已写入 GitOps；
资源加载 Job 已作为 Argo CD PostSync hook；集群 API 恢复后 Argo 同步会自动执行。

## 6. 常用验证

```bash
export KUBECONFIG=/root/.kube/deeptutor-config

kubectl -n argocd get application china-study-free
kubectl -n china-study-free get pods,svc,ingress,pvc
kubectl -n china-study-free logs deploy/china-study-free --tail=100

curl -k --resolve studyfree.xyz:443:10.0.0.252 https://studyfree.xyz/api/health
curl -k --resolve studyfree.xyz:443:10.0.0.252 -o /dev/null -w '%{http_code}\n' \
  https://studyfree.xyz/book/physics-k12-g8up/
```

## 7. 当前未完成项

- [ ] `studyfree.xyz` / `admin.studyfree.xyz` DNS A 记录
- [ ] 正式 TLS 证书（当前自签）
- [ ] LLM / TTS / Gemini Key（当前未配置）
- [ ] 如果要多副本：反馈迁移 Postgres
- [ ] 如果公网访问：边界端口映射/公网 IP
- [ ] 集群 API 恢复后同步 GitOps；Argo PostSync 会自动执行 `deploy/k8s/base/assets-loader-job.yaml`
- [ ] 验证 `/api/health` 的 `"assets": true` 及音频/课本页/故事图 200

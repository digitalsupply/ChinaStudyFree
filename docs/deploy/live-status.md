# 当前集群部署状态

> 记录时间：2026-11-05  
> 集群 kubeconfig：`/root/.kube/deeptutor-config`  
> context：`kubernetes-admin@kubernetes`

## 1. 线上对象

| 项目 | 值 |
|---|---|
| namespace | `china-study-free` |
| Argo CD Application | `argocd/china-study-free` |
| Argo 状态 | `Synced / Healthy` |
| GitOps 仓库 | `http://192.168.67.201/digitalsupply/china-study-free-gitops.git` |
| GitOps revision | `68eaf5a91541583c018b5c0aed2621511b2ff402` |
| 镜像 | `192.168.67.202:8443/china-study-free/web:8ca29b1287eafd87b4b48f5e92669c59b0e981c6` |
| Deployment | `china-study-free`，1 副本 |
| Service | `china-study-free`，ClusterIP 80 → 8787 |
| IngressClass | `traefik` |
| Traefik LB | `10.0.0.252` |
| PVC | `china-study-free-reports`，1Gi，`nfs-sc` |
| TLS Secret | `studyfree-xyz-tls`（自签，含两个域名 + 10.0.0.252） |
| 反馈存储 | `/app/data/reports/reports.jsonl`（PVC） |

## 2. 地址

```text
Web:      https://studyfree.xyz
Admin:    https://admin.studyfree.xyz
Health:   https://studyfree.xyz/api/health
Admin API:https://admin.studyfree.xyz/api/admin/reports/summary
```

管理页由 Traefik `replacePathRegex` 把 admin 域名根路径 `/` 重写到 `/admin/`，
页面内嵌在 Web 镜像中，输入 `ADMIN_TOKEN` 后读取反馈汇总。

**当前 DNS 尚未配置**：

```text
studyfree.xyz       NXDOMAIN
admin.studyfree.xyz NXDOMAIN
```

需要在 DNS 中添加：

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

镜像当前包含 `output/` 生成的课程数据，但不包含未入库的：

- `data/passages`
- `data/stories`
- `public/audio`
- `textbook-pages`
- `story-images`

需要完整离线资源时，另做对象存储或构建时注入。

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

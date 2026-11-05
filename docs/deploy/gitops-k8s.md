# GitOps / K8s 自动发布

> 当前集群已实际部署，实际对象/地址/状态见 [live-status.md](live-status.md)。

本文描述与 DeepTutor 类似的链路：

```text
GitLab push
  → Tekton 构建镜像
  → 推送 Harbor
  → 更新 china-study-free-gitops 的 image tag
  → Argo CD 检测 Git 变更
  → 同步到 K8s
```

## 1. 架构

```text
┌────────────────────┐
│ GitLab 192.168.67.201 │
│ digitalsupply/ChinaStudyFree │
└─────────┬──────────┘
          │ push webhook
          ▼
┌────────────────────┐
│ Tekton EventListener │
│ china-study-free-listener │
└─────────┬──────────┘
          ▼
┌────────────────────┐
│ Pipeline             │
│ clone → build-push   │
│ → update-gitops      │
└─────────┬──────────┘
          │ push
          ▼
┌────────────────────┐       ┌────────────────────┐
│ Harbor              │       │ GitLab GitOps repo  │
│ 192.168.67.202:8443 │       │ china-study-free-gitops │
└─────────┬──────────┘       └─────────┬──────────┘
          │ image pull                  │ watch
          ▼                             ▼
┌──────────────────────────────────────────────┐
│ K8s namespace: china-study-free              │
│ Deployment + Service + Ingress + PVC          │
└──────────────────────────────────────────────┘
```

## 2. 前提资源

假设集群已有 DeepTutor 的基础设施：

| 资源 | 默认值 | 说明 |
|---|---|---|
| GitLab | `http://192.168.67.201` | 源码 + GitOps 仓库 |
| Harbor | `192.168.67.202:8443` | 镜像仓库 |
| Tekton | `cicd` namespace | Pipeline / Triggers |
| BuildKit | `buildkitd.cicd.svc.cluster.local:1234` | 无特权构建 |
| Argo CD | `argocd` namespace | 同步 GitOps |
| StorageClass | `nfs-sc` | 反馈 PVC |
| Ingress | `traefik` | 外部入口 |
| imagePullSecret | `harbor-auth` | 拉 Harbor 镜像 |

如果名称不同，改 `deploy/tekton/*.yaml` 和 `deploy/k8s/overlays/prod/*`。

## 3. 关键设计决策

### 3.1 单副本 + PVC

`reports.ts` 写 `data/reports/reports.jsonl`，是单机追加写：

```yaml
replicas: 1
strategy:
  type: Recreate
volumeMounts:
  - name: reports
    mountPath: /app/data/reports
```

- `Recreate` 避免滚动更新时两个 Pod 同时挂 RWO PVC
- 第一版不要开 HPA
- 多副本必须先迁 Postgres/对象存储（见 `deploy/k8s/optional/README.md`）

### 3.2 镜像不可变 tag

镜像：

```text
192.168.67.202:8443/china-study-free/web:<git-sha>
```

不要使用 `latest`。回滚就是改回上一个 sha。

### 3.3 Secret 不进 Git

这些只放 K8s Secret：

```text
LLM_API_KEY
DASHSCOPE_API_KEY
GEMINI_API_KEY
ADMIN_TOKEN
```

Git 里只有 `secret.example.yaml`。

### 3.4 管理接口隔离

- 公网 host `studyfree.xyz` 上的 `/api/admin` 单独建一条更长 PathPrefix 路由，
  绑定 Traefik `Middleware`（IPAllowList）
- 内部 `admin.studyfree.xyz` 同样绑定 IPAllowList
- 再加 `ADMIN_TOKEN` 二次保护

Traefik Middleware：

```yaml
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: china-study-free-admin-allow
spec:
  ipAllowList:
    sourceRange:
      - 10.0.0.0/8
      - 172.16.0.0/12
      - 192.168.0.0/16
```

如果集群是 Traefik v2，把 API group 改为 `traefik.containo.us/v1alpha1`，
`ipAllowList` 改为 `ipWhiteList`。

### 3.5 AI 出网

Pod 需要访问：

- LLM API（默认 `https://api.openai.com/v1` 或你的兼容端点）
- DashScope TTS
- Gemini
- Microsoft EdgeTTS（`speech.platform.bing.com:443`）

`NetworkPolicy` 默认只放行 TCP 443 和 DNS。若用内网 HTTP LLM，需要自行加规则。

### 3.6 Traefik 路由

集群使用 Traefik（`ingressClass=traefik`，LB `10.0.0.252`）：

```text
https://studyfree.xyz          → Web
https://admin.studyfree.xyz    → 管理接口
```

TLS Secret：

```text
studyfree-xyz-tls
```

证书必须同时包含：

```text
DNS:studyfree.xyz
DNS:admin.studyfree.xyz
```

或分别签发两个 Secret 并改 Ingress。

标准 Ingress 注解：

```yaml
traefik.ingress.kubernetes.io/router.entrypoints: web,websecure
```

管理接口通过 Traefik Middleware 的 `ipAllowList` 限制内网；公网 host 的
`/api/admin` 也单独绑定同一个 Middleware。

## 4. GitOps 仓库初始化

建仓库：

```text
http://192.168.67.201/digitalsupply/china-study-free-gitops.git
```

在源码仓库根目录：

```bash
git clone http://192.168.67.201/digitalsupply/china-study-free-gitops.git /tmp/csf-gitops
cp -r deploy/k8s/base /tmp/csf-gitops/
cp -r deploy/k8s/overlays /tmp/csf-gitops/
cp deploy/gitops/argocd/application.yaml /tmp/csf-gitops/argocd-application.yaml
cd /tmp/csf-gitops
git add .
git commit -m "init china-study-free gitops"
git push origin main
```

最终：

```text
base/
overlays/prod/
argocd-application.yaml
```

`overlays/prod/kustomization.yaml` 的 `newTag` 是 CI 唯一需要改动的行。

## 5. K8s Secret

创建 namespace：

```bash
kubectl create namespace china-study-free
```

创建应用 Secret：

```bash
kubectl -n china-study-free create secret generic china-study-free-secrets \
  --from-literal=LLM_API_KEY='sk-...' \
  --from-literal=DASHSCOPE_API_KEY='sk-...' \
  --from-literal=GEMINI_API_KEY='...' \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)"
```

创建 Harbor 拉取 Secret（若已有 `harbor-auth` 可复用）：

```bash
kubectl -n china-study-free create secret docker-registry harbor-auth \
  --docker-server=192.168.67.202:8443 \
  --docker-username='robot$china-study-free' \
  --docker-password='...'
```

## 6. Tekton 配置

### 6.1 应用 Task / Pipeline / Trigger

```bash
kubectl apply -f deploy/tekton/task-build-push.yaml
kubectl apply -f deploy/tekton/task-update-gitops.yaml
kubectl apply -f deploy/tekton/pipeline.yaml
```

需要集群已有：

- `git-clone` Task（Tekton Catalog）
- `buildkitd.cicd`（或改 Task 里的 `BUILDKIT_HOST`）
- `harbor-auth` Secret
- `harbor-ca` ConfigMap
- `pipeline` ServiceAccount

### 6.2 GitOps 凭据

```bash
kubectl -n cicd create secret generic china-study-free-gitlab-auth \
  --from-literal=username=root \
  --from-literal=password='glpat-...'
```

该账号至少需要 GitOps 仓库的 `write_repository` 权限。

### 6.3 Webhook Secret

```bash
kubectl -n cicd create secret generic china-study-free-webhook-secret \
  --from-literal=secretToken="$(openssl rand -hex 24)"
```

记录这个 token，稍后填到 GitLab Webhook。

### 6.4 EventListener

```bash
kubectl apply -f deploy/tekton/triggers.yaml
```

获取 EventListener Service：

```bash
kubectl -n cicd get svc -l eventlistener=china-study-free-listener
```

如果沿用 DeepTutor 的 `el-*` Ingress 模式，为它配一个内部入口，例如：

```text
http://el-china-study-free.internal
```

GitLab 项目 → Settings → Webhooks：

```text
URL:    http://el-china-study-free.internal
Token:  <china-study-free-webhook-secret>
Event:  Push events
Branch: main
SSL:    off（内网 HTTP）
```

### 6.5 首次手动触发

如果不配 webhook，可先手动创建 PipelineRun：

```bash
kubectl -n cicd create -f - <<EOF
apiVersion: tekton.dev/v1
kind: PipelineRun
metadata:
  generateName: china-study-free-cicd-
spec:
  pipelineRef:
    name: china-study-free-cicd
  params:
    - name: git-url
      value: http://192.168.67.201/digitalsupply/ChinaStudyFree.git
    - name: git-revision
      value: main
    - name: image-tag
      value: manual-$(date +%s)
  workspaces:
    - name: shared-workspace
      volumeClaimTemplate:
        spec:
          accessModes: [ReadWriteOnce]
          resources:
            requests:
              storage: 2Gi
          storageClassName: nfs-sc
  taskRunTemplate:
    serviceAccountName: pipeline
    podTemplate:
      imagePullSecrets:
        - name: harbor-auth
EOF
```

## 7. Argo CD

```bash
kubectl -n argocd apply -f deploy/gitops/argocd/application.yaml
```

首次状态：

```bash
kubectl -n argocd get application china-study-free
argocd app get china-study-free
```

如果 Argo CD 无法访问私有 GitLab，需要配置 Repository Secret：

```bash
kubectl -n argocd create secret generic china-study-free-repo \
  --from-literal=type=git \
  --from-literal=url=http://192.168.67.201/digitalsupply/china-study-free-gitops.git \
  --from-literal=username=root \
  --from-literal=password='glpat-...'
kubectl -n argocd label secret china-study-free-repo \
  argocd.argoproj.io/secret-type=repository
```

## 8. 发布流程

1. 推送 `main`
2. GitLab webhook 触发 Tekton
3. Pipeline：
   - clone 源码
   - build/push `Harbor/.../web:<sha>`
   - clone GitOps 仓库
   - 修改 `overlays/prod/kustomization.yaml` 的 `newTag`
   - commit/push
4. Argo CD 检测变更
5. 滚动/重建 Deployment
6. 健康检查通过

## 9. 回滚

### GitOps 回滚（推荐）

在 GitOps 仓库：

```bash
git revert <promote-commit>
git push origin main
```

或手动把 `newTag` 改回上一个 sha：

```bash
sed -i 's/newTag:.*/newTag: <previous-sha>/' overlays/prod/kustomization.yaml
git commit -am "rollback to <previous-sha>"
git push
```

### 紧急回滚

```bash
kubectl -n china-study-free rollout undo deploy/china-study-free
kubectl -n china-study-free rollout status deploy/china-study-free
```

注意：紧急回滚后 Argo CD 可能把 Deployment 拉回 Git 状态；要同时修 GitOps。

## 10. 验证

```bash
kubectl -n china-study-free get pods,svc,ingress,pvc
kubectl -n china-study-free rollout status deploy/china-study-free
kubectl -n china-study-free port-forward svc/china-study-free 8787:80
curl -s http://127.0.0.1:8787/api/health
```

Web：

```bash
curl -I https://studyfree.xyz/
curl -s https://studyfree.xyz/api/health
```

反馈接口：

```bash
curl -s -X POST https://studyfree.xyz/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"id":"probe","lessonId":"l","questionId":1,"questionText":"probe","kind":"formula_issue"}'
```

管理接口（仅内网）：

```bash
curl -s -H "x-admin-token: $ADMIN_TOKEN" \
  https://admin.studyfree.xyz/api/admin/reports/summary
```

## 11. 已知限制

- 单副本：不能水平扩容，RollingUpdate 改 Recreate 会有短暂中断
- reports JSONL：多副本不安全，需 Postgres
- 大资源（音频/课本页/故事图）没有进 Git：完整离线内容需要额外对象存储或镜像构建阶段拉取
- AI 接口质量和成本取决于外部供应商
- EdgeTTS 是外部非官方端点，可能失效
- admin 路由依赖 Traefik Middleware；换网关要重做等价 IP 白名单

## 12. 本地校验

```bash
kubectl kustomize deploy/k8s/overlays/prod >/tmp/china-study-free.yaml
./deploy/scripts/render-manifests.sh <sha> /tmp/china-study-free.yaml
```

当前环境没有集群 kubeconfig，所以本文的清单只做了本地 `kubectl kustomize` 渲染验证；
实际 apply / Argo 同步需要在你的集群执行。

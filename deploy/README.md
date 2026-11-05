# deploy

K8s / GitOps 部署资源。

- `k8s/base`：通用 Deployment / Service / Ingress / PVC / NetworkPolicy
- `k8s/overlays/prod`：生产域名、StorageClass、CORS、镜像 tag
- `k8s/optional`：多副本/HPA 的前提说明
- `tekton`：GitLab push → BuildKit → Harbor → 更新 GitOps
- `gitops`：GitOps 仓库模板 + Argo CD Application
- `scripts`：渲染与 promote 辅助脚本

文档：

```text
docs/deploy/README.md
docs/deploy/gitops-k8s.md
docs/deploy/manual-deploy.md
docs/deploy/operations-checklist.md
```

本地校验：

```bash
kubectl kustomize deploy/k8s/overlays/prod >/tmp/china-study-free.yaml
```

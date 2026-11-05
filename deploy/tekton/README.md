# Tekton 自动发布

资源：

- `task-build-push.yaml`：BuildKit 构建并推 Harbor
- `task-update-gitops.yaml`：把新 tag 写入 GitOps 仓库
- `pipeline.yaml`：clone → build → promote
- `triggers.yaml`：GitLab push webhook（main）

## 前提

集群已有：

- Tekton Pipelines / Triggers
- `git-clone` Task（Tekton Catalog）
- `buildkitd.cicd.svc.cluster.local:1234`
- `harbor-auth` Secret（`.dockerconfigjson`）
- `harbor-ca` ConfigMap
- `pipeline` ServiceAccount

## 应用

```bash
kubectl apply -f deploy/tekton/task-build-push.yaml
kubectl apply -f deploy/tekton/task-update-gitops.yaml
kubectl apply -f deploy/tekton/pipeline.yaml
kubectl apply -f deploy/tekton/triggers.yaml
```

## 创建凭据

```bash
kubectl -n cicd create secret generic china-study-free-gitlab-auth \
  --from-literal=username=root \
  --from-literal=password='glpat-...'

kubectl -n cicd create secret generic china-study-free-webhook-secret \
  --from-literal=secretToken="$(openssl rand -hex 24)"
```

## GitLab Webhook

- URL：你的 EventListener 地址（例如 `http://el-china-study-free.internal`）
- Token：`china-study-free-webhook-secret` 的 `secretToken`
- Event：Push events
- Branch：main

## 手动 PipelineRun

见 `docs/deploy/gitops-k8s.md` 第 6.5 节。

## 注意

- 镜像 tag 使用 git revision（sha），不要 latest
- 源码仓库改 `deploy/k8s/base` 后，要同步到 GitOps 仓库的 `base/`
- GitOps 仓库只保存配置和 tag，不保存真实 Secret

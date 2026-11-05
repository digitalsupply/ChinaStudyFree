# ChinaStudyFree GitOps 仓库模板

推荐单独建一个仓库：

```text
http://192.168.67.201/digitalsupply/china-study-free-gitops.git
```

## 初始化

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

GitOps 仓库最终结构：

```text
base/
overlays/prod/
argocd-application.yaml
```

`overlays/prod/kustomization.yaml` 里的 `newTag` 是 CI 唯一需要改动的行；
Tekton 的 `china-study-free-update-gitops` 任务会更新它。

## 注册 Argo CD

```bash
kubectl -n argocd apply -f argocd-application.yaml
```

前提：Argo CD 能访问 GitLab 仓库。私有仓库需要在 Argo CD 配置 Repository Secret，
或把该仓库设为 internal/public。DeepTutor 集群可复用已有 GitLab 凭据模式。

## 注意

- 不要把真实 Secret 提交到 GitOps 仓库。
- `base/` 与源码仓库 `deploy/k8s/base` 可能随版本演进；升级时重新同步一次。
- 回滚 = 在 GitOps 仓库把 `newTag` 改回上一个 tag，Argo CD 自动同步。

# prod overlay

部署前至少修改：

1. `kustomization.yaml` 的 `newTag`（手动部署时）或由 CI 自动写入。
2. 两个 Ingress 的 host：
   - `studyfree.xyz` → 你的正式域名
   - `admin.studyfree.xyz` → 内网域名
3. `pvc-patch.yaml` 的 `storageClassName`（DeepTutor 集群通常是 `nfs-sc`）。
4. `configmap-patch.yaml` 的 `CORS_ORIGIN`。
5. 在 `china-study-free` namespace 创建 Secret：
   `china-study-free-secrets`（参考 `base/secret.example.yaml`）。
6. 确认 `harbor-auth` imagePullSecret 已存在，或改成你的 registry 凭据名。

渲染检查：

```bash
kubectl kustomize deploy/k8s/overlays/prod >/tmp/china-study-free.yaml
```

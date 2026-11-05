# 手动部署到 K8s

本文不依赖 Tekton/Argo，从构建镜像到 apply 全部手动完成。适合第一次上线、排障、
或临时环境。

## 0. 变量约定

```bash
export REGISTRY=192.168.67.202:8443
export PROJECT=china-study-free
export IMAGE=$REGISTRY/$PROJECT/web
export TAG=$(git rev-parse --short HEAD)
export NS=china-study-free
export DOMAIN=studyfree.xyz
export ADMIN_DOMAIN=admin.studyfree.xyz
```

下文命令默认在仓库根目录执行。

## 1. 构建镜像

### 方式 A：本机 Docker

```bash
docker login $REGISTRY
docker build \
  -f docker/Dockerfile \
  -t $IMAGE:$TAG \
  .
docker push $IMAGE:$TAG
```

如果集群不能拉 Docker Hub 的 `node:20-slim`，用内网镜像：

```bash
docker build \
  -f docker/Dockerfile \
  --build-arg NODE_IMAGE=$REGISTRY/library/node:20-slim \
  --build-arg NPM_REGISTRY=https://registry.npmmirror.com \
  -t $IMAGE:$TAG \
  .
```

### 方式 B：BuildKit

```bash
buildctl build \
  --frontend dockerfile.v0 \
  --local context=. \
  --local dockerfile=. \
  --opt filename=docker/Dockerfile \
  --opt target=runtime \
  --output type=image,name=$IMAGE:$TAG,push=true
```

### 构建前检查内容

Dockerfile 会执行：

```bash
npm run build:data || true
npm run sync:textbooks || true
npm run build:web
npm run build:server
```

- `output/` 必须存在，否则构建出的课程为空
- 音频/课本页/故事图默认不在 Git；需要完整离线资源时，构建前把它们放进
  `apps/web/public/` 对应目录，或改用对象存储
- `sync:textbooks` 依赖外网 GitHub；失败不会阻断构建

## 2. 创建 namespace

```bash
kubectl create namespace $NS --dry-run=client -o yaml | kubectl apply -f -
```

建议设置 Pod Security：

```bash
kubectl label namespace $NS \
  pod-security.kubernetes.io/enforce=baseline \
  --overwrite
```

## 3. 创建 Secret

### 3.1 应用密钥

```bash
kubectl -n $NS create secret generic china-study-free-secrets \
  --from-literal=LLM_API_KEY='sk-...' \
  --from-literal=DASHSCOPE_API_KEY='sk-...' \
  --from-literal=GEMINI_API_KEY='...' \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

如果暂时不用 AI：

```bash
kubectl -n $NS create secret generic china-study-free-secrets \
  --from-literal=ADMIN_TOKEN="$(openssl rand -hex 32)" \
  --dry-run=client -o yaml | kubectl apply -f -
```

未配置 LLM/TTS 时，AI 接口返回 `501`，离线课程仍可用。

### 3.2 Harbor 拉取 Secret

如果集群已有 `harbor-auth`，可复制：

```bash
kubectl get secret harbor-auth -n cicd -o yaml \
  | sed 's/namespace: cicd/namespace: china-study-free/' \
  | kubectl apply -f -
```

否则新建：

```bash
kubectl -n $NS create secret docker-registry harbor-auth \
  --docker-server=$REGISTRY \
  --docker-username='robot$china-study-free' \
  --docker-password='...' \
  --dry-run=client -o yaml | kubectl apply -f -
```

## 4. 修改 prod overlay

编辑：

```text
deploy/k8s/overlays/prod/kustomization.yaml
```

至少改：

```yaml
images:
  - name: 192.168.67.202:8443/china-study-free/web
    newTag: <你的 tag>
```

编辑域名：

```text
deploy/k8s/overlays/prod/kustomization.yaml 里的 Ingress patch
```

默认：

```text
studyfree.xyz
admin.studyfree.xyz
```

编辑 StorageClass：

```text
deploy/k8s/overlays/prod/pvc-patch.yaml
```

默认 `nfs-sc`；没有 NFS 就改 `standard` 或你的 RWX/RWO StorageClass。

编辑 CORS：

```text
deploy/k8s/overlays/prod/configmap-patch.yaml
```

同源部署时浏览器不需要 CORS，但移动端跨域调用需要填正确域名。

## 5. 渲染并检查

```bash
kubectl kustomize deploy/k8s/overlays/prod > /tmp/china-study-free.yaml
```

或：

```bash
./deploy/scripts/render-manifests.sh $TAG /tmp/china-study-free.yaml
```

人工检查：

```bash
grep -n 'image:' /tmp/china-study-free.yaml
grep -n 'host:' /tmp/china-study-free.yaml
grep -n 'storageClassName' /tmp/china-study-free.yaml
```

## 6. 应用

```bash
kubectl apply -f /tmp/china-study-free.yaml
```

或直接：

```bash
kubectl apply -k deploy/k8s/overlays/prod
```

查看：

```bash
kubectl -n $NS get pods,svc,ingress,pvc
kubectl -n $NS rollout status deploy/china-study-free --timeout=180s
```

## 7. TLS

清单默认使用 Traefik + TLS Secret：

```text
studyfree-xyz-tls
```

证书必须同时包含：

```text
DNS:studyfree.xyz
DNS:admin.studyfree.xyz
```

自签证书示例：

```bash
openssl req -x509 -nodes -days 825 \
  -newkey rsa:2048 \
  -keyout studyfree.key \
  -out studyfree.crt \
  -subj "/CN=studyfree.xyz" \
  -addext "subjectAltName=DNS:studyfree.xyz,DNS:admin.studyfree.xyz,IP:10.0.0.252"

kubectl -n $NS create secret tls studyfree-xyz-tls \
  --cert=studyfree.crt \
  --key=studyfree.key \
  --dry-run=client -o yaml | kubectl apply -f -
```

如果用 cert-manager，给 Ingress 加：

```yaml
cert-manager.io/cluster-issuer: letsencrypt-prod
```

并让 `spec.tls.secretName` 指向 cert-manager 生成的 Secret。

## 8. DNS / Ingress

确认：

- `studyfree.xyz` → Traefik 的 EXTERNAL-IP / LB
- `admin.studyfree.xyz` → 内网 DNS 或 hosts

查看 Ingress：

```bash
kubectl -n $NS get ingress
kubectl -n $NS describe ingress china-study-free-web
```

## 9. 验证

### 9.1 Pod 内

```bash
kubectl -n $NS port-forward svc/china-study-free 8787:80
curl -s http://127.0.0.1:8787/api/health
```

期望：

```json
{"ok":true,"version":"0.1.0","llm":false,"tts":true,"ttsBackend":"edge","image":false,"reports":true}
```

### 9.2 外部

```bash
curl -I https://$DOMAIN/
curl -s https://$DOMAIN/api/health
```

### 9.3 静态站与课程

```bash
curl -s https://$DOMAIN/data/index.json | head -c 200
curl -I https://$DOMAIN/book/physics-k12-g8up/
```

### 9.4 反馈

```bash
curl -s -X POST https://$DOMAIN/api/reports \
  -H 'Content-Type: application/json' \
  -d '{"id":"probe-1","lessonId":"manual","questionId":1,"questionText":"probe","kind":"formula_issue"}' 
```

管理接口（内网）：

```bash
export ADMIN_TOKEN='...'
curl -s -H "x-admin-token: $ADMIN_TOKEN" \
  https://$ADMIN_DOMAIN/api/admin/reports/summary
```

### 9.5 日志

```bash
kubectl -n $NS logs deploy/china-study-free --tail=100
```

## 10. 更新版本

```bash
export TAG=<new-sha>
docker build -f docker/Dockerfile -t $IMAGE:$TAG .
docker push $IMAGE:$TAG
./deploy/scripts/render-manifests.sh $TAG /tmp/china-study-free.yaml
kubectl apply -f /tmp/china-study-free.yaml
kubectl -n $NS rollout status deploy/china-study-free
```

因为 `replicas: 1` + RWO PVC，Deployment 使用 `Recreate`，更新会有短暂中断。

## 11. 回滚

```bash
kubectl -n $NS rollout undo deploy/china-study-free
kubectl -n $NS rollout status deploy/china-study-free
```

或者把 overlay 的 `newTag` 改回旧 sha 再 apply。

## 12. 卸载

```bash
kubectl delete -k deploy/k8s/overlays/prod
```

注意：这会删除 PVC 和反馈数据。要保留：

```bash
kubectl -n $NS delete deploy,svc,ingress,networkpolicy,configmap,serviceaccount --all
# 保留 pvc/china-study-free-reports
```

## 13. 常见问题

### ImagePullBackOff

```bash
kubectl -n $NS describe pod <pod>
```

检查：

- `harbor-auth` 是否存在
- Harbor 项目是否允许该 robot 拉取
- 节点是否能访问 Harbor
- 镜像 tag 是否存在

### CrashLoopBackOff

```bash
kubectl -n $NS logs <pod> --previous
```

常见：

- `runAsUser: 1000` 无法写 PVC → 检查 `fsGroup`
- 端口冲突
- Secret 格式错误

### 502 / 504

- `/api/health` 是否 200
- Ingress `proxy-read-timeout` 是否 120s
- AI 请求是否超过 120s
- Pod 是否 OOM

### 反馈写不进去

```bash
kubectl -n $NS exec deploy/china-study-free -- ls -la /app/data/reports
kubectl -n $NS exec deploy/china-study-free -- touch /app/data/reports/.probe
```

检查 PVC 权限、StorageClass、`fsGroup: 1000`。

### 静态站 404

- `STATIC_DIR=/app/apps/web/out` 是否存在
- 镜像是否包含 `apps/web/out`
- Ingress path 是否为 `/`

### AI 501

`/api/health` 里 `llm:false` / `image:false` 表示未配置 Key，属于预期降级。

### 管理接口 401

- 是否带 `x-admin-token`
- `ADMIN_TOKEN` 是否与 Secret 一致
- Pod 是否已重启加载新 Secret

## 14. 手动部署建议

1. 第一次先只开 1 副本
2. 先用 `port-forward` 验证，再开 Ingress
3. 先验证 `/api/health` 和 `/data/index.json`
4. 再验证 AI 接口（可能产生费用）
5. 最后验证反馈上传和管理汇总
6. 上线后按 `operations-checklist.md` 做日常检查

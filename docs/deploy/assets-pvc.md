# 大资源 PVC 部署

音频、课本原页、故事配图约 2.4GB，不打进应用镜像。运行时从 PVC 挂载到
`/app/assets`，应用镜像只保留课程 JSON（约 19MB）。

## 1. 资源与影响

| 资源 | 大小 | 缺失影响 |
|---|---:|---|
| `audio` | 1.6G / 84,376 个 | 句子点读、跟读、听读、UI 音效缺失；题目朗读可退回在线 TTS，但依赖网络 |
| `textbook-pages` | 205M / 1,582 张 | 课本原页面板消失，文字内容仍可用 |
| `story-images` | 527M / 472 张 | 故事配图消失，文字阅读仍可用 |
| `public/data` | 19M | **核心课程/题目数据，必须保留在应用镜像** |

结论：资源缺失不影响做题和看讲解；低年级、英语听读和课本原页体验下降明显。

## 2. 目录结构

```text
镜像内：
  /app/apps/web/out               HTML / JS / CSS
  /app/apps/web/out/data          课程与题目 JSON（19MB）

PVC：
  /app/assets/audio/
  /app/assets/textbook-pages/
  /app/assets/story-images/
```

应用镜像通过 `.dockerignore` 排除三个大目录，避免把 2.4GB 塞进构建上下文。

## 3. 资源清单

`build:data` 需要知道有哪些音频/页面/配图。仓库里提交了小清单：

```text
apps/web/media-manifest/audio-index.txt
apps/web/media-manifest/story-images.json
apps/web/media-manifest/pages/<bookId>/pages.json
```

生成方式：

```bash
npm run download-assets
npm run sync:media-manifests
```

本地有完整资源时，`build:data` 直接扫描目录；CI 没有大资源时读清单。
因此 CI 构建出的课程 JSON 仍然包含正确的 `/audio`、`/textbook-pages`、
`/story-images` URL，运行时再由 PVC 提供文件。

## 4. 首次加载 PVC

1. 构建并推送资源镜像：

```bash
docker build -f docker/assets.Dockerfile \
  -t 192.168.67.202:8443/china-study-free/assets:v1.4.0 \
  apps/web/public

docker push 192.168.67.202:8443/china-study-free/assets:v1.4.0
```

2. 等 Argo 同步出 PVC：

```bash
kubectl --kubeconfig /root/.kube/deeptutor-config \
  -n china-study-free get pvc china-study-free-assets
```

3. 执行一次性加载 Job：

```bash
kubectl --kubeconfig /root/.kube/deeptutor-config \
  -n china-study-free apply -f deploy/k8s/optional/assets-loader-job.yaml

kubectl --kubeconfig /root/.kube/deeptutor-config \
  -n china-study-free logs job/china-study-free-assets-loader -f
```

4. 验证：

```bash
kubectl --kubeconfig /root/.kube/deeptutor-config \
  -n china-study-free exec deploy/china-study-free -- \
  sh -c 'ls /app/assets/audio | head'

curl -k --resolve studyfree.xyz:443:10.0.0.252 \
  https://studyfree.xyz/api/health
# 应包含 "assets": true
```

## 5. 更新资源

1. 重新下载/生成资源；
2. 运行 `npm run sync:media-manifests` 并提交清单；
3. 构建新的 `assets:<tag>` 镜像；
4. 修改 `deploy/k8s/optional/assets-loader-job.yaml` 的镜像 tag 和 marker；
5. 删除旧 Job 后重新 apply：

```bash
kubectl -n china-study-free delete job china-study-free-assets-loader --ignore-not-found
kubectl -n china-study-free apply -f deploy/k8s/optional/assets-loader-job.yaml
```

## 6. 注意事项

- 当前单副本使用 `ReadWriteOnce`。多副本前先确认 `nfs-sc` 支持
  `ReadWriteMany`，否则资源 PVC 会绑死单节点。
- `nfs-sc` 对 84,000 个小文件的首包延迟高于镜像本地盘；Service Worker 会缓存
  `/audio/**`、`/data/**`，教材页和故事图也会按需缓存。
- 缺失资源必须返回 404，不能落到 SPA 的 `index.html`；服务端已对
  `/audio`、`/textbook-pages`、`/story-images` 做专门处理。
- `.opus` 由服务端显式返回 `audio/ogg`，避免浏览器因 MIME 类型拒绝播放。
- 如果后续要多副本，优先把音频/图片迁到对象存储 + CDN；PVC 只适合当前单副本。

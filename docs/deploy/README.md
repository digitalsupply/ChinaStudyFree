# ChinaStudyFree 部署文档

本目录是 GitOps / K8s / 手动部署的入口。

## 结论先说

ChinaStudyFree 适合部署到 K8s：

- 静态 Web + Express AI 服务天然无状态
- 学习进度在浏览器本地，不依赖数据库
- `/api/health` 可直接做探针
- 单容器即可同时托管静态站和 `/api/ai/*`

但有两个关键前提：

1. **学生反馈 `data/reports/reports.jsonl` 是单机文件**：第一版固定 1 副本 + PVC；
   要做多副本/HPA，必须先把反馈迁到 Postgres 或对象存储。
2. **AI 能力依赖外部 LLM/TTS/Gemini**：集群 Pod 需要出网，或改用自托管模型。

## 文档索引

| 文档 | 内容 |
|---|---|
| [GitOps / K8s 自动发布](gitops-k8s.md) | GitLab → Tekton → Harbor → GitOps → Argo CD 全链路 |
| [手动部署](manual-deploy.md) | 不用 GitOps，从构建镜像到 apply 的完整步骤 |
| [运维清单](operations-checklist.md) | 日常/周/月检查、告警、故障处理、回滚 |
| [当前部署状态](live-status.md) | 已部署对象、地址、DNS/TLS/AI 状态、未完成项 |

## 仓库内文件

```text
deploy/
├── k8s/
│   ├── base/                 # Deployment / Service / Ingress / PVC / NetworkPolicy
│   ├── overlays/prod/        # 生产差异：域名、StorageClass、CORS、镜像 tag
│   └── optional/             # 多副本/HPA 的前提说明
├── tekton/                   # 自动构建 + 推送 Harbor + 更新 GitOps
├── gitops/                   # GitOps 仓库模板 + Argo CD Application
└── scripts/                  # 渲染 / promote 辅助脚本

docs/deploy/
├── README.md
├── gitops-k8s.md
├── manual-deploy.md
└── operations-checklist.md
```

## 快速检查

本地不连集群也能验证清单：

```bash
kubectl kustomize deploy/k8s/overlays/prod >/tmp/china-study-free.yaml
```

或带一个镜像 tag 渲染：

```bash
./deploy/scripts/render-manifests.sh <git-sha> /tmp/china-study-free.yaml
```

## 推荐部署顺序

1. 建 Harbor 项目与镜像仓库
2. 建 `china-study-free` namespace 与 Secret
3. 建 `china-study-free-gitops` 仓库
4. 配 Tekton（或手动构建推送）
5. 配 Argo CD Application
6. 首次同步
7. 验证 `/api/health`、静态站、AI、反馈
8. 按运维清单建立例行检查

> 集群入口：Traefik（LB 10.0.0.252），域名 `studyfree.xyz` / `admin.studyfree.xyz`。

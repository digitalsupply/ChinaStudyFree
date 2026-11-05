#!/usr/bin/env bash
# 手动把新 tag 写进已 clone 的 GitOps 仓库。
# 用法：./deploy/scripts/promote-gitops.sh <image-tag> <gitops-dir>
set -euo pipefail
TAG="${1:?usage: promote-gitops.sh <image-tag> <gitops-dir>}"
DIR="${2:?usage: promote-gitops.sh <image-tag> <gitops-dir>}"
KUST="$DIR/overlays/prod/kustomization.yaml"
[ -f "$KUST" ] || { echo "missing $KUST"; exit 1; }
sed -i "s#^\( *newTag:\).*#\1 ${TAG}#" "$KUST"
cd "$DIR"
git diff --quiet -- overlays/prod/kustomization.yaml && { echo "no change"; exit 0; }
git add overlays/prod/kustomization.yaml
git commit -m "ci: promote china-study-free image ${TAG}"
git push origin HEAD:main
echo "promoted ${TAG}"

#!/usr/bin/env bash
# 渲染 prod overlay；不访问集群。
# 用法：./deploy/scripts/render-manifests.sh <image-tag> [output.yaml]
set -euo pipefail
TAG="${1:?usage: render-manifests.sh <image-tag> [output.yaml]}"
OUT="${2:-/tmp/china-study-free.yaml}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/deploy/k8s" "$TMP/k8s"
sed -i "s#^\( *newTag:\).*#\1 ${TAG}#" "$TMP/k8s/overlays/prod/kustomization.yaml"
kubectl kustomize "$TMP/k8s/overlays/prod" > "$OUT"
echo "rendered: $OUT (tag=$TAG)"

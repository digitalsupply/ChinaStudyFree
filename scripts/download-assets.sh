#!/usr/bin/env bash
# download-assets.sh — 从 GitHub Release 下载前端所需的音频和数据文件
#
# 用法:
#   bash scripts/download-assets.sh                         # 默认完整资源包
#   bash scripts/download-assets.sh v1.4.0-content          # 指定 release tag
#   ASSET_TAG=v1.2.0-assets bash scripts/download-assets.sh # 用环境变量指定
#
# 注意:
#   - 默认固定到 v1.4.0-content。GitHub 的 latest (v1.8.x) 只有安装器文件，
#     不再提供 audio.tar.gz，使用 latest 会在下载阶段 404。
#   - v1.8.0+ 的 web resources 把音频拆成了 audio-web-partNN.zip，
#     本脚本目前只处理完整的 audio.tar.gz。
#   - data.zip 只在 public/data/index.json 不存在时下载，避免覆盖本地
#     已生成的 K12 题库数据。
#
# 需要: curl, tar, python3 (处理 Windows 反斜杠路径的 zip), sha256sum

set -euo pipefail

DEFAULT_TAG="v1.4.0-content"
REPO="wuwangzhang1216/ChinaTextbookStudyFree"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# 兼容脚本被放在 scripts/scripts/ 下的历史布局。
if [ ! -f "$ROOT_DIR/package.json" ]; then
  ROOT_DIR="$(cd "$ROOT_DIR/.." && pwd)"
fi

FRONTEND_DIR="$ROOT_DIR/apps/web"
PUBLIC_DIR="$FRONTEND_DIR/public"
DATA_SRC_DIR="$ROOT_DIR/data"

TAG="${1:-${ASSET_TAG:-$DEFAULT_TAG}}"
BASE_URL="https://github.com/$REPO/releases/download/$TAG"

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/csf-assets.XXXXXX")"
trap 'rm -rf "$TMP_DIR"' EXIT

echo "=== ChinaStudyFree 资源下载器 ==="
echo "仓库:   $ROOT_DIR"
echo "目标:   $PUBLIC_DIR/  和  $DATA_SRC_DIR/"
echo "版本:   $TAG"

# 解压 zip 的同时把 Windows 反斜杠路径修正为正斜杠。
# release 里的 zip 没有顶层目录（直接就是 books/、chinese-g1down/ 等），
# 所以调用方必须传入正确的目标目录。
extract_zip() {
  local zip_path="$1" dest="$2"
  mkdir -p "$dest"
  python3 - "$zip_path" "$dest" <<'PY'
import os, sys, zipfile
src, dst = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(src) as z:
    for name in z.namelist():
        fixed = name.replace('\\', '/')
        target = os.path.join(dst, fixed)
        if fixed.endswith('/'):
            os.makedirs(target, exist_ok=True)
            continue
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with z.open(name) as sf, open(target, 'wb') as df:
            df.write(sf.read())
PY
}

download() {
  local name="$1"
  echo "  下载 $name ..."
  curl -fL --retry 3 --retry-delay 2 --progress-bar \
    -o "$TMP_DIR/$name" "$BASE_URL/$name"
  if [ -f "$TMP_DIR/SHA256SUMS" ]; then
    (cd "$TMP_DIR" && grep -E "  ${name//./\\.}$" SHA256SUMS | sha256sum -c -)
  fi
}

has_files() {
  local dir="$1" pattern="$2" min="${3:-1}"
  [ -d "$dir" ] || return 1
  local n
  n="$(find "$dir" -name "$pattern" -type f 2>/dev/null | wc -l)"
  [ "$n" -ge "$min" ]
}

# 校验文件清单（失败不阻断下载，只提示）。老 release 可能没有 SHA256SUMS。
if curl -fL --retry 2 --max-time 30 -sS -o "$TMP_DIR/SHA256SUMS" "$BASE_URL/SHA256SUMS"; then
  echo "  ✓ 已获取 SHA256SUMS"
else
  echo "  ! 该 release 没有 SHA256SUMS，跳过校验"
  rm -f "$TMP_DIR/SHA256SUMS"
fi

# ---- audio.tar.gz ----
echo ""
echo "--- 下载音频文件 (Opus 格式, ~1.4GB) ---"
AUDIO_DIR="$PUBLIC_DIR/audio"
if has_files "$AUDIO_DIR" '*.opus' 100; then
  echo "  跳过 (已有 $(find "$AUDIO_DIR" -name '*.opus' -type f | wc -l) 个 opus 音频)"
else
  download "audio.tar.gz"
  echo "  解压到 $PUBLIC_DIR/ ..."
  mkdir -p "$PUBLIC_DIR"
  tar xzf "$TMP_DIR/audio.tar.gz" -C "$PUBLIC_DIR"
  rm -f "$TMP_DIR/audio.tar.gz"
  echo "  完成 ✓ ($(find "$AUDIO_DIR" -name '*.opus' -type f | wc -l) 个音频文件)"
fi

# ---- data.zip ----
echo ""
echo "--- 下载题库数据 (JSON, ~7MB) ---"
DATA_DIR="$PUBLIC_DIR/data"
if [ -f "$DATA_DIR/index.json" ]; then
  echo "  跳过 (已存在 $DATA_DIR/index.json，保留本地数据)"
else
  download "data.zip"
  echo "  解压到 $DATA_DIR/ ..."
  extract_zip "$TMP_DIR/data.zip" "$DATA_DIR"
  rm -f "$TMP_DIR/data.zip"
  echo "  完成 ✓"
fi

# ---- textbook-pages.zip ----
echo ""
echo "--- 下载课本原页扫描图 (JPG, ~202MB) ---"
PAGES_DIR="$PUBLIC_DIR/textbook-pages"
if has_files "$PAGES_DIR" '*.jpg' 100; then
  echo "  跳过 (已有 $(find "$PAGES_DIR" -name '*.jpg' -type f | wc -l) 张课本扫描页)"
else
  download "textbook-pages.zip"
  echo "  解压到 $PAGES_DIR/ ..."
  extract_zip "$TMP_DIR/textbook-pages.zip" "$PAGES_DIR"
  rm -f "$TMP_DIR/textbook-pages.zip"
  echo "  完成 ✓ ($(find "$PAGES_DIR" -name '*.jpg' -type f | wc -l) 张课本扫描页)"
fi

# ---- story-images.zip ----
echo ""
echo "--- 下载故事配图 (JPEG, ~525MB) ---"
STORY_IMG_DIR="$PUBLIC_DIR/story-images"
if has_files "$STORY_IMG_DIR" '*.jpg' 100; then
  echo "  跳过 (已有 $(find "$STORY_IMG_DIR" -name '*.jpg' -type f | wc -l) 张故事配图)"
else
  download "story-images.zip"
  echo "  解压到 $STORY_IMG_DIR/ ..."
  extract_zip "$TMP_DIR/story-images.zip" "$STORY_IMG_DIR"
  rm -f "$TMP_DIR/story-images.zip"
  echo "  完成 ✓ ($(find "$STORY_IMG_DIR" -name '*.jpg' -type f | wc -l) 张故事配图)"
fi

# ---- data-source.zip (passages + stories 源 JSON, 仓库根目录) ----
echo ""
echo "--- 下载 passages/stories 源 JSON (~0.8MB) ---"
if [ -d "$DATA_SRC_DIR/passages" ] && [ -d "$DATA_SRC_DIR/stories" ]; then
  echo "  跳过 (passages 和 stories 目录已存在)"
else
  download "data-source.zip"
  echo "  解压到 $DATA_SRC_DIR/ ..."
  mkdir -p "$DATA_SRC_DIR"
  extract_zip "$TMP_DIR/data-source.zip" "$DATA_SRC_DIR"
  rm -f "$TMP_DIR/data-source.zip"
  echo "  完成 ✓"
fi

echo ""
echo "=== 全部完成! ==="
echo "音频:        $(find "$AUDIO_DIR" -name '*.opus' -type f 2>/dev/null | wc -l) 个"
echo "课本扫描图:  $(find "$PAGES_DIR" -name '*.jpg' -type f 2>/dev/null | wc -l) 张"
echo "故事配图:    $(find "$STORY_IMG_DIR" -name '*.jpg' -type f 2>/dev/null | wc -l) 张"
echo "题库数据:    $([ -f "$DATA_DIR/index.json" ] && echo "已存在" || echo "缺失")"
echo "阅读源数据:  $([ -d "$DATA_SRC_DIR/passages" ] && echo "已存在" || echo "缺失")"
echo ""
echo "现在可以运行: cd apps/web && npm run dev"

#!/usr/bin/env node
/**
 * sync-media-manifests.mjs — 从已下载的大资源生成可提交的小清单。
 *
 * 背景：
 *   音频 / 课本原页 / 故事配图体积大，走 PVC 或 CDN，不进入应用镜像。
 *   但 `build:data` 需要知道有哪些资源，才能把 URL 写进课程 JSON。
 *   本脚本把“资源是否存在”压缩成三个小文件：
 *
 *     apps/web/media-manifest/audio-index.txt
 *     apps/web/media-manifest/story-images.json
 *     apps/web/media-manifest/pages/<bookId>/pages.json
 *
 *   本地有完整资源时，build-data 直接扫描目录；CI 没有资源时读这些清单。
 *
 * 用法：
 *   npm run sync:media-manifests
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const PUBLIC = path.join(ROOT, "apps", "web", "public");
const OUT = path.join(ROOT, "apps", "web", "media-manifest");

const AUDIO_ROOT = path.join(PUBLIC, "audio");
const PAGES_ROOT = path.join(PUBLIC, "textbook-pages");
const STORY_ROOT = path.join(PUBLIC, "story-images");

const AUDIO_EXTS = [".opus", ".mp3", ".wav"];

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  const stack = [dir];
  while (stack.length) {
    const cur = stack.pop();
    for (const entry of fs.readdirSync(cur, { withFileTypes: true })) {
      const p = path.join(cur, entry.name);
      if (entry.isDirectory()) stack.push(p);
      else if (entry.isFile()) out.push(p);
    }
  }
  return out;
}

function rel(p) {
  return path.relative(PUBLIC, p).split(path.sep).join("/");
}

function writeAudioIndex() {
  const lines = [];
  for (const file of walkFiles(AUDIO_ROOT)) {
    const ext = AUDIO_EXTS.find(e => file.endsWith(e));
    if (!ext) continue;
    const r = rel(file);
    // build-data 的 key 带扩展名：<bucket>/<hash>.opus（去掉 audio/ 前缀）
    lines.push(r.slice("audio/".length));
  }
  lines.sort();
  fs.writeFileSync(path.join(OUT, "audio-index.txt"), lines.join("\n") + "\n", "utf8");
  return lines.length;
}

function copyPagesManifests() {
  const dstRoot = path.join(OUT, "pages");
  fs.rmSync(dstRoot, { recursive: true, force: true });
  let books = 0;
  if (!fs.existsSync(PAGES_ROOT)) return books;
  for (const entry of fs.readdirSync(PAGES_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(PAGES_ROOT, entry.name, "pages.json");
    if (!fs.existsSync(src)) continue;
    const dst = path.join(dstRoot, entry.name, "pages.json");
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(src, dst);
    books++;
  }
  return books;
}

function writeStoryImageIndex() {
  const items = [];
  for (const file of walkFiles(STORY_ROOT)) {
    if (!file.endsWith(".jpg")) continue;
    const r = rel(file);
    // 去掉 story-images/ 前缀，得到 <bookId>/<storyId>
    items.push(r.slice("story-images/".length, -".jpg".length));
  }
  items.sort();
  fs.writeFileSync(
    path.join(OUT, "story-images.json"),
    JSON.stringify(items, null, 2) + "\n",
    "utf8",
  );
  return items.length;
}

function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const audio = writeAudioIndex();
  const pages = copyPagesManifests();
  const stories = writeStoryImageIndex();

  console.log("=== media manifests ===");
  console.log(`音频索引:   ${audio} 个 → media-manifest/audio-index.txt`);
  console.log(`课本页映射: ${pages} 本 → media-manifest/pages/`);
  console.log(`故事配图:   ${stories} 张 → media-manifest/story-images.json`);
  if (audio === 0 && pages === 0 && stories === 0) {
    console.warn("⚠️  没有扫描到任何资源；请先运行 npm run download-assets");
  }
}

main();

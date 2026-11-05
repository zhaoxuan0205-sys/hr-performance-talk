"use strict";

/**
 * 打包脚本：把 light/ 的文件内联成一个单 HTML 文件。
 * 产物：dist/谈绩效-面谈准备-轻量版.html —— 双击即用，可直接发送给他人。
 * 运行：node build-light.js
 */

const fs = require("node:fs");
const path = require("node:path");

const LIGHT = path.join(__dirname, "light");
const DIST = path.join(__dirname, "dist");

const html = fs.readFileSync(path.join(LIGHT, "index.html"), "utf8");
const css = fs.readFileSync(path.join(LIGHT, "styles.css"), "utf8");
const analysis = fs.readFileSync(path.join(LIGHT, "analysis.js"), "utf8");
const app = fs.readFileSync(path.join(LIGHT, "app.js"), "utf8");

function inlineScript(source) {
  return source.replace(/<\/script>/gi, "<\\/script>");
}

let out = html
  .replace(/<link rel="stylesheet" href="styles.css" \/>/, () => `<style>\n${css}\n</style>`)
  .replace(
    /<script src="analysis\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    () => `<script>\n${inlineScript(analysis)}\n</script>\n  <script>\n${inlineScript(app)}\n</script>`
  );

if (/<link rel="stylesheet"|<script src=/.test(out)) {
  console.error("打包失败：仍有未内联的外部引用。");
  process.exit(1);
}

const banner = `<!--
  谈绩效 · 面谈准备（轻量版 · 单文件）
  双击用浏览器打开即可使用，无需安装、无需登录、无需联网。
  流程：说情况 → 确认重点 → 拿方案；多人时逐个保存记录，最后一次性下载 Markdown。
  数据保存在本机浏览器中，请及时下载留档。
  生成时间：${new Date().toISOString()}
-->
`;
out = out.replace("<!doctype html>", "<!doctype html>\n" + banner);

fs.mkdirSync(DIST, { recursive: true });
const target = path.join(DIST, "谈绩效-面谈准备-轻量版.html");
fs.writeFileSync(target, out);
console.log(`已生成：${target}`);
console.log(`大小：${(fs.statSync(target).size / 1024).toFixed(1)} KB`);

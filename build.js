"use strict";

/**
 * 打包脚本：把 web/ 的四个文件内联成一个单 HTML 文件。
 * 产物：dist/谈绩效-面谈准备.html —— 双击即用，可直接发送给他人。
 *
 * 运行：node build.js
 */

const fs = require("node:fs");
const path = require("node:path");

const WEB = path.join(__dirname, "web");
const DIST = path.join(__dirname, "dist");

const html = fs.readFileSync(path.join(WEB, "index.html"), "utf8");
const css = fs.readFileSync(path.join(WEB, "styles.css"), "utf8");
const analysis = fs.readFileSync(path.join(WEB, "analysis.js"), "utf8");
const app = fs.readFileSync(path.join(WEB, "app.js"), "utf8");

function inlineScript(source) {
  // </script> 出现在字符串里会提前终止标签，做安全转义
  return source.replace(/<\/script>/gi, "<\\/script>");
}

let out = html
  .replace(
    /<link rel="stylesheet" href="styles.css" \/>/,
    () => `<style>\n${css}\n</style>`
  )
  .replace(
    /<script src="analysis\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    () =>
      `<script>\n${inlineScript(analysis)}\n</script>\n    <script>\n${inlineScript(app)}\n</script>`
  );

if (/<link rel="stylesheet"|<script src=/.test(out)) {
  console.error("打包失败：仍有未内联的外部引用。");
  process.exit(1);
}

const banner = `<!--
  谈绩效 · 面谈准备（单文件版）
  双击用浏览器打开即可使用，无需安装、无需登录、无需联网。
  数据保存在本机浏览器中，请定期在「设置」里导出备份。
  生成时间：${new Date().toISOString()}
-->
`;
out = out.replace("<!doctype html>", "<!doctype html>\n" + banner);

fs.mkdirSync(DIST, { recursive: true });
const target = path.join(DIST, "谈绩效-面谈准备.html");
fs.writeFileSync(target, out);

const size = fs.statSync(target).size;
console.log(`已生成：${target}`);
console.log(`大小：${(size / 1024).toFixed(1)} KB`);

"use strict";

/**
 * 谈绩效 · 单页应用（无登录、无注册、无服务端）
 * 数据存在本机浏览器的 localStorage，随时可导出 Markdown / JSON。
 */

var root = document.getElementById("app");
var STORE_KEY = "tanjixiao.v1";

var state = {
  view: "boot",
  data: null,
  draft: null,
  dirty: false,
  viewingVersion: null,
  showNewBatch: false,
  showNewCase: false,
  showNewCaseName: "",
  renaming: false,
  listening: false,
  summary: false,
  error: "",
  storageBroken: false,
};

/* ---------------- 存储 ---------------- */

function emptyData() {
  return { version: 1, batches: [], updatedAt: new Date().toISOString() };
}

function loadData() {
  try {
    var raw = localStorage.getItem(STORE_KEY);
    if (!raw) return emptyData();
    var parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.batches)) return emptyData();
    return parsed;
  } catch (error) {
    state.storageBroken = true;
    return emptyData();
  }
}

function saveData() {
  if (!state.data) return;
  state.data.updatedAt = new Date().toISOString();
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state.data));
    state.storageBroken = false;
  } catch (error) {
    state.storageBroken = true;
    toast("浏览器存储空间不足或被禁用，改动可能无法保留。请立即导出。");
  }
}

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ---------------- 工具 ---------------- */

function esc(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function relTime(iso) {
  if (!iso) return "";
  var diff = Date.now() - new Date(iso).getTime();
  if (diff < 60000) return "刚刚";
  if (diff < 3600000) return Math.floor(diff / 60000) + " 分钟前";
  if (diff < 86400000) return Math.floor(diff / 3600000) + " 小时前";
  if (diff < 7 * 86400000) return Math.floor(diff / 86400000) + " 天前";
  return new Date(iso).toLocaleDateString("zh-CN");
}

function toast(message) {
  var old = document.querySelector(".toast");
  if (old) old.remove();
  var node = document.createElement("div");
  node.className = "toast";
  node.setAttribute("role", "status");
  node.textContent = message;
  document.body.appendChild(node);
  setTimeout(function () {
    node.remove();
  }, 3200);
}

function findBatch(id) {
  return state.data.batches.filter(function (item) {
    return item.id === id;
  })[0];
}

function findCase(id) {
  var found = null;
  state.data.batches.forEach(function (batch) {
    batch.cases.forEach(function (item) {
      if (item.id === id) found = { batch: batch, item: item };
    });
  });
  return found;
}

function latestAnalysis(item) {
  return item.analyses && item.analyses.length ? item.analyses[item.analyses.length - 1] : null;
}

function batchStats(batch) {
  var ready = batch.cases.filter(function (item) {
    return latestAnalysis(item);
  }).length;
  var risk = batch.cases.filter(function (item) {
    var analysis = latestAnalysis(item);
    return analysis && analysis.riskLevel === "high";
  }).length;
  return { total: batch.cases.length, ready: ready, risk: risk };
}

/* ---------------- 视图：工作台 ---------------- */

function shell(content) {
  return (
    '<div class="shell">' +
    '<header class="topbar">' +
    '<button class="brand brand-button" data-act="goto" data-view="home" aria-label="返回工作台">' +
    '<span class="brand-mark">谈</span><span>谈绩效<small>面谈准备</small></span></button>' +
    '<nav class="nav-links">' +
    '<button class="nav-link" data-act="goto" data-view="home">工作台</button>' +
    '<button class="nav-link" data-act="goto" data-view="settings">设置</button>' +
    "</nav>" +
    '<div class="user-chip"><span class="chip chip-draft">无需登录 · 仅存本机</span></div>' +
    "</header>" +
    '<main class="container">' +
    content +
    "</main></div>"
  );
}

function homeView() {
  var batches = state.data.batches.slice().sort(function (a, b) {
    return new Date(b.updatedAt) - new Date(a.updatedAt);
  });
  var totalCases = 0;
  var totalReady = 0;
  batches.forEach(function (batch) {
    var stats = batchStats(batch);
    totalCases += stats.total;
    totalReady += stats.ready;
  });

  var rows = batches.length
    ? batches
        .map(function (batch) {
          var stats = batchStats(batch);
          return (
            '<button class="list-row" data-act="open-batch" data-id="' + esc(batch.id) + '">' +
            '<div class="list-main"><strong>' + esc(batch.title) + "</strong>" +
            "<span>" + esc(batch.periodLabel || "未填写周期") + " · " + stats.total + " 人 · 更新于 " + relTime(batch.updatedAt) + "</span></div>" +
            '<div class="list-meta">' +
            (stats.risk ? '<span class="chip chip-risk">' + stats.risk + " 人高风险</span>" : "") +
            '<span class="chip ' + (stats.ready ? "chip-ready" : "chip-draft") + '">' + stats.ready + "/" + stats.total + " 已出方案</span>" +
            '<span class="arrow">→</span></div></button>'
          );
        })
        .join("")
    : '<div class="empty"><strong>还没有准备任何批次</strong><p>一个批次对应一次绩效沟通周期，比如「2026 年度绩效反馈」。批次里逐人准备，谈完一起导出。</p>' +
      '<div class="empty-actions"><button class="secondary" data-act="load-sample">载入一个示例看看</button></div></div>';

  return shell(
    '<section class="dash-head"><div>' +
      '<div class="eyebrow">工作台</div><h1>谈前准备</h1>' +
      '<p class="sub">逐人准备，谈完一次导出所有人的沟通方案。不需要登录，数据存在这台设备的浏览器里。</p></div>' +
      '<button class="primary" data-act="toggle-new-batch">' + (state.showNewBatch ? "收起" : "＋ 新建批次") + "</button></section>" +

      (state.showNewBatch
        ? '<form class="panel slim-panel inline-form" data-form="create-batch">' +
          '<div class="form-grid">' +
          '<div class="field"><label for="batch-title">批次名称</label>' +
          '<input id="batch-title" name="title" placeholder="例如：2026 年度绩效反馈" maxlength="180" required /></div>' +
          '<div class="field"><label for="batch-period">周期<span class="hint">可留空</span></label>' +
          '<input id="batch-period" name="periodLabel" placeholder="例如：2026 Q4" maxlength="120" /></div></div>' +
          '<div class="actions"><button class="secondary" type="button" data-act="toggle-new-batch">取消</button>' +
          '<button class="primary" type="submit">创建批次</button></div></form>'
        : "") +

      '<section class="stat-row">' +
      '<div class="stat"><span>批次</span><strong>' + batches.length + "</strong></div>" +
      '<div class="stat"><span>已录入人数</span><strong>' + totalCases + "</strong></div>" +
      '<div class="stat"><span>已生成方案</span><strong>' + totalReady + "</strong></div></section>" +

      '<section class="panel"><div class="panel-head simple-head">' +
      '<div><h2>最近的批次</h2><p class="sub">点开继续准备，或直接导出汇总。</p></div></div>' +
      '<div class="list">' + rows + "</div></section>" +

      '<p class="local-note">数据只保存在这台设备的浏览器中。换设备或清理浏览器数据会丢失，建议每次谈完导出 Markdown 或 JSON 备份。' +
      '<button class="link-button" data-act="goto" data-view="settings">去导出</button></p>'
  );
}

/* ---------------- 视图：批次 ---------------- */

function summaryMarkdown(batch) {
  var lines = [];
  lines.push("# " + batch.title + "｜绩效反馈面谈准备");
  lines.push("");
  if (batch.periodLabel) lines.push("- 周期：" + batch.periodLabel);
  lines.push("- 人数：" + batch.cases.length);
  lines.push("- 导出时间：" + new Date().toLocaleString("zh-CN"));
  lines.push("");
  lines.push("> 本文档是谈前准备材料，不是绩效结论，也不含员工之间的比较或排名。");
  lines.push("> 原因与行动应在面谈中与员工共同确认。");
  lines.push("");

  batch.cases.forEach(function (item, index) {
    var analysis = latestAnalysis(item);
    lines.push("## " + (index + 1) + ". " + item.employeeName + (item.roleTitle ? "（" + item.roleTitle + "）" : ""));
    lines.push("");
    lines.push("**沟通目标**");
    lines.push("");
    lines.push(item.goal || "待补充");
    lines.push("");
    lines.push("**情况描述**");
    lines.push("");
    lines.push(item.story || "待补充");
    lines.push("");
    if (analysis) {
      if (analysis.riskLevel !== "high" && analysis.conversationOpening) {
        lines.push("**开场**");
        lines.push("");
        lines.push(analysis.conversationOpening);
        lines.push("");
      }
      var section = function (title, items, pick) {
        if (!items || !items.length) return;
        lines.push("**" + title + "**");
        lines.push("");
        items.forEach(function (entry) {
          lines.push("- " + pick(entry));
        });
        lines.push("");
      };
      section("可以先讲的事实", analysis.facts, function (entry) {
        return entry.text || entry;
      });
      section("先不要下的结论", analysis.judgmentsToPause, function (entry) {
        return entry.statement + " —— " + entry.reason;
      });
      section("面谈中要问清", analysis.questionsToVerify, function (entry) {
        return entry;
      });
      section("管理者也要承担的部分", analysis.managerResponsibilities, function (entry) {
        return entry;
      });
      if (analysis.riskLevel !== "high") {
        section("谈完要约定", analysis.actionPlan, function (entry) {
          return entry;
        });
      }
      if (analysis.riskFlags && analysis.riskFlags.length) {
        lines.push("**风险提示**");
        lines.push("");
        analysis.riskFlags.forEach(function (risk) {
          lines.push("- [" + risk.level + "] " + risk.label + "：" + risk.advice);
        });
        lines.push("");
      }
      lines.push("> 分析版本 v" + analysis.versionNo + " · 生成于 " + new Date(analysis.generatedAt).toLocaleString("zh-CN"));
    } else {
      lines.push("> 尚未生成面谈方案");
    }
    if (index < batch.cases.length - 1) {
      lines.push("");
      lines.push("---");
      lines.push("");
    }
  });
  return lines.join("\n");
}

function batchView(batch) {
  var stats = batchStats(batch);
  var rows = batch.cases.length
    ? batch.cases
        .map(function (item) {
          var analysis = latestAnalysis(item);
          return (
            '<div class="list-row static">' +
            '<div class="list-main"><strong>' + esc(item.employeeName) +
            (item.roleTitle ? '<small class="role-tag">' + esc(item.roleTitle) + "</small>" : "") + "</strong>" +
            "<span>" + (analysis ? "方案 v" + analysis.versionNo + " · 更新于 " + relTime(item.updatedAt) : "尚未生成方案") + "</span></div>" +
            '<div class="list-meta">' +
            (analysis && analysis.riskLevel === "high" ? '<span class="chip chip-risk">高风险·转 HR</span>' : "") +
            '<span class="chip ' + (analysis ? "chip-ready" : "chip-draft") + '">' + (analysis ? "已有方案" : "待准备") + "</span>" +
            '<button class="secondary small-button" data-act="open-case" data-id="' + esc(item.id) + '">打开</button>' +
            '<button class="link-button danger" data-act="delete-case" data-id="' + esc(item.id) + '" data-name="' + esc(item.employeeName) + '">删除</button>' +
            "</div></div>"
          );
        })
        .join("")
    : '<div class="empty"><strong>还没有录入任何人</strong><p>先添加一位员工，说清情况后生成方案。</p></div>';

  return shell(
    '<div class="crumbs"><button class="link-button" data-act="goto" data-view="home">← 工作台</button></div>' +
      '<section class="dash-head"><div>' +
      '<div class="eyebrow">' + esc(batch.periodLabel || "未填写周期") + "</div>" +
      (state.renaming
        ? '<form class="rename-form" data-form="rename-batch"><input name="title" value="' + esc(batch.title) + '" maxlength="180" required />' +
          '<button class="primary small-button" type="submit">保存</button>' +
          '<button class="secondary small-button" type="button" data-act="toggle-rename">取消</button></form>'
        : "<h1>" + esc(batch.title) + ' <button class="link-button small-button" data-act="toggle-rename">改名</button></h1>') +
      "<p class=\"sub\">" + stats.total + " 人 · " + stats.ready + " 份方案</p></div>" +
      '<div class="head-actions">' +
      '<button class="primary" data-act="toggle-new-case">' + (state.showNewCase ? "收起" : "＋ 添加员工") + "</button>" +
      (batch.cases.length ? '<button class="secondary" data-act="export-batch">导出汇总</button><button class="secondary" data-act="copy-batch">复制汇总</button>' : "") +
      "</div></section>" +

      (stats.risk
        ? '<div class="risk-banner high"><strong>' + stats.risk + " 位员工触发了高风险提示</strong>" +
          "<p>涉及辞退、降薪、歧视骚扰、安全健康或争议情形时，本工具停止给出面谈话术。请先转 HR/法务，再决定是否继续沟通。</p></div>"
        : "") +

      (state.showNewCase
        ? '<form class="panel slim-panel inline-form" data-form="create-case"><div class="form-grid">' +
          '<div class="field"><label for="emp-name">员工姓名或代号</label>' +
          '<input id="emp-name" name="employeeName" placeholder="建议用代号，如「产品-A」" maxlength="120" required /></div>' +
          '<div class="field"><label for="emp-role">岗位<span class="hint">可留空</span></label>' +
          '<input id="emp-role" name="roleTitle" placeholder="例如：产品经理" maxlength="120" /></div></div>' +
          '<p class="voice-note">只录入面谈必需的信息。不要录入身份证号、私人手机号、客户隐私。</p>' +
          '<div class="actions"><button class="secondary" type="button" data-act="toggle-new-case">取消</button>' +
          '<button class="primary" type="submit">下一步：说情况</button></div></form>'
        : "") +

      '<section class="panel"><div class="panel-head simple-head">' +
      '<div><h2>人员清单</h2><p class="sub">只追踪进度和方案，不做排名和横向打分。</p></div>' +
      '<button class="link-button" data-act="toggle-summary">' + (state.summary ? "收起汇总" : "在这里搂一遍方案") + "</button></div>" +
      '<div class="list">' + rows + "</div></section>" +

      (state.summary && batch.cases.length ? summaryView(batch) : "") +

      '<section class="panel batch-guidance"><h3>整批沟通前共同检查</h3><ul>' +
      "<li>每个人都使用可核实的事实，不复制人格标签。</li>" +
      "<li>分别确认目标是否清晰、资源是否充分、管理者是否提供过必要支持。</li>" +
      "<li>行动约定逐人形成，不用其他员工的情况施压或比较。</li></ul></section>" +

      '<section class="danger-zone"><div><strong>删除这个批次</strong><p>批次内 ' + stats.total + " 人的输入与全部分析版本会一起删除，无法恢复。</p>" +
      '<button class="link-button danger" data-act="delete-batch" data-id="' + esc(batch.id) + '">删除批次</button></div></section>'
  );
}

function summaryView(batch) {
  return (
    '<section class="panel summary-panel" id="summary"><div class="panel-head simple-head">' +
    '<div><h2>本批方案汇总</h2><p class="sub">把所有人的方案并排放在一起看，逐人确认，不比较、不打分。</p></div></div>' +
    batch.cases
      .map(function (item) {
        var analysis = latestAnalysis(item);
        if (!analysis) {
          return '<article class="summary-card"><h3>' + esc(item.employeeName) + '</h3><p class="muted">尚未生成方案。</p></article>';
        }
        var bullets = function (items, pick) {
          if (!items || !items.length) return "";
          return "<ul>" + items.map(function (entry) { return "<li>" + esc(pick(entry)) + "</li>"; }).join("") + "</ul>";
        };
        return (
          '<article class="summary-card">' +
          "<h3>" + esc(item.employeeName) + (item.roleTitle ? '<small class="role-tag">' + esc(item.roleTitle) + "</small>" : "") +
          (analysis.riskLevel === "high" ? '<span class="chip chip-risk">高风险·转 HR</span>' : "") + "</h3>" +
          '<p class="muted">目标：' + esc(item.goal || "待补充") + "</p>" +
          (analysis.riskLevel === "high"
            ? '<div class="warn-box"><ul>' + analysis.riskFlags.map(function (risk) { return "<li>" + esc(risk.label) + "：" + esc(risk.advice) + "</li>"; }).join("") + "</ul></div>"
            : "") +
          '<div class="summary-block"><strong>先讲事实</strong>' + bullets(analysis.facts, function (entry) { return entry.text || entry; }) + "</div>" +
          '<div class="summary-block"><strong>要问清</strong>' + bullets(analysis.questionsToVerify, function (entry) { return entry; }) + "</div>" +
          (analysis.riskLevel === "high" ? "" : '<div class="summary-block"><strong>要约定</strong>' + bullets(analysis.actionPlan, function (entry) { return entry; }) + "</div>") +
          '<button class="link-button" data-act="open-case" data-id="' + esc(item.id) + '">打开完整方案 →</button>' +
          "</article>"
        );
      })
      .join("") +
    "</section>"
  );
}

/* ---------------- 视图：个案 ---------------- */

function analysisView(analysis) {
  if (!analysis) return "";
  var high = analysis.riskLevel === "high";
  var section = function (title, items, pick) {
    if (!items || !items.length) return "";
    return '<section class="analysis-card"><h3>' + title + "</h3><ul>" + items.map(pick).join("") + "</ul></section>";
  };
  // 高风险：只保留事实、判断提醒与核实问题；开场与行动约定属于"话术"，一律不给
  return (
    '<div class="engine-bar">' +
    '<span class="status ' + (high ? "" : "usable") + '">' + (high ? "已停止自动建议" : "规则分析 · 本地运行") + "</span>" +
    "<span>v" + analysis.versionNo + " · " + relTime(analysis.generatedAt) + "</span>" +
    '<button class="link-button" data-act="copy-plan">复制这一份</button></div>' +
    (analysis.warnings && analysis.warnings.length
      ? '<div class="warn-box"><ul>' + analysis.warnings.map(function (item) { return "<li>" + esc(item) + "</li>"; }).join("") + "</ul></div>"
      : "") +
    (analysis.riskFlags && analysis.riskFlags.length
      ? '<div class="risk-banner ' + (high ? "high" : "") + '"><strong>' + (high ? "已停止自动建议" : "风险提示") + "</strong><ul>" +
        analysis.riskFlags.map(function (risk) {
          return "<li><b>" + esc(risk.label) + "</b>（" + esc(risk.level) + "）：" + esc(risk.advice) + "</li>";
        }).join("") + "</ul></div>"
      : "") +
    (high
      ? '<div class="warn-box"><ul><li>由于涉及高风险情形，开场话术与行动约定已隐藏。请先与 HR/法务确认处理方式，再决定是否继续绩效沟通。</li></ul></div>'
      : analysis.conversationOpening
        ? '<section class="analysis-card"><h3>开场怎么说</h3><p class="opening">' + esc(analysis.conversationOpening) + "</p></section>"
        : "") +
    section("可以直接陈述的事实", analysis.facts, function (entry) {
      return "<li>" + esc(entry.text || entry) + "</li>";
    }) +
    section("先不要下的结论", analysis.judgmentsToPause, function (entry) {
      return "<li><strong>" + esc(entry.statement) + "</strong><p>" + esc(entry.reason) + "</p>" +
        (entry.alternative ? '<p class="alt">' + esc(entry.alternative) + "</p>" : "") + "</li>";
    }) +
    section("面谈中需要问清", analysis.questionsToVerify, function (entry) {
      return "<li>" + esc(entry) + "</li>";
    }) +
    section("管理者也要承担的部分", analysis.managerResponsibilities, function (entry) {
      return "<li>" + esc(entry) + "</li>";
    }) +
    (high ? "" : section("谈完要约定", analysis.actionPlan, function (entry) {
      return "<li>" + esc(entry) + "</li>";
    })) +
    '<div class="boundary-note">这是一份谈前准备，不是绩效结论。原因和行动应在面谈中与员工共同确认。</div>'
  );
}

function caseView(batch, item) {
  var draft = state.draft;
  var analysis = state.viewingVersion != null
    ? item.analyses.filter(function (entry) { return entry.versionNo === state.viewingVersion; })[0]
    : latestAnalysis(item);
  var supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  var versions = item.analyses.length
    ? '<div class="version-bar"><span>历史版本</span>' +
      item.analyses
        .slice()
        .reverse()
        .map(function (entry) {
          return '<button class="choice ' + (analysis && analysis.versionNo === entry.versionNo ? "selected" : "") +
            '" data-act="view-version" data-no="' + entry.versionNo + '">v' + entry.versionNo + " · " + relTime(entry.generatedAt) + "</button>";
        })
        .join("") + "</div>"
    : "";

  return shell(
    '<div class="crumbs"><button class="link-button" data-act="open-batch" data-id="' + esc(batch.id) + '">← ' + esc(batch.title) + "</button></div>" +
      '<section class="dash-head"><div>' +
      '<div class="eyebrow">' + esc(batch.periodLabel || "面谈准备") + "</div>" +
      "<h1>" + esc(draft.employeeName || "新员工") + (draft.roleTitle ? '<small class="role-tag">' + esc(draft.roleTitle) + "</small>" : "") + "</h1>" +
      '<p class="sub">' + (latestAnalysis(item) ? "最近生成于 " + relTime(latestAnalysis(item).generatedAt) : "填写情况后生成面谈方案") + "</p></div>" +
      (analysis ? '<button class="secondary" data-act="scroll-analysis">↓ 看当前方案</button>' : "") +
      "</section>" +

      '<form class="panel slim-panel" data-form="save-case">' +
      '<div class="panel-head simple-head"><div><h2>把情况说清楚</h2><p class="sub">像给同事讲一遍即可，不必整理成正式材料。</p></div></div>' +
      '<div class="form-grid">' +
      '<div class="field"><label for="employeeName">员工姓名或代号</label>' +
      '<input id="employeeName" name="employeeName" value="' + esc(draft.employeeName) + '" maxlength="120" /></div>' +
      '<div class="field"><label for="roleTitle">岗位</label>' +
      '<input id="roleTitle" name="roleTitle" value="' + esc(draft.roleTitle) + '" maxlength="120" /></div></div>' +

      '<div class="voice-card ' + (state.listening ? "listening" : "") + '">' +
      '<div class="voice-top"><div><strong>' + (state.listening ? "正在听，请继续说" : "这次发生了什么") + "</strong>" +
      "<span>" + (state.listening ? "说完后点停止，文字仍可修改" : "建议包含：原本要求、实际发生、造成的影响、时间点") + "</span></div>" +
      (supported
        ? '<button class="voice-button" type="button" data-act="voice">' +
          '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-7-4a1 1 0 0 1 2 0V12a5 5 0 0 0 10 0v-.5a1 1 0 1 1 2 0V12a7 7 0 0 1-6 6.92V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 12v-.5Z"/></svg>' +
          "<span>" + (state.listening ? "停止" : "语音输入") + "</span></button>"
        : "") +
      "</div>" +
      '<textarea id="story" name="story" rows="7" maxlength="20000" placeholder="例如：原计划周三交付，实际周五才完成，中间没有同步风险……">' + esc(draft.story) + "</textarea>" +
      '<p class="voice-note">' + (supported ? "语音由浏览器转成文字，只追加到这段输入框，不上传录音。" : "当前浏览器不支持语音识别，请用文字输入。") + "</p></div>" +

      '<div class="field full"><label for="goal">这次最希望谈成什么<span class="hint">只写一个结果</span></label>' +
      '<textarea id="goal" name="goal" rows="3" maxlength="2000" placeholder="例如：弄清没有提前预警的原因，并约定风险同步机制。">' + esc(draft.goal) + "</textarea></div>" +

      '<div class="field full"><label for="evidence">补充资料<span class="hint">可粘贴项目记录、目标说明</span></label>' +
      '<textarea id="evidence" name="evidence" rows="4" maxlength="20000" placeholder="粘贴已有的文字材料，系统会当作线索，不当作已确认的事实。">' + esc(draft.evidence) + "</textarea></div>" +

      '<div class="actions">' +
      '<button class="secondary" type="submit">保存</button>' +
      '<button class="primary" type="button" data-act="analyze">' + (latestAnalysis(item) ? "重新生成方案" : "生成面谈方案") + "</button></div>" +
      '<p class="voice-note">输入会自动保存到本机。重新生成会新增一个版本，旧版本仍可查看。</p></form>' +

      '<section id="analysis">' + analysisView(analysis) + "</section>" +
      versions +

      (latestAnalysis(item)
        ? '<section class="next-actions">' +
          '<button class="primary" data-act="next-person">保存并准备下一位</button>' +
          '<button class="secondary" data-act="open-summary">看本批汇总</button></section>'
        : "") +

      '<section class="danger-zone"><div><strong>删除这个个案</strong>' +
      "<p>删除后这位员工的输入与全部分析版本都会消失，无法恢复。</p>" +
      '<button class="link-button danger" data-act="delete-case" data-id="' + esc(item.id) + '" data-name="' + esc(item.employeeName) + '">删除个案</button></div></section>'
  );
}

/* ---------------- 视图：设置 ---------------- */

function settingsView() {
  var totalCases = 0;
  var totalAnalyses = 0;
  state.data.batches.forEach(function (batch) {
    totalCases += batch.cases.length;
    batch.cases.forEach(function (item) {
      totalAnalyses += item.analyses.length;
    });
  });

  return shell(
    '<section class="dash-head"><div><div class="eyebrow">设置</div><h1>数据与边界</h1>' +
      '<p class="sub">这个工具没有账号系统，所有内容存在你这台设备的浏览器里。</p></div></section>' +

      '<section class="panel slim-panel"><h2>当前数据</h2><dl class="kv">' +
      "<div><dt>批次</dt><dd>" + state.data.batches.length + "</dd></div>" +
      "<div><dt>员工</dt><dd>" + totalCases + "</dd></div>" +
      "<div><dt>分析版本</dt><dd>" + totalAnalyses + "</dd></div>" +
      "<div><dt>最后修改</dt><dd>" + (state.data.updatedAt ? new Date(state.data.updatedAt).toLocaleString("zh-CN") : "—") + "</dd></div>" +
      "</dl>" +
      (state.storageBroken ? '<div class="error">浏览器存储不可用，当前内容无法持久保存，请立即导出。</div>' : "") +
      "</section>" +

      '<section class="panel slim-panel"><h2>备份</h2>' +
      '<p class="sub">导出的 JSON 可以在另一台设备导入，继续使用。</p>' +
      '<div class="actions"><button class="secondary" data-act="export-all">导出全部数据（JSON）</button>' +
      '<label class="secondary upload-label">导入 JSON<input type="file" accept="application/json" data-role="import" hidden /></label></div>' +
      "</section>" +

      '<section class="panel slim-panel"><h2>分析方式</h2>' +
      '<p class="sub">当前使用本地规则分析：从你写的那段话里抽取事实、判断、待核实问题和管理者责任，' +
      "不联网、不调用外部模型，因此没有调用成本，也不会有内容外传。代价是它不理解语义，改写措辞会影响抽取结果。</p>" +
      '<ul class="plain-list"><li>不做员工横向排名，不自动给出绩效等级，不判断是否胜任。</li>' +
      "<li>不生成处分、辞退、降薪或正式 PIP 建议；遇到这些情形会停止给出话术。</li>" +
      "<li>输出是谈前草案，必须由管理者确认后才使用。</li>" +
      "<li>不保存原始录音；语音只在本机浏览器转成文字。</li></ul></section>" +

      '<section class="danger-zone"><div><strong>清空本机全部数据</strong>' +
      "<p>会删除这台浏览器里的所有批次、员工和方案，且无法恢复。建议先导出备份。</p>" +
      (state.confirmClear
        ? '<div class="actions"><button class="secondary" data-act="cancel-clear">取消</button>' +
          '<button class="danger-button" data-act="clear-all">确认清空</button></div>'
        : '<button class="link-button danger" data-act="ask-clear">清空数据</button>') +
      "</div></section>"
  );
}

/* ---------------- 渲染 ---------------- */

function parseHash() {
  var raw = location.hash.replace(/^#\/?/, "");
  var parts = raw.split("/");
  return { view: parts[0] || "home", id: parts[1] || "" };
}

function setHash(hash, push) {
  if (location.hash === hash) return;
  if (push) history.pushState({}, "", hash);
  else history.replaceState({}, "", hash);
}

function render() {
  var route = parseHash();
  if (route.view === "batch" && route.id) {
    var batch = findBatch(route.id);
    if (batch) {
      root.innerHTML = batchView(batch);
      return;
    }
  }
  if (route.view === "case" && route.id) {
    var found = findCase(route.id);
    if (found) {
      root.innerHTML = caseView(found.batch, found.item);
      return;
    }
  }
  if (route.view === "settings") {
    root.innerHTML = settingsView();
    return;
  }
  root.innerHTML = homeView();
}

function go(view, id) {
  state.viewingVersion = null;
  state.renaming = false;
  state.showNewCase = false;
  state.showNewBatch = false;
  state.summary = false;
  if (view === "home") setHash("#/home", true);
  else if (view === "settings") setHash("#/settings", true);
  else setHash("#/" + view + "/" + id, true);
  render();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------------- 语音 ---------------- */

var recognition = null;

function toggleVoice() {
  var SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;
  if (state.listening && recognition) {
    recognition.stop();
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  var before = state.draft.story.trim();
  recognition.onstart = function () {
    state.listening = true;
    render();
  };
  recognition.onresult = function (event) {
    var text = "";
    for (var index = event.resultIndex; index < event.results.length; index += 1) {
      text += event.results[index][0].transcript;
    }
    state.draft.story = before + (before ? "\n" : "") + text;
    var field = root.querySelector("#story");
    if (field) field.value = state.draft.story;
    scheduleSave();
  };
  recognition.onerror = function (event) {
    state.listening = false;
    render();
    toast(event.error === "not-allowed" ? "未获得麦克风权限，可以继续用文字输入。" : "语音识别不可用，请改用文字。");
  };
  recognition.onend = function () {
    state.listening = false;
    render();
  };
  recognition.start();
}

/* ---------------- 保存 ---------------- */

var saveTimer = null;

function scheduleSave() {
  state.dirty = true;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(function () {
    commitDraft(true);
  }, 500);
}

function commitDraft(silent) {
  var route = parseHash();
  if (route.view !== "case" || !route.id) return;
  var found = findCase(route.id);
  if (!found) return;
  if (state.draft.employeeName.trim()) found.item.employeeName = state.draft.employeeName.trim();
  found.item.roleTitle = state.draft.roleTitle.trim();
  found.item.story = state.draft.story;
  found.item.goal = state.draft.goal;
  found.item.evidence = state.draft.evidence;
  found.item.updatedAt = new Date().toISOString();
  found.batch.updatedAt = new Date().toISOString();
  saveData();
  state.dirty = false;
  if (!silent) toast("已保存");
}

function download(filename, content, mime) {
  var blob = new Blob([content], { type: mime || "text/plain;charset=utf-8" });
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function copyText(text, okMessage) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      function () {
        toast(okMessage);
      },
      function () {
        toast("浏览器未允许复制，请改用导出。");
      }
    );
  } else {
    toast("当前浏览器不支持一键复制，请改用导出。");
  }
}

/* ---------------- 事件 ---------------- */

root.addEventListener("click", function (event) {
  var target = event.target.closest("[data-act]");
  if (!target) return;
  var act = target.dataset.act;
  var route = parseHash();

  if (act === "goto") {
    go(target.dataset.view);
    return;
  }
  if (act === "toggle-new-batch") {
    state.showNewBatch = !state.showNewBatch;
    render();
    return;
  }
  if (act === "toggle-new-case") {
    state.showNewCase = !state.showNewCase;
    render();
    if (state.showNewCase) {
      var input = root.querySelector("#emp-name");
      if (input) input.focus();
    }
    return;
  }
  if (act === "toggle-summary") {
    state.summary = !state.summary;
    render();
    var node = root.querySelector("#summary");
    if (node) node.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "toggle-rename") {
    state.renaming = !state.renaming;
    render();
    return;
  }
  if (act === "open-batch") {
    go("batch", target.dataset.id);
    return;
  }
  if (act === "open-case") {
    var found = findCase(target.dataset.id);
    if (!found) return;
    state.draft = {
      employeeName: found.item.employeeName,
      roleTitle: found.item.roleTitle || "",
      story: found.item.story || "",
      goal: found.item.goal || "",
      evidence: found.item.evidence || "",
    };
    state.dirty = false;
    go("case", found.item.id);
    return;
  }
  if (act === "open-summary") {
    var batchId = target.dataset.id || (findCase(route.id) || {}).batch;
    go("batch", typeof batchId === "string" ? batchId : route.id);
    state.summary = true;
    render();
    var summary = root.querySelector("#summary");
    if (summary) summary.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "voice") {
    toggleVoice();
    return;
  }
  if (act === "scroll-analysis") {
    var analysisNode = root.querySelector("#analysis");
    if (analysisNode) analysisNode.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "view-version") {
    state.viewingVersion = Number(target.dataset.no);
    render();
    var versionNode = root.querySelector("#analysis");
    if (versionNode) versionNode.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "analyze") {
    var current = findCase(route.id);
    if (!current) return;
    if (!state.draft.employeeName.trim()) {
      toast("先填上员工姓名或代号。");
      return;
    }
    if (state.draft.story.trim().length < 15 && !state.draft.evidence.trim()) {
      toast("情况描述太短，至少写清发生了什么。");
      return;
    }
    commitDraft(true);
    var result = window.TanJixiaoAnalysis.analyze({
      role: state.draft.roleTitle || state.draft.employeeName,
      story: state.draft.story,
      goal: state.draft.goal,
      evidence: state.draft.evidence,
    });
    result.versionNo = current.item.analyses.length + 1;
    current.item.analyses.push(result);
    current.item.updatedAt = new Date().toISOString();
    current.batch.updatedAt = new Date().toISOString();
    saveData();
    state.viewingVersion = null;
    render();
    toast(result.riskLevel === "high" ? "已识别高风险，停止给出话术" : "方案已生成");
    var target2 = root.querySelector("#analysis");
    if (target2) target2.scrollIntoView({ behavior: "smooth", block: "start" });
    return;
  }
  if (act === "copy-plan") {
    var found2 = findCase(route.id);
    if (!found2) return;
    var item2 = found2.item;
    var analysis2 = state.viewingVersion != null
      ? item2.analyses.filter(function (entry) { return entry.versionNo === state.viewingVersion; })[0]
      : latestAnalysis(item2);
    var text = ["# " + item2.employeeName + " 面谈准备（v" + analysis2.versionNo + "）", ""];
    if (analysis2.riskLevel !== "high" && analysis2.conversationOpening) text.push("## 开场", analysis2.conversationOpening, "");
    var push = function (title, items, pick) {
      if (!items || !items.length) return;
      text.push("## " + title);
      items.forEach(function (entry) { text.push("- " + pick(entry)); });
      text.push("");
    };
    push("可以直接陈述的事实", analysis2.facts, function (entry) { return entry.text || entry; });
    push("先不要下的结论", analysis2.judgmentsToPause, function (entry) { return entry.statement + " —— " + entry.reason; });
    push("面谈中需要问清", analysis2.questionsToVerify, function (entry) { return entry; });
    push("管理者也要承担的部分", analysis2.managerResponsibilities, function (entry) { return entry; });
    if (analysis2.riskLevel !== "high") push("谈完要约定", analysis2.actionPlan, function (entry) { return entry; });
    if (analysis2.riskLevel === "high") text.push("## 风险提示", "> 已停止自动建议：请先与 HR/法务确认处理方式。");
    text.push("> 本文是谈前准备，不是绩效结论。");
    copyText(text.join("\n"), "已复制到剪贴板");
    return;
  }
  if (act === "next-person") {
    var currentBatch = (findCase(route.id) || {}).batch;
    commitDraft(true);
    if (currentBatch) {
      go("batch", currentBatch.id);
      state.showNewCase = true;
      render();
      var nameField = root.querySelector("#emp-name");
      if (nameField) nameField.focus();
      toast("已保存，接着录下一位");
    }
    return;
  }
  if (act === "export-batch" || act === "copy-batch") {
    var batch = findBatch(route.id);
    if (!batch) return;
    var markdown = summaryMarkdown(batch);
    if (act === "export-batch") {
      download("面谈方案-" + batch.title + "-" + new Date().toISOString().slice(0, 10) + ".md", markdown, "text/markdown;charset=utf-8");
      toast("已导出 Markdown");
    } else {
      copyText(markdown, "已复制汇总");
    }
    return;
  }
  if (act === "delete-case") {
    var name = target.dataset.name || "该员工";
    if (!window.confirm("确认删除「" + name + "」的个案和全部分析版本？此操作无法恢复。")) return;
    var located = findCase(target.dataset.id);
    if (!located) return;
    located.batch.cases = located.batch.cases.filter(function (entry) {
      return entry.id !== target.dataset.id;
    });
    located.batch.updatedAt = new Date().toISOString();
    saveData();
    if (route.view === "case") go("batch", located.batch.id);
    else render();
    toast("已删除");
    return;
  }
  if (act === "delete-batch") {
    var batchToDelete = findBatch(target.dataset.id);
    if (!batchToDelete) return;
    if (!window.confirm("确认删除批次「" + batchToDelete.title + "」及其中全部个案？此操作无法恢复。")) return;
    state.data.batches = state.data.batches.filter(function (entry) {
      return entry.id !== target.dataset.id;
    });
    saveData();
    go("home");
    toast("批次已删除");
    return;
  }
  if (act === "export-all") {
    download("谈绩效-备份-" + new Date().toISOString().slice(0, 10) + ".json", JSON.stringify(state.data, null, 2), "application/json");
    toast("已导出 JSON 备份");
    return;
  }
  if (act === "ask-clear") {
    state.confirmClear = true;
    render();
    return;
  }
  if (act === "cancel-clear") {
    state.confirmClear = false;
    render();
    return;
  }
  if (act === "clear-all") {
    state.data = emptyData();
    saveData();
    state.confirmClear = false;
    go("home");
    toast("本机数据已清空");
    return;
  }
  if (act === "load-sample") {
    loadSample();
    return;
  }
});

root.addEventListener("input", function (event) {
  var field = event.target;
  if (!field.name) return;
  if (state.draft && field.name in state.draft) {
    state.draft[field.name] = field.value;
    scheduleSave();
  }
});

root.addEventListener("change", function (event) {
  if (event.target.dataset.role === "import") {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var parsed = JSON.parse(String(reader.result));
        if (!parsed || !Array.isArray(parsed.batches)) throw new Error("格式不对");
        if (!window.confirm("导入会覆盖当前浏览器里的全部数据，确认继续？")) return;
        state.data = parsed;
        saveData();
        go("home");
        toast("已导入");
      } catch (error) {
        toast("导入失败：文件不是有效的备份 JSON。");
      }
    };
    reader.readAsText(file);
    event.target.value = "";
  }
});

root.addEventListener("submit", function (event) {
  var form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  var data = new FormData(form);
  var kind = form.dataset.form;

  if (kind === "create-batch") {
    var title = String(data.get("title") || "").trim();
    if (!title) return;
    var batch = {
      id: uid(),
      title: title,
      periodLabel: String(data.get("periodLabel") || "").trim(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cases: [],
    };
    state.data.batches.push(batch);
    saveData();
    state.showNewBatch = false;
    go("batch", batch.id);
    return;
  }

  if (kind === "rename-batch") {
    var current = findBatch(parseHash().id);
    var newTitle = String(data.get("title") || "").trim();
    if (current && newTitle) {
      current.title = newTitle;
      current.updatedAt = new Date().toISOString();
      saveData();
    }
    state.renaming = false;
    render();
    return;
  }

  if (kind === "create-case") {
    var batchId = parseHash().id;
    var target = findBatch(batchId);
    if (!target) return;
    var name = String(data.get("employeeName") || "").trim();
    if (!name) return;
    var item = {
      id: uid(),
      employeeName: name,
      roleTitle: String(data.get("roleTitle") || "").trim(),
      story: "",
      goal: "",
      evidence: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analyses: [],
    };
    target.cases.push(item);
    target.updatedAt = new Date().toISOString();
    saveData();
    state.draft = { employeeName: item.employeeName, roleTitle: item.roleTitle, story: "", goal: "", evidence: "" };
    state.dirty = false;
    go("case", item.id);
    return;
  }

  if (kind === "save-case") {
    commitDraft(false);
    render();
    return;
  }
});

window.addEventListener("popstate", function () {
  render();
});

window.addEventListener("beforeunload", function (event) {
  if (state.dirty) {
    commitDraft(true);
  }
});

/* ---------------- 示例 ---------------- */

function loadSample() {
  var existing = state.data.batches.filter(function (item) {
    return item.title === "示例：2026 年度绩效反馈";
  })[0];
  var batch = existing;
  if (!batch) {
    batch = {
      id: uid(),
      title: "示例：2026 年度绩效反馈",
      periodLabel: "2026 Q4",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      cases: [],
    };
    state.data.batches.push(batch);
  }
  if (!batch.cases.length) {
    var story =
      "产品经理负责的客户方案原定 10 月 16 日提交，实际 10 月 18 日才提交。他在 10 月 15 日已经发现可能延期，但没有告诉我或客户经理。客户评审因此推迟两天。设计素材也比计划晚了一天。我觉得他缺乏责任心。";
    var item = {
      id: uid(),
      employeeName: "产品-A",
      roleTitle: "产品经理",
      story: story,
      goal: "弄清没有提前预警的原因，并约定以后发现交付风险时的沟通机制。",
      evidence: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      analyses: [],
    };
    var result = window.TanJixiaoAnalysis.analyze({ role: item.roleTitle, story: story, goal: item.goal, evidence: "" });
    result.versionNo = 1;
    item.analyses.push(result);
    batch.cases.push(item);
  }
  saveData();
  go("batch", batch.id);
  toast("示例已载入，可以直接改文字试试");
}

/* ---------------- 启动 ---------------- */

state.data = loadData();
render();
if (!location.hash) setHash("#/home", false);

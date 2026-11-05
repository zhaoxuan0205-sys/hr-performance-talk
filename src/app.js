/**
 * 谈绩效 · 轻量版
 *
 * 流程只有一条：说情况 → 确认重点 → 拿方案。
 * 涉及多人时，只是把每个人的记录攒在本机，最后一次性导出 Markdown 下载。
 * 没有账号、没有批次管理、没有设置页。数据只存在这台设备的浏览器里。
 */

const root = document.getElementById("app");
const ANALYSIS = window.TanJixiaoAnalysis;

const STORE_KEY = "tanJixiaoLight.v1";

const SAMPLE_STORY =
  "产品经理负责的客户方案原定 10 月 16 日提交，实际 10 月 18 日才提交。他在 10 月 15 日已经发现可能延期，但没有告诉我或客户经理。客户评审因此推迟两天。设计素材也比计划晚了一天。我觉得他缺乏责任心，希望以后能提前暴露风险。";

const SAMPLE_GOAL = "弄清没有提前预警的原因，并约定以后发现交付风险时的沟通机制。";

const DEFAULT_RESPONSE =
  "我理解设计素材延迟会影响进度。我们先确认一下：你是什么时候判断可能无法按时完成的？当时为什么没有发出风险提醒？";

function freshState() {
  return {
    role: "产品经理",
    story: SAMPLE_STORY,
    goal: SAMPLE_GOAL,
    files: [],
    cases: [],
    currentSavedId: null,
    errors: {},
    analysis: null,
    quickAnswer: "unknown",
    listening: false,
    transcriptBefore: "",
    reaction: "external",
    response: DEFAULT_RESPONSE,
    coachVisible: false,
    toast: "",
  };
}

let state = freshState();
try {
  const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
  if (saved && typeof saved === "object") {
    state = Object.assign(freshState(), saved, {
      screen: undefined,
      listening: false,
      toast: "",
      coachVisible: false,
      errors: {},
    });
    delete state.screen;
  }
} catch {
  /* 本机记录不可用时按全新状态运行 */
}

function persist() {
  try {
    const data = {
      role: state.role,
      story: state.story,
      goal: state.goal,
      files: state.files,
      cases: state.cases,
      currentSavedId: state.currentSavedId,
      analysis: state.analysis,
      quickAnswer: state.quickAnswer,
      reaction: state.reaction,
      response: state.response,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* 隐私模式等场景下静默降级为仅会话内保存 */
  }
}

let recognition = null;

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function go(screen) {
  state.screen = screen;
  state.toast = "";
  state.coachVisible = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  render();
}

function shell(content, step = 0) {
  const labels = ["说情况", "确认重点", "拿方案"];
  return `
    <div class="shell">
      <header class="topbar">
        <button class="brand brand-button" data-go="home" aria-label="返回首页"><span class="brand-mark">谈</span><span>谈绩效<small>面谈准备小工具</small></span></button>
        <span class="privacy">无需登录 · 数据仅存本机浏览器</span>
      </header>
      <main class="container compact-container">
        ${step ? `<nav class="steps simple-steps" aria-label="流程进度">${labels.map((label, index) => `<div class="step ${index + 1 === step ? "active" : ""} ${index + 1 < step ? "done" : ""}">${index + 1}<span>${label}</span></div>`).join("")}</nav>` : ""}
        ${content}
      </main>
      ${state.toast ? `<div class="toast" role="status">${state.toast}</div>` : ""}
    </div>`;
}

function home() {
  const recordsEntry = state.cases.length
    ? `<button class="batch-entry" data-go="records"><strong>已记好 ${state.cases.length} 个人的沟通记录</strong><span>查看记录并下载 →</span></button>`
    : "";
  return shell(`
    <section class="simple-hero">
      <div class="eyebrow">给直接管理者的谈前准备工具</div>
      <h1>说清情况，<br />带走一份面谈方案。</h1>
      <p class="lead">不用填复杂表格。花两三分钟说清发生了什么，帮你分开事实与判断，整理谈话重点和后续行动。要谈多个人时，把每个人的记录留好，最后一起下载。</p>
      <div class="hero-actions"><button class="primary large-button" data-go="input">开始准备</button><span class="sub">支持语音和文字</span></div>
      ${recordsEntry}
      <div class="promise-row"><span>不替员工打分</span><span>不判断是否胜任</span><span>不生成处分建议</span></div>
    </section>`, 0);
}

function inputScreen() {
  const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  const fileList = state.files.length ? `<div class="file-list">${state.files.map((file) => `
    <article class="file-item">
      <div><strong>${escapeHtml(file.name)}</strong><span>${escapeHtml(file.detail)}</span></div>
      <button class="file-remove" data-file-remove="${escapeHtml(file.id)}" aria-label="移除 ${escapeHtml(file.name)}">移除</button>
    </article>`).join("")}</div>` : "";
  return shell(`
    <section class="panel slim-panel">
      <div class="panel-head simple-head"><div><h2>把情况说给我听</h2><p class="sub">像给 HR 同事讲一遍即可，不必整理成正式材料。</p></div><span class="time-tag">约 2 分钟</span></div>
      <div class="field-row">
        <label for="role">员工角色</label>
        <input id="role" value="${escapeHtml(state.role)}" placeholder="例如：销售主管" />
      </div>
      <div class="voice-card ${state.listening ? "listening" : ""}">
        <div class="voice-top">
          <div><strong>${state.listening ? "正在听，请继续说" : "描述这次绩效差距"}</strong><span>${state.listening ? "说完后点击停止，文字可继续修改" : "建议包含：原本要求、实际发生、造成影响"}</span></div>
          <button class="voice-button" data-action="voice" aria-label="${state.listening ? "停止语音输入" : "开始语音输入"}">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15.5a3.5 3.5 0 0 0 3.5-3.5V6a3.5 3.5 0 1 0-7 0v6a3.5 3.5 0 0 0 3.5 3.5Zm-7-4a1 1 0 0 1 2 0V12a5 5 0 0 0 10 0v-.5a1 1 0 1 1 2 0V12a7 7 0 0 1-6 6.92V21h3a1 1 0 1 1 0 2H8a1 1 0 1 1 0-2h3v-2.08A7 7 0 0 1 5 12v-.5Z"/></svg>
            <span>${state.listening ? "停止" : "语音输入"}</span>
          </button>
        </div>
        <textarea id="story" placeholder="例如：原计划周三交付，实际周五完成……">${escapeHtml(state.story)}</textarea>
        ${!supported ? `<p class="voice-note">当前浏览器不支持语音识别，请使用文字输入。</p>` : `<p class="voice-note">首次使用时，浏览器会请求麦克风权限。录音内容仅用于转成文字。</p>`}
      </div>
      <div class="field full simple-goal">
        <label for="goal">这次最希望谈成什么？<span class="hint">只写一个结果</span></label>
        <textarea id="goal">${escapeHtml(state.goal)}</textarea>
      </div>
      <p class="voice-note">只录入面谈所必需的信息，不要录入身份证号、私人手机号、客户隐私或其他无关敏感信息。</p>
      ${state.errors.main ? `<div class="error">${state.errors.main}</div>` : ""}
      <div class="actions simple-actions"><button class="secondary" data-action="clear">清空示例</button><button class="primary" data-action="analyze">整理谈话重点</button></div>
    </section>`, 1);
}

function reviewScreen() {
  const a = state.analysis;
  if (!a) { state.screen = "input"; return inputScreen(); }

  if (a.riskLevel === "high") {
    const cards = a.riskFlags.map((flag) => `
      <article class="review-row judgment-row">
        <div class="review-label"><span>!</span><strong>${escapeHtml(flag.label)}</strong></div>
        <p>${escapeHtml(flag.advice)}</p>
      </article>`).join("");
    return shell(`
      <section class="panel slim-panel">
        <div class="panel-head simple-head"><div><h2>先停一下：这不适合绩效面谈</h2><p class="sub">你的描述里出现了需要专门流程处理的情形。</p></div><span class="status blocked">高风险</span></div>
        ${cards}
        <p class="voice-note">为了保护你和员工，本工具在这些情形下不提供谈话话术。请先与 HR / 法务确认处理方式，再决定下一步。</p>
        <div class="actions simple-actions"><button class="secondary" data-go="input">返回修改描述</button></div>
      </section>`, 2);
  }

  const factList = a.facts.length
    ? `<ul>${a.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("")}</ul>`
    : `<p>没有从描述里提取到带时间和结果的事实。建议补上：原本要求、实际发生、造成影响。</p>`;
  const judgmentPart = a.judgmentsToPause.length
    ? a.judgmentsToPause.map((item) => `
        <div class="judgment-item"><p>${escapeHtml(item.statement)}</p><p class="judgment-reason">${escapeHtml(item.reason)}</p></div>`).join("")
    : `<p>没有检测到明显的评价性表述，可以直接进入面谈。</p>`;
  return shell(`
    <section class="panel slim-panel">
      <div class="panel-head simple-head"><div><h2>确认三件事就可以继续</h2><p class="sub">先把事实与判断分开，避免带着未经验证的结论进入面谈。</p></div><span class="status usable">可继续</span></div>
      <div class="review-list">
        <article class="review-row fact-row"><div class="review-label"><span>1</span><strong>可以直接说的事实</strong></div>${factList}</article>
        <article class="review-row judgment-row"><div class="review-label"><span>2</span><strong>先不要下的结论</strong></div>${judgmentPart}</article>
        <article class="review-row question-row"><div class="review-label"><span>3</span><strong>面谈中需要问清</strong></div><ul>${a.questionsToVerify.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></article>
      </div>
      <div class="actions simple-actions"><button class="secondary" data-go="input">修改描述</button><button class="primary" data-go="report">生成面谈方案</button></div>
    </section>`, 2);
}

function reportScreen() {
  const a = state.analysis;
  if (!a) { state.screen = "input"; return inputScreen(); }
  if (a.riskLevel === "high") { state.screen = "review"; return reviewScreen(); }
  return shell(`
    <section class="panel plan-panel" id="report">
      <div class="plan-title"><div><span>面谈前速览</span><h2>${escapeHtml(state.role || "员工")} · 面谈方案</h2></div><button class="secondary small-button" data-action="copy-report">复制</button></div>
      ${state.goal ? `<section class="plan-focus"><small>这次只谈一个目标</small><strong>${escapeHtml(state.goal)}</strong></section>` : ""}
      <div class="plan-grid">
        <section><h3>先讲清的事实</h3><ul>${a.facts.length ? a.facts.map((item) => `<li>${escapeHtml(item.text)}</li>`).join("") : "<li>（补上时间线后再谈）</li>"}</ul></section>
        <section><h3>先问，不要先判断</h3><ul>${a.questionsToVerify.map((q) => `<li>${escapeHtml(q)}</li>`).join("")}</ul></section>
        <section><h3>管理者也要承担的部分</h3><ul>${a.managerResponsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
        <section><h3>谈完要约定</h3><ul>${a.actionPlan.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>
      </div>
      <div class="boundary-note">这是一份谈前准备，不是绩效结论。原因和行动应在面谈中共同确认。</div>
      <div class="save-note">记录保存在这台设备的浏览器里，清理浏览器会丢失。要谈多个人时，逐个保存后一次性导出下载。</div>
      <div class="post-actions"><button class="primary" data-action="save-next">保存并准备下一位</button><button class="secondary" data-action="save-records">保存并查看记录</button><button class="secondary" data-go="rehearsal">练一次员工可能的回应</button></div>
    </section>`, 3);
}

const reactions = {
  external: ["强调外部原因", "设计部门本来就给晚了，这不能全怪我。"],
  fairness: ["质疑公平性", "为什么只说我？其他项目也经常延期。"],
  silent: ["沉默接受", "好的，我知道了，以后注意。"]
};

const coachByReaction = {
  external: ["你承认了外部影响，没有急着争论责任。", "继续追问员工何时发现风险，以及当时为什么没有预警。"],
  fairness: ["先承认员工对公平性的关切。", "说明本次只讨论这一个具体事件，不使用其他员工的信息压制他的疑问。"],
  silent: ["不要把“我知道了”当作已经达成共识。", "请员工用自己的话说明下一次准备在什么节点采取什么行动。"]
};

function rehearsalScreen() {
  const reaction = reactions[state.reaction];
  const coach = coachByReaction[state.reaction];
  return shell(`
    <section class="panel slim-panel">
      <div class="panel-head simple-head"><div><h2>只练最担心的一种反应</h2><p class="sub">练习内容不会自动写回员工事实。</p></div></div>
      <div class="reaction-chips">${Object.entries(reactions).map(([key, value]) => `<button class="choice ${state.reaction === key ? "selected" : ""}" data-reaction="${key}">${value[0]}</button>`).join("")}</div>
      <div class="dialogue-box"><span>员工</span><p>${reaction[1]}</p></div>
      <label for="response">你会怎么回应？</label>
      <textarea id="response">${escapeHtml(state.response)}</textarea>
      <button class="primary feedback-button" data-action="coach">查看教练反馈</button>
      ${state.coachVisible ? `<div class="coach-simple"><div><strong>保留</strong><p>${coach[0]}</p></div><div><strong>下一步</strong><p>${coach[1]}</p></div></div>` : ""}
      <div class="actions simple-actions"><button class="secondary" data-go="report">返回方案</button></div>
    </section>`, 3);
}

function recordsScreen() {
  const cards = state.cases.length
    ? state.cases.map((item, index) => `<article class="batch-card">
        <div class="batch-card-head"><div><small>第 ${index + 1} 位</small><h3>${escapeHtml(item.role || "未命名角色")}</h3></div><button class="file-remove" data-case-remove="${escapeHtml(item.id)}">移除</button></div>
        <p><strong>沟通目标：</strong>${escapeHtml(item.goal || "待补充")}</p>
        <p class="batch-excerpt"><strong>情况摘要：</strong>${escapeHtml((item.story || "").slice(0, 120))}${(item.story || "").length > 120 ? "……" : ""}</p>
        <div class="batch-meta"><span>${item.factsCount} 条事实</span><span>${item.questionsCount} 个待问问题</span></div>
      </article>`).join("")
    : `<div class="empty-batch">还没有任何人的记录。逐个准备、逐个保存，最后在这里一次性下载。</div>`;
  return shell(`
    <section class="panel batch-panel">
      <div class="panel-head simple-head"><div><div class="eyebrow">沟通记录</div><h2>多人记录与下载</h2><p class="sub">逐人保留情况和方案，不做排名、打分或横向比较。</p></div><span class="status usable">${state.cases.length} 人</span></div>
      <div class="batch-grid">${cards}</div>
      ${state.cases.length ? `<section class="batch-guidance"><h3>下载后整批沟通时共同检查</h3><ul><li>每个人都使用可核实的事实，不复制人格标签。</li><li>分别确认目标是否清晰、资源是否充分、管理者是否提供过必要支持。</li><li>行动约定逐人形成，不用其他员工的情况施压或比较。</li></ul></section>` : ""}
      <div class="actions batch-actions"><button class="secondary" data-go="home">返回首页</button><div class="actions-right">${state.cases.length ? `<button class="secondary" data-action="clear-records">清空全部记录</button><button class="secondary" data-action="copy-records">复制汇总</button><button class="primary" data-action="export-records">下载 Markdown</button>` : `<button class="secondary" data-go="input">开始准备</button>`}</div></div>
    </section>`, 0);
}

function render() {
  const screens = { home, input: inputScreen, review: reviewScreen, report: reportScreen, rehearsal: rehearsalScreen, records: recordsScreen };
  root.innerHTML = screens[state.screen || "home"]();
  bind();
}

function bind() {
  root.querySelectorAll("[data-go]").forEach((element) => element.addEventListener("click", () => go(element.dataset.go)));
  root.querySelectorAll("[data-reaction]").forEach((element) => element.addEventListener("click", () => { state.reaction = element.dataset.reaction; state.coachVisible = false; render(); }));
  root.querySelectorAll("[data-action]").forEach((element) => element.addEventListener("click", () => action(element.dataset.action)));
  const role = root.querySelector("#role");
  const story = root.querySelector("#story");
  const goal = root.querySelector("#goal");
  const response = root.querySelector("#response");
  if (role) role.addEventListener("input", (event) => { state.role = event.target.value; persist(); });
  if (story) story.addEventListener("input", (event) => { state.story = event.target.value; persist(); });
  if (goal) goal.addEventListener("input", (event) => { state.goal = event.target.value; persist(); });
  if (response) response.addEventListener("input", (event) => { state.response = event.target.value; persist(); });
  root.querySelectorAll("[data-file-remove]").forEach((element) => element.addEventListener("click", () => {
    state.files = state.files.filter((file) => file.id !== element.dataset.fileRemove);
    persist();
    render();
  }));
  root.querySelectorAll("[data-case-remove]").forEach((element) => element.addEventListener("click", () => {
    state.cases = state.cases.filter((item) => item.id !== element.dataset.caseRemove);
    persist();
    render();
  }));
}

function saveCurrentCase() {
  const a = state.analysis || { facts: [], questionsToVerify: [] };
  const item = {
    id: state.currentSavedId || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    savedAt: new Date().toISOString().slice(0, 10),
    role: state.role.trim(),
    story: state.story.trim(),
    goal: state.goal.trim(),
    factsCount: (a.facts || []).length,
    questionsCount: (a.questionsToVerify || []).length,
  };
  const existing = state.cases.findIndex((entry) => entry.id === item.id);
  if (existing >= 0) state.cases[existing] = item;
  else state.cases.push(item);
  state.currentSavedId = item.id;
  persist();
}

function resetCurrentCase() {
  state.role = "";
  state.story = "";
  state.goal = "";
  state.files = [];
  state.analysis = null;
  state.quickAnswer = "unknown";
  state.currentSavedId = null;
  state.errors = {};
  persist();
}

function recordsMarkdown() {
  const sections = state.cases.map((item, index) => `## ${index + 1}. ${item.role || "未命名角色"}（${item.savedAt}）\n\n**沟通目标**\n\n${item.goal || "待补充"}\n\n**情况摘要**\n\n${item.story || "（未填写）"}\n\n**面谈重点**\n\n- 先陈述可核实事实，不下人格结论\n- 先问再判断：还原时间线、当时的考虑、外部影响\n- 明确管理者需要提供的支持\n- 共同约定行动、责任人与复盘时间`).join("\n\n---\n\n");
  return `# 绩效反馈面谈准备记录\n\n共 ${state.cases.length} 人。本文档是谈前准备，不是绩效结论或横向排名。\n\n${sections}\n`;
}

function downloadRecords() {
  const blob = new Blob([recordsMarkdown()], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `绩效面谈准备记录-${new Date().toISOString().slice(0, 10)}.md`;
  link.click();
  URL.revokeObjectURL(url);
  state.toast = "记录文件已开始下载。";
  render();
}

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    state.toast = "当前浏览器不支持语音识别，请使用文字输入。";
    render();
    return;
  }
  if (state.listening && recognition) { recognition.stop(); return; }
  recognition = new SpeechRecognition();
  recognition.lang = "zh-CN";
  recognition.continuous = true;
  recognition.interimResults = true;
  state.transcriptBefore = state.story.trim();
  recognition.onstart = () => { state.listening = true; render(); };
  recognition.onresult = (event) => {
    let transcript = "";
    for (let index = event.resultIndex; index < event.results.length; index += 1) transcript += event.results[index][0].transcript;
    state.story = `${state.transcriptBefore}${state.transcriptBefore ? "\n" : ""}${transcript}`;
    const field = root.querySelector("#story");
    if (field) field.value = state.story;
  };
  recognition.onerror = (event) => {
    state.listening = false;
    state.toast = event.error === "not-allowed" ? "未获得麦克风权限，可以继续使用文字输入。" : "语音识别暂时不可用，请改用文字输入。";
    render();
  };
  recognition.onend = () => { state.listening = false; render(); };
  recognition.start();
}

function action(name) {
  if (name === "voice") startVoice();
  if (name === "clear") { state.role = ""; state.story = ""; state.goal = ""; state.analysis = null; state.errors = {}; persist(); render(); }
  if (name === "analyze") {
    const missing = [];
    if (!state.role.trim()) missing.push("员工角色");
    if (state.story.trim().length < 20) missing.push("具体情况（至少 20 字）");
    if (!state.goal.trim()) missing.push("谈话目标");
    if (missing.length) { state.errors.main = `请补充：${missing.join("、")}。`; render(); return; }
    state.errors = {};
    state.analysis = ANALYSIS.analyze({ role: state.role, story: state.story, goal: state.goal });
    persist();
    go("review");
  }
  if (name === "coach") { if (!state.response.trim()) { state.toast = "请先写下你的回应。"; render(); } else { state.coachVisible = true; render(); } }
  if (name === "copy-report") {
    const text = root.querySelector("#report").innerText;
    navigator.clipboard?.writeText(text).then(() => { state.toast = "面谈方案已复制。"; render(); }).catch(() => { state.toast = "浏览器未允许复制，请手动选择内容。"; render(); });
  }
  if (name === "save-next") {
    saveCurrentCase();
    resetCurrentCase();
    state.toast = "已保存这条记录，可以继续准备下一位。";
    go("input");
  }
  if (name === "save-records") { saveCurrentCase(); go("records"); }
  if (name === "copy-records") {
    navigator.clipboard?.writeText(recordsMarkdown()).then(() => { state.toast = "汇总已复制。"; render(); }).catch(() => { state.toast = "浏览器未允许复制，请使用下载。"; render(); });
  }
  if (name === "export-records") downloadRecords();
  if (name === "clear-records") {
    if (window.confirm(`确定清空全部 ${state.cases.length} 条记录吗？删除后无法恢复。建议先下载留档。`)) {
      state.cases = [];
      persist();
      state.toast = "记录已清空。";
    }
    render();
  }
}

render();

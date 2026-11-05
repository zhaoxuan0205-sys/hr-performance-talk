/**
 * 谈绩效 · 分析引擎（浏览器版，无依赖、不联网）
 *
 * 输入管理者自己写的那段话，用确定性规则抽出：
 *   事实 / 不宜直接下的判断 / 面谈要核实的问题 / 管理者责任 / 行动约定 / 风险提示
 *
 * 设计原则：
 *  - 所有输出都由输入派生，不含任何写死的样例文本；
 *  - 高风险情形（辞退、降薪、歧视、骚扰、工伤、医疗、争议）停止给出话术，只给风险提示；
 *  - 不判断是否胜任、不给绩效等级、不做员工间比较、不给处分建议。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.TanJixiaoAnalysis = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var MAX_INPUT = 20000;

  var RISK_GROUPS = [
    {
      level: "high",
      label: "劳动关系处置",
      words: ["辞退", "开除", "裁员", "劝退", "解除劳动", "不续签", "降薪", "降级", "扣工资", "停职", "调岗", "末位淘汰", "pip", "绩效改进计划", "自己离职", "让他走"],
      advice: "涉及劳动关系处置。请暂停使用本工具，先与 HR 和法务确认程序与依据，不要在绩效面谈中直接提出。",
    },
    {
      level: "high",
      label: "歧视与骚扰",
      words: ["歧视", "骚扰", "性骚扰", "地域", "性别", "年龄", "婚育", "怀孕", "孕期", "产假", "哺乳", "外貌", "口音", "宗教", "民族"],
      advice: "涉及受保护特征或骚扰情形。这不属于绩效面谈范围，请转 HR/法务按专项流程处理。",
    },
    {
      level: "high",
      label: "安全与健康",
      words: ["工伤", "事故", "受伤", "安全事件", "医疗", "病历", "抑郁症", "精神", "心理疾病", "住院", "病假"],
      advice: "涉及安全或健康信息。请避免在绩效材料中记录医疗细节，转 HR 按相关流程处理。",
    },
    {
      level: "high",
      label: "争议与投诉",
      words: ["劳动仲裁", "仲裁", "诉讼", "起诉", "举报", "投诉", "律师", "赔偿"],
      advice: "已进入或可能进入争议程序。请停止自行沟通，交由 HR/法务对接。",
    },
  ];

  var JUDGMENT_WORDS = [
    "责任心", "态度", "不积极", "不主动", "不靠谱", "能力不行", "能力差", "不胜任", "不适合",
    "敷衍", "不上心", "懒", "情商", "性格", "不专业", "消极", "抱怨", "抵触",
    "缺乏", "没有担当", "不配合", "耍滑", "混日子", "玻璃心", "固执", "自私", "不懂事", "眼界",
  ];

  var FACT_MARKERS = [
    /\d{1,4}\s*年/, /\d{1,2}\s*月/, /\d{1,2}\s*[日号]/, /[上下本]\s*周/, /周[一二三四五六日天]/,
    /\d{1,3}\s*(天|个工作日|小时|分钟|次|人|份|页|个)/, /\d+%/,
    /原定|原计划|计划|承诺|约定|要求|实际|最终|结果/,
    /推迟|延期|延迟|延误|提前|超期|逾期|未完成|没有完成|没交|未提交|迟到|缺席|超预算|返工|不达标/,
  ];

  var EXTERNAL_WORDS = ["设计", "客户", "供应商", "其他部门", "跨部门", "技术", "法务", "财务", "上级", "甲方", "需求变更", "排期", "资源", "预算"];
  var MECHANISM_WORDS = ["约定", "流程", "规则", "机制", "节点", "上报", "同步", "预警", "汇报", "周会", "日报", "复盘"];

  var ORDER = { high: 3, medium: 2, low: 1 };

  function clamp(text) {
    return String(text == null ? "" : text).slice(0, MAX_INPUT);
  }

  function splitClauses(text) {
    return String(text || "")
      .split(/[。！？；\n\r]+/)
      .map(function (item) {
        return item.replace(/^[，,、\s]+/, "").trim();
      })
      .filter(function (item) {
        return item.length >= 4;
      });
  }

  function stripHedges(clause) {
    return clause.replace(/^(我觉得|我认为|感觉|说实话|其实|反正|总的来说|说白了)[，,]?\s*/, "").trim();
  }

  function detectRisks(text) {
    var haystack = String(text || "").toLowerCase();
    var flags = [];
    RISK_GROUPS.forEach(function (group) {
      var hits = group.words.filter(function (word) {
        return haystack.indexOf(word.toLowerCase()) >= 0;
      });
      if (hits.length) {
        flags.push({ level: group.level, label: group.label, terms: hits, advice: group.advice });
      }
    });
    return flags;
  }

  function extractFacts(clauses) {
    var facts = [];
    clauses.forEach(function (clause) {
      var cleaned = stripHedges(clause);
      var isFact = FACT_MARKERS.some(function (pattern) {
        return pattern.test(cleaned);
      });
      if (!isFact) return;
      var exists = facts.some(function (item) {
        return item.text === cleaned;
      });
      if (exists) return;
      facts.push({ text: cleaned, source: "管理者口述" });
    });
    return facts.slice(0, 8);
  }

  function extractJudgments(clauses) {
    var judgments = [];
    clauses.forEach(function (clause) {
      var cleaned = stripHedges(clause);
      var hits = JUDGMENT_WORDS.filter(function (word) {
        return cleaned.indexOf(word) >= 0;
      });
      if (!hits.length) return;
      var exists = judgments.some(function (item) {
        return item.statement === cleaned;
      });
      if (exists) return;
      judgments.push({
        statement: cleaned,
        terms: hits,
        reason:
          "「" + hits.slice(0, 2).join("」「") + "」是在推断动机或性格。目前掌握的是行为与结果，动机需要当面问清楚，不宜作为面谈结论。",
        alternative: "可以改述成可观察的行为：在哪个时间点、没做什么动作、造成了什么可核实的结果。",
      });
    });
    return judgments.slice(0, 6);
  }

  function buildQuestions(payload) {
    var text = payload.text;
    var facts = payload.facts;
    var judgments = payload.judgments;
    var hasExternal = EXTERNAL_WORDS.some(function (word) { return text.indexOf(word) >= 0; });
    var hasMechanism = MECHANISM_WORDS.some(function (word) { return text.indexOf(word) >= 0; });
    var hasDelay = /延期|延迟|推迟|未完成|没有完成|没交|逾期|超期|不达标/.test(text);
    var questions = [];

    if (hasDelay) questions.push("你是什么时候第一次判断可能无法按期完成的？当时掌握的信息是什么？");
    if (hasExternal) {
      var deps = EXTERNAL_WORDS.filter(function (word) { return text.indexOf(word) >= 0; }).slice(0, 3);
      questions.push(deps.join("、") + "这边的情况，当时对你实际工作量的影响有多大？");
    }
    if (judgments.length) questions.push("当时你这么做，是基于哪些考虑？有没有我没看到的信息？");
    if (!hasMechanism) questions.push("我们之前有没有明确约定过：什么情况必须同步风险、在哪个节点同步？");
    if (facts.length < 2) questions.push("这件事的时间线能再帮我理一遍吗？我想把事实部分确认准确。");
    questions.push("如果重来一次，你希望自己在哪个节点做出不一样的判断？");

    var seen = {};
    return questions.filter(function (item) {
      if (seen[item]) return false;
      seen[item] = true;
      return true;
    }).slice(0, 5);
  }

  function buildResponsibilities(payload) {
    var text = payload.text;
    var items = [
      "核实这件事的目标与优先级，在事发当时是否清晰、是否与管理者的要求一致。",
      "检查自己是否提供过必要支持：资源、决策、优先级取舍。",
    ];
    var hasExternal = EXTERNAL_WORDS.some(function (word) { return text.indexOf(word) >= 0; });
    var hasMechanism = MECHANISM_WORDS.some(function (word) { return text.indexOf(word) >= 0; });
    if (hasExternal) items.push("核实跨部门或外部依赖的卡点，确认员工是否有权限推动这些依赖。");
    if (!hasMechanism) items.push("与员工共同建立风险预警路径：什么情况、找谁、多早说。");
    if (payload.judgments.length) items.push("面谈中先听完员工视角，再说明自己的观察，避免用评价性词语开场。");
    return items.slice(0, 5);
  }

  function buildActions(text) {
    var hasDelay = /延期|延迟|推迟|未完成|没有完成|逾期|不达标/.test(text);
    return [
      hasDelay
        ? "出现交付风险时，第一时间同步当前判断、影响范围和备选方案。"
        : "明确下一次同类任务的关键节点与检查方式。",
      "约定同步对象与时间：由谁、在哪个节点、用什么方式告知。",
      "约定复盘时间点，检查这次约定是否真的被执行。",
    ];
  }

  function buildOpening(role, facts) {
    var subject = role ? role + "相关的这件事" : "这件事";
    var anchor = facts.length ? "从时间线看，" + facts[0].text + "。" : "";
    return "我想和你过一下" + subject + "。" + anchor + "我这边看到的情况可能不完整，先听听你的版本。";
  }

  function analyze(input) {
    var role = (input && input.role) || "";
    var story = clamp(input && input.story);
    var goal = clamp(input && input.goal);
    var evidence = clamp(input && input.evidence);
    var text = [story, evidence].filter(Boolean).join("\n");

    var clauses = splitClauses(text);
    var riskFlags = detectRisks(story + "\n" + evidence + "\n" + goal);
    var facts = extractFacts(clauses);
    var judgments = extractJudgments(clauses);
    var questions = buildQuestions({ text: text, facts: facts, judgments: judgments });
    var level = "none";
    riskFlags.forEach(function (item) {
      if ((ORDER[item.level] || 0) > (ORDER[level] || 0)) level = item.level;
    });

    var warnings = [];
    if (!facts.length) warnings.push("没有从描述里提取到可核实的事实。建议补上：原本要求、实际发生、造成的影响、具体时间。");
    if (text.length < 30) warnings.push("描述偏短，提取结果可能不完整。");

    return {
      facts: facts,
      judgmentsToPause: judgments,
      questionsToVerify: questions,
      managerResponsibilities: buildResponsibilities({ text: text, judgments: judgments }),
      conversationOpening: buildOpening(role, facts),
      actionPlan: buildActions(text),
      riskFlags: riskFlags,
      riskLevel: level,
      warnings: warnings,
      engine: "rule-v1",
      generatedAt: new Date().toISOString(),
    };
  }

  return { analyze: analyze, detectRisks: detectRisks };
});

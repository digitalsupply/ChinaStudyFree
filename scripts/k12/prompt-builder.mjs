/**
 * prompt-builder.mjs — K12 知识点出题提示词构造器
 *
 * 目标不是“让模型多出题”，而是让模型在明确的学科边界、认知层级和
 * STEAM 语境约束下出题。提示词分三层：
 *   1. 通用系统约束：K12、准确性、儿童安全、JSON only。
 *   2. 学科画像：该学科的推理方式、题型、常见错误、STEAM 连接点。
 *   3. 单知识点上下文：课标/教材/章节/学习目标/先修/易错点/难度。
 *
 * STEAM 是“真实情境与跨学科能力”的透镜，不是每道题都硬贴标签。
 * 提示词明确要求：只在真正提升真实性时使用，并只标注实际使用的维度。
 */

export const PROMPT_VERSION = "k12-steam-v1";

export const SUBJECT_PROFILES = {
  math: {
    name: "数学",
    role: "小学数学与中学数学教研员、数学建模教练",
    reasoning:
      "数学题必须可验证：计算正确、单位一致、条件充分且不矛盾；应用题情境要真实，不能为套公式而生造。",
    focus: [
      "数感、运算、代数、几何、统计与概率、函数与建模",
      "多表征：文字、表格、图象、符号、几何图形之间的转换",
      "推理与证明：说明为什么，而不仅是算出答案",
      "现实建模：测量、预算、路线、数据、设计约束",
    ],
    steam: [
      "M：定量推理、建模、证明、数据",
      "S：从数据/现象中提出可检验的问题",
      "E：在约束下设计、优化、比较方案",
      "T：用表格/图象/算法/工具处理数据",
      "A：用图形、比例、对称表达设计意图",
    ],
    types: ["choice", "true_false", "fill_blank", "calculation", "fill_blank_text"],
    pitfalls: [
      "不要出“伪应用”：去掉故事后题目仍然完全一样，说明情境没有作用",
      "不要用未定义的变量、单位或近似值",
      "几何题若依赖图形，必须给出可复现的数据或明确图示条件",
    ],
  },
  physics: {
    name: "物理",
    role: "初中/高中物理教研员、实验探究与工程设计教练",
    reasoning:
      "物理题要从现象或实验出发，建立模型，明确变量、单位、条件和误差；计算题必须能复核。",
    focus: [
      "物理观念：力、运动、能量、电、磁、光、热、波",
      "科学探究：变量控制、测量、数据处理、误差分析",
      "科学思维：模型建构、推理、论证、质疑",
      "工程实践：约束、选材、效率、安全、优化",
    ],
    steam: [
      "S：现象观察、假设、实验证据",
      "T：传感器、数据采集、图像处理",
      "E：电路/结构/装置设计，效率与安全约束",
      "M：公式、比例、图像斜率/面积、单位换算",
      "A：实验装置的可读表达与设计说明",
    ],
    types: ["choice", "true_false", "fill_blank", "calculation", "fill_blank_text"],
    pitfalls: [
      "不要忽略“控制变量”前提",
      "图像题先确认横纵轴物理量，再解释斜率/面积的含义，避免把关系说反",
      "题干必须带单位；数值答案只写数值，单位写在题干或解析里",
      "有效数字不作过度要求，但条件、计算与结论不能自相矛盾",
      "不要要求生成真实照片；需要图时用结构化图表/示意图描述",
    ],
  },
  chemistry: {
    name: "化学",
    role: "初中/高中化学教研员、实验安全与微观解释教练",
    reasoning:
      "化学题要同时连接宏观现象、微观解释和符号表达；实验题必须安全、可操作、现象与结论匹配。",
    focus: [
      "宏观—微观—符号三重表征",
      "物质分类、反应、守恒、能量、速率、平衡",
      "实验设计、现象描述、检验与鉴别、安全",
      "真实情境：材料、环境、能源、生活",
    ],
    steam: [
      "S：实验证据、变量控制、现象与结论",
      "T：测量、传感器、数据分析",
      "E：材料/工艺设计、绿色化学、安全约束",
      "M：守恒计算、比例、图像",
      "A：实验报告与可视化表达",
    ],
    types: ["choice", "true_false", "fill_blank", "calculation", "fill_blank_text"],
    pitfalls: [
      "不要给出危险或不可执行的实验操作",
      "不要编造与教材不符的现象或产物",
      "化学式、方程式、条件、状态符号必须准确",
    ],
  },
  biology: {
    name: "生物",
    role: "初中/高中生物教研员、生命观念与证据推理教练",
    reasoning:
      "生物题要围绕结构与功能、系统与平衡、遗传与进化、生态与稳态，用证据支持结论。",
    focus: [
      "结构与功能相适应",
      "系统、稳态、反馈、能量流与物质循环",
      "遗传、变异、进化、实验证据",
      "生态、健康、伦理与可持续",
    ],
    steam: [
      "S：观察、实验、证据、对照",
      "T：显微镜、传感器、数据记录",
      "E：生态/农业/健康方案设计",
      "M：比例、概率、数据图表",
      "A：科学表达与伦理讨论",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: [
      "不要给医疗诊断或健康建议",
      "不要把个体现象直接上升为普遍规律",
      "实验题要有对照与可测指标",
    ],
  },
  science: {
    name: "科学",
    role: "小学/高中科学教研员、探究与工程设计教练",
    reasoning:
      "科学题要从观察和问题出发，区分证据与猜想，鼓励探究和设计，而不是背结论。",
    focus: [
      "观察、提问、假设、实验、证据",
      "物质、生命、地球与宇宙、技术与工程",
      "简单工具、测量、数据记录",
      "安全、合作、环保",
    ],
    steam: [
      "S：探究、证据",
      "T：工具与数据",
      "E：设计与制作",
      "M：测量与比较",
      "A：表达与创意",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: ["不要要求家庭危险实验", "不要把科学结论绝对化", "区分观察与推断"],
  },
  chinese: {
    name: "语文",
    role: "中小学语文教研员、阅读与表达教练",
    reasoning:
      "语文题必须有文本依据，区分事实、推断、评价和表达效果；不能出脱离语境的“套路题”。",
    focus: [
      "字词、句子、段落、篇章",
      "信息提取、推断、概括、鉴赏、评价",
      "语言运用：语境、得体、连贯、修辞",
      "文化理解与真实表达任务",
    ],
    steam: [
      "A：语言表达、审美、文化语境",
      "S：从材料中提出证据与问题",
      "T：媒体、数据、信息辨识",
      "E：写作/栏目/说明书等真实任务设计",
      "M：数据图表阅读与说明",
    ],
    types: ["choice", "true_false", "fill_blank_text", "word_order", "matching"],
    pitfalls: [
      "阅读题必须能在文本中找到依据",
      "不要用“标准答案”压过合理表达",
      "STEAM 不要硬贴，优先用真实阅读/写作/表达任务",
    ],
  },
  english: {
    name: "英语",
    role: "中小学英语教研员、交际任务与语言评估教练",
    reasoning:
      "英语题要服务真实交际，语法与词汇放在语境中考；避免孤立、无意义的机械操练。",
    focus: [
      "听读看、说写、语音、词汇、语法、语篇",
      "交际目的、语境、得体性",
      "文化理解与跨文化比较",
      "真实任务：通知、邮件、介绍、说明",
    ],
    steam: [
      "A：表达、文化、设计",
      "T：数字媒介与信息素养",
      "S：基于材料提出问题",
      "E：任务/产品说明设计",
      "M：数据与图表描述",
    ],
    types: ["choice", "true_false", "fill_blank_text", "word_order", "matching"],
    pitfalls: [
      "不要出没有语境的孤立语法选择",
      "答案必须唯一且符合标准英语",
      "避免文化刻板印象",
    ],
  },
  history: {
    name: "历史",
    role: "初中/高中历史教研员、史料实证与历史解释教练",
    reasoning:
      "历史题要基于史料，区分史实、解释与评价；关注时序、因果、变化与延续，避免单一结论。",
    focus: [
      "时空观念、史料实证、历史解释",
      "政治、经济、文化、科技、社会",
      "比较、因果、延续与变迁",
      "真实情境：技术、制度、生活",
    ],
    steam: [
      "S：史料证据与质疑",
      "T：技术变迁、信息传播",
      "E：工程/城市/制度设计的历史情境",
      "M：人口、经济数据、时间轴",
      "A：历史叙事与表达",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: [
      "不要编造史料或时间",
      "不要把复杂历史简化为单一因果",
      "评价题要给出材料依据",
    ],
  },
  geography: {
    name: "地理",
    role: "初中/高中地理教研员、空间思维与可持续发展教练",
    reasoning:
      "地理题要用地图、数据、区域案例说话，关注空间格局、过程、人地关系和尺度。",
    focus: [
      "地图、经纬网、等高线、气候、水文、地貌",
      "人口、城市、农业、工业、交通、区域发展",
      "人地关系、资源、环境、可持续",
      "地理信息技术与数据",
    ],
    steam: [
      "S：环境证据与系统",
      "T：GIS、遥感、数据",
      "E：区域规划与工程选址",
      "M：比例尺、统计、空间度量",
      "A：地图表达与设计",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: [
      "不要脱离区域尺度",
      "地图题要有可读的图例/数据",
      "不要用刻板印象解释区域差异",
    ],
  },
  moral: {
    name: "道德与法治",
    role: "小学/初中道德与法治教研员、儿童公民教育教练",
    reasoning:
      "题目要基于儿童生活案例，培养规则意识、责任、同理心和法治观念；价值引导要温和、可讨论。",
    focus: [
      "自我、家庭、学校、社区",
      "规则、法律、权利、义务、责任",
      "情绪、交往、安全、网络素养",
      "真实案例与行动方案",
    ],
    steam: [
      "A：表达、共情、价值讨论",
      "S：调查与证据",
      "T：网络与信息素养",
      "E：班级/社区行动设计",
      "M：数据与公平",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: [
      "不要成人化、说教或贴标签",
      "不要涉及敏感政治立场",
      "案例要适龄、安全、可讨论",
    ],
  },
  politics: {
    name: "思想政治",
    role: "高中思想政治教研员、公共说理与公民素养教练",
    reasoning:
      "题目要用真实公共议题和材料，训练概念辨析、证据推理和公共说理；避免口号化和绝对化。",
    focus: [
      "经济、政治、文化、社会、哲学",
      "概念、原理、材料分析、公共参与",
      "法治意识、科学精神、公共参与",
      "真实议题与多角度论证",
    ],
    steam: [
      "S：证据与论证",
      "T：数字治理与信息素养",
      "E：公共方案设计",
      "M：数据与公共政策",
      "A：公共表达与协商",
    ],
    types: ["choice", "true_false", "fill_blank_text", "matching"],
    pitfalls: [
      "不要出敏感政治人物/事件评价",
      "不要用口号代替论证",
      "材料题要给出充分材料",
    ],
  },
  computer: {
    name: "信息技术",
    role: "中小学信息科技教研员、计算思维与数字素养教练",
    reasoning:
      "题目要训练问题分解、抽象、算法、数据、程序和调试，并讨论数字公民与安全。",
    focus: [
      "数据、算法、程序、系统、网络",
      "计算思维、调试、协作",
      "数字素养、安全、伦理",
      "真实任务：自动化、数据处理、作品设计",
    ],
    steam: [
      "T：算法、程序、数据",
      "S：问题分解与验证",
      "E：作品/系统设计",
      "M：逻辑、计数、复杂度直觉",
      "A：界面与表达",
    ],
    types: ["choice", "true_false", "fill_blank_text"],
    pitfalls: [
      "不要考具体软件按钮或版本细节",
      "代码题要给出完整可读的上下文",
      "避免要求真实联网操作",
    ],
  },
  general: {
    name: "通用",
    role: "K12 综合课程教研员",
    reasoning: "题目必须准确、适龄、可评估，并说明与知识点的关系。",
    focus: ["知识理解、应用、分析、表达"],
    steam: ["S", "T", "E", "A", "M"],
    types: ["choice", "true_false", "fill_blank_text"],
    pitfalls: ["不要编造事实", "不要依赖外部资源"],
  },
};

const BASE_SYSTEM = `你是一位中国 K12 课程标准、学科教学与 STEAM 教育专家。
你的任务是依据给定的单一知识点，生成可直接进入题库的高质量题目。

总原则：
1. 准确性优先：不编造事实、数据、史料、实验现象或公式；不确定时使用更保守的表述。
2. 课标与教材一致：题目不得超出给定知识点及其先修范围；高中模块制内容按模块名处理。
3. 适龄与安全：面向儿童和青少年，语言清楚、无歧视、无刻板印象、无隐私信息、无危险操作。
4. 可评估：答案必须唯一、可判定；选择题干扰项要针对真实错误概念，而不是随意拼凑。
5. STEAM 是透镜不是标签：只在真实任务、证据、设计、数据或表达确实需要时使用；
   不要为了“STEAM”给每道题硬套工程/科技情境，也不要虚构跨学科联系。
6. 只输出 JSON，不要 Markdown 代码块，不要解释你的生成过程。`;

function typeRules(types) {
  const set = new Set(types);
  const lines = [];
  if (set.has("choice")) {
    lines.push("- choice：4 个选项；options 不得重复；answer 必须严格等于其中一个选项的完整文本，不能写 A/B/C/D；干扰项要对应常见错误。");
  }
  if (set.has("true_false")) {
    lines.push("- true_false：answer 只能是“对”或“错”；options 必须为空数组；题干必须是可判断的完整陈述。");
  }
  if (set.has("fill_blank")) {
    lines.push("- fill_blank：用于纯数字答案（数字、小数、分数、负数，可用 . / -）；answer 只写数值，不带单位；题干中用 ___ 标空。");
  }
  if (set.has("calculation")) {
    lines.push("- calculation：用于需要计算过程的数值题；answer 只写最终数值；题干中用 ___ 或“？”标空。");
  }
  if (set.has("fill_blank_text")) {
    lines.push("- fill_blank_text：用于文字、单位、表达式、不等式、化学式等非纯数字答案；answer 写标准答案文本；题干中用 ___ 标空。");
  }
  if (set.has("word_order")) {
    lines.push("- word_order：options 为 2-6 个词/短语；answer 为用英文逗号连接的完整顺序，且词集合必须与 options 完全一致。");
  }
  if (set.has("matching")) {
    lines.push("- matching：options 固定 8 项（前 4 项为左列 A-D，后 4 项为右列 1-4）；answer 形如 A-1,B-2,C-3,D-4。");
  }
  return lines.join("\n");
}

function fmtList(items, fallback = "（无，按知识点和教材章节合理推断，但不得超纲）") {
  if (!Array.isArray(items) || items.length === 0) return fallback;
  return items.map(x => `  - ${x}`).join("\n");
}

function fmtTextbooks(textbooks) {
  if (!Array.isArray(textbooks) || textbooks.length === 0) return "（未提供教材信息）";
  return textbooks
    .slice(0, 3)
    .map(t => {
      const path = (t.chapterPath || []).join(" / ");
      return `  - ${t.title || "未命名教材"}${t.grade ? `（${t.grade}）` : ""}${t.volume ? ` ${t.volume}` : ""}${path ? `：${path}` : ""}`;
    })
    .join("\n");
}

function difficultyGuidance(count, target) {
  if (target) return `目标难度：${target}（1=识记，2=理解，3=应用，4=分析，5=迁移/综合）`;
  if (count <= 2) return "难度：至少 1 道 3 级，1 道 4 级。";
  if (count <= 4) return "难度：1 级 1 道、2 级 1 道、3 级 1 道、4 级 1 道；可把其中 1 道替换为 5 级。";
  return "难度：1 级 1 道、2 级 1 道、3 级 2 道、4 级 1 道、5 级 1 道（可按题目数微调）；必须至少有 1 道 4 级或以上。";
}

export function buildQuestionPrompt(kp, options = {}) {
  const profile = SUBJECT_PROFILES[kp.subjectId] || SUBJECT_PROFILES.general;
  const count = Math.max(1, Number(options.count || 5));
  const types = options.types?.length ? options.types : profile.types;
  const gradeText =
    (kp.grades || []).join("、") ||
    (kp.textbooks || []).map(t => t.grade).filter(Boolean).slice(0, 1).join("、") ||
    (kp.stage === "high" ? "高中（按教材模块）" : kp.gradeBand);
  const difficulty = options.difficulty || difficultyGuidance(count, options.targetDifficulty);

  const schema = {
    questions: [
      {
        id: 1,
        type: "choice",
        score: 5,
        difficulty: 3,
        knowledge_point: kp.canonicalName,
        question: "题干（含必要的数据、单位、语境）",
        options: ["选项A", "选项B", "选项C", "选项D"],
        answer: "选项A",
        explanation: "说明为什么，并点出对应知识点/易错点，至少 30 字。",
        meta: {
          cognitive_level: "理解",
          steam_dimensions: ["S", "M"],
          steam_context: "这道题真实使用了什么情境/能力；没有就写“学科内核心概念”。",
          misconception_target: "针对哪个常见错误；没有就写“无”。",
          figure: null,
          resource_needs: ["formula"],
        },
      },
    ],
  };

  const user = `【知识点】
学段：${kp.gradeBand || kp.stage}
年级：${gradeText}
学科：${profile.name}
教材：\n${fmtTextbooks(kp.textbooks)}
章节：${(kp.textbooks?.[0]?.chapterPath || []).join(" / ") || "（未提供）"}
知识点：${kp.canonicalName}
别名：${(kp.aliases || []).join("、") || "（无）"}
知识点类型：${kp.knowledgeType || "未标注"}
知识点难度：${kp.difficultyBand ?? "未标注"} / 5（原始难度 ${kp.difficulty01 ?? "未标注"}）
可评估性：${kp.assessability ?? "未标注"}

【学习目标】
${fmtList(kp.learningObjectives)}

【先修知识】
${fmtList(kp.prerequisites)}

【常见错误 / 迷思】
${fmtList(kp.misconceptions)}

【生成任务】
请围绕上面这一个知识点生成 ${count} 道题，不要扩展到其他知识点。
${difficulty}
题型允许：${types.join(", ")}。
${typeRules(types)}

【学科要求】
${profile.reasoning}
重点：${profile.focus.map(x => `\n  - ${x}`).join("")}
常见陷阱：${profile.pitfalls.map(x => `\n  - ${x}`).join("")}
STEAM 可用连接点（只在真实需要时使用，不要硬套）：
${profile.steam.map(x => `  - ${x}`).join("\n")}

【STEAM 与真实情境】
- 至少 1 道题使用真实、可理解的情境（校园/家庭/社区/工程/数据/材料/环境等），但情境必须服务于知识点，不能只是“换皮”。
- 只有真正使用了某个维度才在 steam_dimensions 中标注；没有就写空数组 []。
- 人文学科不要强行加入工程/科技情境；可用数据阅读、真实表达、设计说明、公共说理等自然连接。
- 不允许要求外部图片、视频、网页或真实实验器材；需要图表/表格/示意图时，用 meta.figure 的结构化描述表达。

【质量红线】
- 选择题：answer 必须与某个 option 完全一致；options 不得重复；不要“以上都对/都不对”。
- 判断题：answer 只能是“对”或“错”；options 为空。
- 数值填空/计算：answer 只写数值；带单位或中文的答案改用 fill_blank_text。
- 解析：至少 30 个汉字，必须说明依据，不能只写“因为公式”。
- 不得出现两个正确答案、歧义条件、超纲知识或无法从题干推出的答案。
- 不要生成与题干无关的“STEAM 标签”。
- 题目语言用简体中文；英语学科题干可中英混排，但指令和解析用中文。
- 公式用 LaTeX：行内 $...$；不要依赖图片。化学式用标准写法。

【输出 JSON】
严格输出以下结构，不要额外字段，不要 Markdown：
${JSON.stringify(schema, null, 2)}

注意：上面的 schema 只是字段示例；请按题目数量生成对应数量的对象。`;

  return {
    version: PROMPT_VERSION,
    system: BASE_SYSTEM,
    user,
    meta: {
      sourceKpId: kp.id,
      sourceKpName: kp.canonicalName,
      stage: kp.stage,
      subjectId: kp.subjectId,
      gradeBand: kp.gradeBand,
      count,
      types,
      promptVersion: PROMPT_VERSION,
    },
  };
}

export function buildBatchPrompt(kps, options = {}) {
  return kps.map(kp => buildQuestionPrompt(kp, options));
}

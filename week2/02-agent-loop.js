/**
 * Week 2 / Day 10-14：Agent Loop + 多步任务编排
 *
 * 核心概念：
 *   真正的 Agent 是一个「循环」，不是一次调用。
 *   循环逻辑：
 *     while (true) {
 *       调用模型
 *       if (finish_reason === "tool_calls") → 执行工具，继续循环
 *       if (finish_reason === "stop")       → 模型给出最终答案，退出
 *     }
 *
 *   这就是著名的 ReAct 模式（Reasoning + Acting）：
 *     Reason：模型思考下一步做什么
 *     Act：执行工具
 *     Observe：观察结果
 *     ... 循环直到完成目标
 *
 * 本文件实现：
 *   - 通用 Agent Loop 函数（可复用）
 *   - 5个小红书创作工具
 *   - 2个完整演示：简单任务 + 复杂多步任务
 *
 * 运行方式：
 *   cd llm-demo
 *   node week2/02-agent-loop.js
 */

import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─────────────────────────────────────────────────────────────
// 工具实现
// ─────────────────────────────────────────────────────────────

/** 工具 1：获取热门话题（模拟数据，实际可接真实 API） */
function get_trending_topics({ category = "通用" }) {
  const topics = {
    秋天: ["秋日氛围感", "秋天第一杯奶茶", "秋日穿搭", "红叶打卡", "秋天限定"],
    咖啡: ["手冲咖啡", "咖啡馆探店", "拿铁艺术", "咖啡因依赖", "cafe打卡"],
    穿搭: ["显瘦穿搭", "秋冬叠穿", "通勤穿搭", "氛围感穿搭", "平价好物"],
    美食: ["探店打卡", "好吃不贵", "家常菜", "下午茶", "网红食物"],
    通用: ["日常记录", "生活随笔", "好物分享", "打卡", "种草"],
  };

  // 尝试匹配分类，找不到就用通用
  const matchedCategory =
    Object.keys(topics).find((k) => category.includes(k)) || "通用";
  const result = topics[matchedCategory];

  return { category: matchedCategory, topics: result, count: result.length };
}

/** 工具 2：生成标题候选（基于主题和风格） */
function generate_title_candidates({ topic, style = "通用", count = 3 }) {
  // 真实场景中这里应该调 LLM 子任务，这里用模板模拟
  const styleTemplates = {
    情感: [
      `${topic}，一个人也可以很美好`,
      `第一次${topic}，我哭了`,
      `关于${topic}的那个下午，我想记录下来`,
    ],
    干货: [
      `${topic}完全攻略，建议收藏！`,
      `${topic}避坑指南，踩雷后总结的经验`,
      `${topic}推荐清单，每款都亲测！`,
    ],
    通用: [
      `${topic}｜超治愈的一次体验✨`,
      `终于找到宝藏${topic}！强烈推荐🌟`,
      `${topic}打卡记录，氛围感满满🍂`,
    ],
  };

  const templates = styleTemplates[style] || styleTemplates["通用"];
  return {
    topic,
    style,
    candidates: templates.slice(0, count),
  };
}

/** 工具 3：统计字符数 */
function count_characters({ text }) {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const total = [...text].length; // 用扩展运算符正确处理 emoji
  return {
    total,
    chinese,
    is_within_limit: total <= 300,
    suggestion: total > 300 ? `超出 ${total - 300} 字，建议删减` : "字数合适",
  };
}

/** 工具 4：生成标签 */
function generate_hashtags({ topic, trending_topics = [] }) {
  const baseTags = [topic, `${topic}推荐`, `${topic}打卡`];
  const trendTags = trending_topics.slice(0, 3);
  const platformTags = ["小红书", "好物分享", "生活记录"];
  const allTags = [...new Set([...baseTags, ...trendTags, ...platformTags])];
  return {
    hashtags: allTags.map((t) => `#${t}`),
    count: allTags.length,
    formatted: allTags.map((t) => `#${t}`).join(" "),
  };
}

/** 工具 5：生成正文 */
function generate_body({ title, topic, reference_topics = [], word_limit = 300 }) {
  // 真实场景这里调 LLM；这里用模板演示结构
  const body = `最近迷上了${topic}，忍不住来分享一下~

上周终于找到机会去体验了一下，整体感受真的超出预期！

首先说说${topic}的氛围，真的很治愈。坐在那里的时候感觉整个人都放松了，推荐大家有机会一定要去试试。

${reference_topics.length > 0 ? `最近 ${reference_topics[0]} 话题超热，趁着这波去打卡真的很合适！` : ""}

总结一下体验感受：
✅ 氛围感：满分
✅ 性价比：很高
✅ 适合：一个人/闺蜜/情侣

有想去的朋友可以评论区找我取攻略，比心❤️`;

  return {
    body: body.slice(0, word_limit),
    word_count: [...body].length,
    title_used: title,
  };
}

// ─────────────────────────────────────────────────────────────
// 工具定义（JSON Schema）
// ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_trending_topics",
      description: "获取当前小红书平台上某个分类的热门话题标签列表，用于创作时蹭热点",
      parameters: {
        type: "object",
        properties: {
          category: { type: "string", description: "话题分类，如：秋天、咖啡、穿搭、美食" },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_title_candidates",
      description: "根据主题和风格生成多个标题候选，供选择最优标题",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "内容主题，如：秋天咖啡馆" },
          style: {
            type: "string",
            enum: ["情感", "干货", "通用"],
            description: "标题风格：情感（共鸣型）/ 干货（攻略型）/ 通用",
          },
          count: { type: "number", description: "生成标题数量，默认3个" },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_characters",
      description: "统计文本字符数，检查是否符合小红书字数要求（建议300字以内）",
      parameters: {
        type: "object",
        properties: {
          text: { type: "string", description: "需要统计字符数的文本" },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_hashtags",
      description: "根据主题和热门话题生成适合小红书的话题标签",
      parameters: {
        type: "object",
        properties: {
          topic: { type: "string", description: "内容主题" },
          trending_topics: {
            type: "array",
            items: { type: "string" },
            description: "热门话题列表（可选，由 get_trending_topics 获取）",
          },
        },
        required: ["topic"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "generate_body",
      description: "根据标题和主题生成小红书正文内容",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string", description: "选定的标题" },
          topic: { type: "string", description: "内容主题" },
          reference_topics: {
            type: "array",
            items: { type: "string" },
            description: "参考的热门话题（可选）",
          },
          word_limit: { type: "number", description: "字数限制，默认300" },
        },
        required: ["title", "topic"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 工具调度器
// ─────────────────────────────────────────────────────────────

function executeTool(toolName, toolArgs) {
  const toolMap = {
    get_trending_topics,
    generate_title_candidates,
    count_characters,
    generate_hashtags,
    generate_body,
  };

  const fn = toolMap[toolName];
  if (!fn) throw new Error(`未知工具: ${toolName}`);
  return fn(toolArgs);
}

// ─────────────────────────────────────────────────────────────
// ★ 核心：通用 Agent Loop
//
// 这是整个 Agent 系统的心脏，把它背下来：
//   1. 发请求给模型（带工具定义）
//   2. 如果模型要调工具 → 执行工具 → 把结果追加到历史 → 回到 1
//   3. 如果模型给最终答案 → 返回
// ─────────────────────────────────────────────────────────────

async function runAgentLoop(systemPrompt, userRequest, tools = TOOLS, maxSteps = 10) {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`🎯 任务: ${userRequest}`);
  console.log(`${"═".repeat(65)}`);

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userRequest },
  ];

  let step = 0;
  let totalTokens = 0;

  // ── Agent Loop 开始 ──
  while (step < maxSteps) {
    step++;
    console.log(`\n[Step ${step}] 调用模型...`);

    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools,
      tool_choice: "auto",
    });

    const choice = response.choices[0];
    totalTokens += response.usage.total_tokens;

    console.log(`[Step ${step}] finish_reason: "${choice.finish_reason}"`);

    // ── 情况 A：模型给出最终答案，退出循环 ──
    if (choice.finish_reason === "stop") {
      console.log(`\n✅ Agent 完成！共执行 ${step} 步，消耗 ${totalTokens} tokens`);
      console.log(`\n${"─".repeat(65)}`);
      console.log("📄 最终输出:");
      console.log(`${"─".repeat(65)}`);
      console.log(choice.message.content);
      return choice.message.content;
    }

    // ── 情况 B：模型要调用工具 ──
    if (choice.finish_reason === "tool_calls") {
      const toolCalls = choice.message.tool_calls;
      console.log(`[Step ${step}] 模型决定调用 ${toolCalls.length} 个工具:`);

      // 把模型的工具调用请求加入历史
      messages.push(choice.message);

      // 执行每个工具
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function.name;
        const toolArgs = JSON.parse(toolCall.function.arguments);

        console.log(`   🔧 调用: ${toolName}(${JSON.stringify(toolArgs)})`);
        const result = executeTool(toolName, toolArgs);
        console.log(`   ✅ 结果: ${JSON.stringify(result).slice(0, 100)}...`);

        // 把工具结果加入历史
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      // 继续循环，让模型根据工具结果决定下一步
      continue;
    }

    // ── 情况 C：异常情况 ──
    console.warn(`[Step ${step}] 未预期的 finish_reason: ${choice.finish_reason}`);
    break;
  }

  console.warn(`⚠️  达到最大步数限制 (${maxSteps})`);
}

// ─────────────────────────────────────────────────────────────
// 演示 1：简单任务（模型可能只需 1-2 步）
// ─────────────────────────────────────────────────────────────

async function demo1_simpleTask() {
  console.log("\n\n【演示 1】简单任务 - 查热门话题");
  console.log("预期：模型调用 get_trending_topics → 生成推荐");

  const systemPrompt = `你是一名专业的小红书内容创作顾问。
利用提供的工具帮助用户创作高质量的小红书内容。
每次回答要具体、实用，给出清晰的建议。`;

  await runAgentLoop(systemPrompt, "秋天适合发哪些类型的小红书？帮我找找热门话题");
}

// ─────────────────────────────────────────────────────────────
// 演示 2：复杂多步任务（模型需要多步工具调用才能完成）
// ─────────────────────────────────────────────────────────────

async function demo2_multiStepTask() {
  console.log("\n\n【演示 2】多步任务 - 完整创作流程");
  console.log("预期：模型自主规划并执行：获取热门话题 → 生成标题 → 生成正文 → 生成标签 → 统计字数 → 汇总");

  const systemPrompt = `你是一名专业的小红书内容创作顾问，负责帮用户完成完整的内容创作。

工作流程（每次创作都必须按这个流程）：
1. 先用 get_trending_topics 获取相关热门话题
2. 再用 generate_title_candidates 生成标题候选（生成情感风格的）
3. 选最好的标题，用 generate_body 生成正文
4. 用 count_characters 检查正文字数
5. 用 generate_hashtags 生成话题标签（带上热门话题）
6. 最终整合所有内容，以标准格式输出

输出格式：
---
📝 标题：[选定的标题]

📖 正文：
[正文内容]

🏷️ 标签：
[所有标签]

📊 字数：[字数] 字
---`;

  await runAgentLoop(
    systemPrompt,
    "帮我写一篇关于「秋天第一次去咖啡馆独处」的小红书，需要完整的标题+正文+标签"
  );
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Week 2 / Day 10-14：Agent Loop + 多步任务编排");
  console.log("\n核心要领：Agent = 循环 + 工具 + 终止条件");
  console.log("while (没完成) { 思考 → 行动 → 观察结果 }");

  try {
    await demo1_simpleTask();
    await demo2_multiStepTask();

    console.log("\n\n✅ Week 2 全部完成！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎯 Week 2 里程碑回顾：");
    console.log("   ✅ Day 8-9：理解 Tool Calling 协议（3步：定义→选择→执行）");
    console.log("   ✅ Day 10-14：实现 Agent Loop（循环 + 多工具 + 自主规划）");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n📚 Week 2 总结 - 你现在应该能回答：");
    console.log("  Q: Tool Calling 和直接让模型生成有什么本质区别？");
    console.log("     → Tool Calling 让模型能调用真实系统（搜索/数据库/API）");
    console.log("  Q: finish_reason='tool_calls' 和 'stop' 分别意味着什么？");
    console.log("     → tool_calls=还在工作中, stop=任务完成");
    console.log("  Q: 为什么需要循环而不是一次调用？");
    console.log("     → 复杂任务需要多步推理，每步结果影响下一步决策");
    console.log("  Q: tool_call_id 有什么用？");
    console.log("     → 当模型同时调用多个工具时，用来对应哪个结果属于哪个调用");
    console.log("\n⏭️  进入 Week 3：RAG → week3/01-rag.js");
    console.log("   你将学习：让 Agent 能读懂你的私有文档，基于真实内容创作");
  } catch (error) {
    console.error("❌ 出错：", error.message);
  }
}

main();

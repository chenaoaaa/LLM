
/**
 * Week 2 / Day 8-9：Tool Calling 协议详解
 *
 * 核心概念：
 *   Tool Calling 不是模型"直接执行代码"，而是一个 3 步协议：
 *   Step 1 → 你告诉模型"有哪些工具可用（函数签名）"
 *   Step 2 → 模型决定"我要调用哪个工具，参数是什么"（只是文字描述，不执行）
 *   Step 3 → 你的代码真正执行工具，把结果交还给模型
 *   Step 4 → 模型根据工具结果生成最终回答
 *
 * 本文件实现 3 个实验：
 *   实验 1 - 最简单的工具：当前时间（无参数）
 *   实验 2 - 带参数的工具：字符统计
 *   实验 3 - 多工具可选：模型自主决定调哪个
 *
 * 运行方式：
 *   cd llm-demo
 *   node week2/01-tool-calling.js
 */

import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─────────────────────────────────────────────────────────────
// 工具实现（真正执行的代码，和 LLM 无关）
// ─────────────────────────────────────────────────────────────

/** 获取当前时间 */
function get_current_time() {
  const now = new Date();
  return {
    datetime: now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
    timestamp: now.getTime(),
    weekday: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][now.getDay()],
  };
}

/** 统计文本字符数 */
function count_characters({ text }) {
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const total = text.length;
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return { total, chinese, english_words: words - chinese, text_preview: text.slice(0, 30) };
}

/** 格式化小红书标签 */
function format_hashtags({ keywords }) {
  const tags = keywords.map((k) => `#${k.trim()}`);
  return { hashtags: tags, count: tags.length, formatted: tags.join(" ") };
}

// ─────────────────────────────────────────────────────────────
// 工具定义（告诉模型有哪些工具可用，用 JSON Schema 描述）
// ─────────────────────────────────────────────────────────────

const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_current_time",
      description: "获取当前的日期和时间，以及今天是星期几",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "count_characters",
      description: "统计一段文本的字符数，包括总字数、中文字数",
      parameters: {
        type: "object",
        properties: {
          text: {
            type: "string",
            description: "需要统计字符数的文本内容",
          },
        },
        required: ["text"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "format_hashtags",
      description: "将关键词列表格式化为小红书话题标签（#格式）",
      parameters: {
        type: "object",
        properties: {
          keywords: {
            type: "array",
            items: { type: "string" },
            description: "关键词列表，每个元素是一个关键词",
          },
        },
        required: ["keywords"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 工具调度器（根据模型返回的工具名，调用对应的函数）
// ─────────────────────────────────────────────────────────────

function executeTool(toolName, toolArgs) {
  const toolMap = {
    get_current_time,
    count_characters,
    format_hashtags,
  };

  const fn = toolMap[toolName];
  if (!fn) throw new Error(`未知工具: ${toolName}`);

  const result = fn(toolArgs);
  console.log(`   🔧 执行工具 [${toolName}]`);
  console.log(`   📥 参数: ${JSON.stringify(toolArgs)}`);
  console.log(`   📤 结果: ${JSON.stringify(result)}`);
  return result;
}

// ─────────────────────────────────────────────────────────────
// 核心：带工具调用的单轮对话
//
// 关键知识：
//   当模型想调用工具时，response.choices[0].finish_reason === "tool_calls"
//   工具调用信息在 response.choices[0].message.tool_calls 里
//   执行完工具后，需要把结果以 role:"tool" 的形式追加到 messages，再次调用模型
// ─────────────────────────────────────────────────────────────

async function askWithTools(userQuestion, availableTools = TOOLS) {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`❓ 用户问题: ${userQuestion}`);
  console.log(`${"═".repeat(60)}`);

  const messages = [
    {
      role: "system",
      content: "你是一个小红书内容创作助手，擅长利用工具完成创作任务。",
    },
    { role: "user", content: userQuestion },
  ];

  // ── Step 1: 第一次调用，告诉模型有哪些工具 ──
  console.log("\n⬆️  Step 1: 发送问题 + 工具定义给模型...");
  const response1 = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    tools: availableTools,
    tool_choice: "auto", // 让模型自己决定要不要用工具
  });

  const choice1 = response1.choices[0];
  console.log(`   finish_reason: "${choice1.finish_reason}"`);

  // ── Step 2: 检查模型是否要调用工具 ──
  if (choice1.finish_reason !== "tool_calls") {
    // 模型认为不需要工具，直接回答
    console.log("\n💡 模型判断：不需要工具，直接回答");
    console.log(`\n✅ 最终回答:\n${choice1.message.content}`);
    return choice1.message.content;
  }

  // 模型要调用工具
  const toolCalls = choice1.message.tool_calls;
  console.log(`\n🤖 模型判断：需要调用 ${toolCalls.length} 个工具`);

  // 把模型的"工具调用请求"追加到消息历史
  messages.push(choice1.message);

  // ── Step 3: 执行工具，把结果追加到消息历史 ──
  console.log("\n⚙️  Step 3: 执行工具...");
  for (const toolCall of toolCalls) {
    const toolName = toolCall.function.name;
    const toolArgs = JSON.parse(toolCall.function.arguments);

    const toolResult = executeTool(toolName, toolArgs);

    // 关键：工具结果必须用 role:"tool" 追加，且要带上 tool_call_id
    messages.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(toolResult),
    });
  }

  // ── Step 4: 带工具结果再次调用模型，生成最终回答 ──
  console.log("\n⬆️  Step 4: 把工具结果交还给模型，生成最终回答...");
  const response2 = await client.chat.completions.create({
    model: "deepseek-chat",
    messages, // 包含了完整历史 + 工具结果
  });

  const finalAnswer = response2.choices[0].message.content;
  console.log(`\n✅ 最终回答:\n${finalAnswer}`);
  console.log(
    `\n📊 总 token 消耗: ${response1.usage.total_tokens + response2.usage.total_tokens}`
  );

  return finalAnswer;
}

// ─────────────────────────────────────────────────────────────
// 实验 1：只用一个工具（获取时间）
// ─────────────────────────────────────────────────────────────

async function experiment1_singleTool() {
  console.log("\n\n【实验 1】单工具调用 - 获取当前时间");
  console.log("观察：模型会自动识别需要时间信息，调用 get_current_time 工具");

  await askWithTools("现在是什么时间？今天适合发小红书吗？", [TOOLS[0]]);
}

// ─────────────────────────────────────────────────────────────
// 实验 2：带参数的工具（字符统计）
// ─────────────────────────────────────────────────────────────

async function experiment2_toolWithParams() {
  console.log("\n\n【实验 2】带参数的工具 - 字符统计");
  console.log("观察：模型需要从你的问题中提取「text」参数传给工具");

  await askWithTools(
    "帮我统计一下这段文字的字数：「秋风起，咖啡香，一个人的午后时光，阳光透过玻璃打在拿铁上，这一刻好满足」",
    [TOOLS[1]]
  );
}

// ─────────────────────────────────────────────────────────────
// 实验 3：多工具可选，模型自主决定
// ─────────────────────────────────────────────────────────────

async function experiment3_multiToolChoice() {
  console.log("\n\n【实验 3】多工具可选 - 模型自主决定调哪个");
  console.log("观察：给模型3个工具，看它根据问题选择调用哪个（或哪几个）");

  // 问关于标签的问题 → 模型应该调 format_hashtags
  await askWithTools(
    "我写了一篇关于秋天咖啡馆的小红书，关键词有：秋日、咖啡馆、独处时光、打卡、拿铁。帮我格式化成标签",
    TOOLS
  );
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 Week 2 / Day 8-9：Tool Calling 协议详解");
  console.log("核心要领：Tool Calling 是「协议」，不是「执行」\n");
  console.log("完整流程：");
  console.log("  你 → [问题+工具定义] → 模型");
  console.log("  模型 → [我要调用哪个工具，参数是什么] → 你");
  console.log("  你 → [真正执行工具，拿到结果] → 模型");
  console.log("  模型 → [根据结果生成最终回答] → 你\n");

  try {
    await experiment1_singleTool();
    await experiment2_toolWithParams();
    await experiment3_multiToolChoice();

    console.log("\n\n✅ Day 8-9 全部完成！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📚 核心知识回顾：");
    console.log("  1. 工具定义（tools 参数）= 告诉模型有什么能力");
    console.log("  2. finish_reason='tool_calls' = 模型要调用工具");
    console.log("  3. 执行完工具后，用 role:'tool' + tool_call_id 把结果交还");
    console.log("  4. 模型「选择工具」的依据是工具的 description，要写清楚！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("📝 思考题：");
    console.log("  Q1: 如果工具执行失败，应该怎么处理？（把错误信息也交还给模型？）");
    // 03-tool-error-handling.js
    console.log("  Q2: description 写得不清楚会怎样？（模型可能调错工具）");
    console.log("  Q3: 可以同时调用多个工具吗？（看实验3的 tool_calls 数组长度）");
    console.log("\n⏭️  进入 Day 10-14：Agent Loop → week2/02-agent-loop.js");
    console.log("   你将学习：多步推理 + 模型自主决定何时停止");
  } catch (error) {
    console.error("❌ 出错：", error.message);
  }
}

main();

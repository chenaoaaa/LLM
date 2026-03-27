// 工具执行失败
//      │
//      ├─ 这个工具对结果不关键？
//      │   └─ FALLBACK：换兜底数据，模型无感知，任务继续
//      │
//      ├─ 模型可以绕过这步继续？
//      │   └─ REPORT ★：把错误 JSON 写进 role:"tool"，
//      │                  模型自己决定怎么办（最常用）
//      │
//      └─ 绝对不能带错误继续？（支付/发消息/写DB）
//          └─ ABORT：throw CriticalToolError，任务整个终止
/**
 * Week 2 / 补充：工具执行失败的处理策略
 *
 * 核心原则：
 *   失败信息「必须」也交还给模型（role:"tool"），不能吞掉！
 *   原因：模型不知道你的工具失败了，如果你不告诉它，
 *         它会基于空数据继续生成 → 产生幻觉。
 *
 * 三种策略：
 *   策略 1 FALLBACK（降级）  → 失败时用兜底数据，模型无感知，任务继续
 *   策略 2 REPORT（上报）    → 把错误告诉模型，让模型自己决定下一步 ★ 最常用
 *   策略 3 ABORT（终止）     → 关键工具失败，整个任务必须停止
 *
 * 运行方式：
 *   cd llm-demo
 *   node week2/03-tool-error-handling.js
 */

import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─────────────────────────────────────────────────────────────
// 模拟一个「不稳定的工具」（约 60% 概率失败）
// 真实场景：网络超时 / 第三方 API 限流 / 数据库连接断开
// ─────────────────────────────────────────────────────────────

function unstable_search({ query }) {
  if (Math.random() < 0.6) {
    throw new Error(`搜索服务超时：无法连接到搜索 API（query="${query}"）`);
  }
  return {
    query,
    results: [`"${query}" 相关热门内容1`, `"${query}" 相关热门内容2`],
    count: 2,
  };
}

// 工具定义
const SEARCH_TOOL = [
  {
    type: "function",
    function: {
      name: "unstable_search",
      description: "搜索小红书相关热门内容（注意：该服务偶尔不稳定）",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "搜索关键词" },
        },
        required: ["query"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────
// 工具失败处理的三种策略封装
// ─────────────────────────────────────────────────────────────

/**
 * 策略 2 辅助函数：把错误格式化成 role:"tool" 可用的字符串
 * 模型收到这条消息后，通常会：
 *   - 跳过依赖该工具的步骤
 *   - 基于自身知识继续回答
 *   - 或告知用户该功能暂不可用
 */
function buildToolErrorResult(toolName, error) {
  return JSON.stringify({
    error: true,
    tool: toolName,
    message: `工具执行失败: ${error.message}`,
    suggestion: "请基于现有信息继续完成任务，或告知用户该功能暂时不可用",
  });
}

/**
 * 策略 3 专用错误类：用于区分「关键工具失败」和普通错误
 */
class CriticalToolError extends Error {
  constructor(toolName, originalError) {
    super(`关键工具 [${toolName}] 执行失败，任务终止: ${originalError.message}`);
    this.name = "CriticalToolError";
    this.toolName = toolName;
    this.originalError = originalError;
  }
}

// ─────────────────────────────────────────────────────────────
// 通用工具执行器（支持三种策略）
//
// strategy: "fallback" | "report" | "abort"
// fallbackData: 策略 1 时的兜底数据
// ─────────────────────────────────────────────────────────────

function safeExecuteTool(toolName, toolFn, toolArgs, strategy = "report", fallbackData = null) {
  try {
    const result = toolFn(toolArgs);
    return { success: true, content: JSON.stringify(result) };
  } catch (error) {
    console.log(`   ❌ 工具 [${toolName}] 执行失败: ${error.message}`);

    switch (strategy) {
      case "fallback":
        // 策略 1：用兜底数据，模型不感知失败
        console.log(`   🔄 FALLBACK：使用兜底数据继续`);
        return { success: false, content: JSON.stringify({ ...fallbackData, _source: "fallback" }) };

      case "report":
        // 策略 2：把错误告诉模型，让模型自主处理（★ 最常用）
        console.log(`   📢 REPORT：将错误上报给模型`);
        return { success: false, content: buildToolErrorResult(toolName, error) };

      case "abort":
        // 策略 3：抛出关键错误，终止整个任务
        console.log(`   🛑 ABORT：关键工具失败，终止任务`);
        throw new CriticalToolError(toolName, error);

      default:
        throw error;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 通用 Agent 单轮（带工具调用，可配置失败策略）
// ─────────────────────────────────────────────────────────────

async function runWithStrategy(label, userQuestion, strategy, fallbackData = null) {
  console.log(`\n${"─".repeat(62)}`);
  console.log(`📌 ${label}`);
  console.log(`   策略: ${strategy.toUpperCase()}`);
  console.log(`${"─".repeat(62)}`);

  const messages = [
    {
      role: "system",
      content:
        "你是小红书内容创作助手。如果搜索工具失败，请基于自身知识完成任务，并简短说明搜索不可用。",
    },
    { role: "user", content: userQuestion },
  ];

  try {
    // Step 1：第一次调模型，告知工具
    const r1 = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      tools: SEARCH_TOOL,
      tool_choice: "auto",
    });

    const choice = r1.choices[0];

    if (choice.finish_reason !== "tool_calls") {
      console.log(`✅ 模型直接回答（未使用工具）:\n   ${choice.message.content.slice(0, 100)}...`);
      return;
    }

    // Step 2：执行工具（带失败策略）
    messages.push(choice.message);

    for (const tc of choice.message.tool_calls) {
      const toolArgs = JSON.parse(tc.function.arguments);
      console.log(`   🔧 模型请求调用: ${tc.function.name}(${JSON.stringify(toolArgs)})`);

      const { content } = safeExecuteTool(
        tc.function.name,
        unstable_search,
        toolArgs,
        strategy,
        fallbackData
      );

      messages.push({ role: "tool", tool_call_id: tc.id, content });
    }

    // Step 3：带工具结果再次调模型
    const r2 = await client.chat.completions.create({ model: "deepseek-chat", messages });

    console.log(`✅ 模型最终回答:\n   ${r2.choices[0].message.content.slice(0, 150)}...`);
    console.log(`   总 tokens: ${r1.usage.total_tokens + r2.usage.total_tokens}`);
  } catch (err) {
    if (err instanceof CriticalToolError) {
      console.log(`🛑 任务被终止: ${err.message}`);
      console.log(`   适用场景: 支付工具失败 / 消息发送失败 / 写数据库失败`);
    } else {
      console.error(`❌ 未预期错误: ${err.message}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// 演示：三种策略各跑 2 次（因为工具随机失败，多跑几次能看到失败场景）
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log("🚀 工具执行失败处理：三种策略对比");
  console.log("工具有 60% 概率失败，多跑几次可以看到不同场景\n");

  console.log("╔══════════════════════════════════════════════════════════╗");
  console.log("║  三种策略速查表                                           ║");
  console.log("╠══════════════════════════════════════════════════════════╣");
  console.log("║  FALLBACK  失败→兜底数据，模型无感知      非关键工具       ║");
  console.log("║  REPORT ★  失败→告知模型，模型自处理      大多数场景       ║");
  console.log("║  ABORT     失败→终止任务                  关键工具         ║");
  console.log("╚══════════════════════════════════════════════════════════╝");

  const question = "帮我搜索秋天咖啡馆相关的热门话题，用来写小红书";

  try {
    // ── 策略 1：FALLBACK ──
    console.log("\n\n【策略 1】FALLBACK（降级）");
    console.log("失败时使用兜底数据，模型感知不到失败，任务继续正常进行");

    const fallback = { results: ["秋日限定拿铁", "咖啡馆氛围感", "独处时光"], count: 3 };
    await runWithStrategy("第 1 次运行", question, "fallback", fallback);
    await runWithStrategy("第 2 次运行", question, "fallback", fallback);

    // ── 策略 2：REPORT ──
    console.log("\n\n【策略 2】REPORT（上报）★ 最推荐");
    console.log("失败时把错误告诉模型，模型会自动调整方案（通常基于自身知识继续回答）");

    await runWithStrategy("第 1 次运行", question, "report");
    await runWithStrategy("第 2 次运行", question, "report");

    // ── 策略 3：ABORT ──
    console.log("\n\n【策略 3】ABORT（终止）");
    console.log("失败时整个任务停止，适合不能容忍错误的关键操作");
    console.log("示例场景：支付工具 / 发短信工具 / 写数据库工具");

    await runWithStrategy("第 1 次运行", question, "abort");
    await runWithStrategy("第 2 次运行", question, "abort");
  } catch (err) {
    console.error("意外错误:", err.message);
  }

  console.log("\n\n✅ 演示完成");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("📚 总结 - 如何在你的 Agent 里选策略：");
  console.log("");
  console.log("  查热门话题失败？   → FALLBACK（给默认话题，任务继续）");
  console.log("  搜索失败？         → REPORT（告诉模型，让它基于知识回答）");
  console.log("  字数统计失败？     → REPORT（模型可以跳过这步）");
  console.log("  发布内容失败？     → ABORT（不能假装发布成功）");
  console.log("  扣费/支付失败？    → ABORT（强制终止，不能继续）");
  console.log("");
  console.log("  口诀：不影响结果→FALLBACK，影响但可跳过→REPORT，不可容忍→ABORT");
  console.log("═══════════════════════════════════════════════════════════");
}

main();

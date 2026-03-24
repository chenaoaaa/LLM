/**
 * Week 1 / Day 1-2：LLM 核心概念实验
 *
 * 本文件通过 4 组实验让你直观理解：
 *   实验 1 - Token 计数：用 usage 字段观察不同文本消耗的 token 数
 *   实验 2 - Temperature：同一问题在不同温度下的输出差异
 *   实验 3 - 上下文窗口：messages 数组的 system/user/assistant 三种角色
 *   实验 4 - max_tokens：限制输出长度，观察截断行为
 *
 * 运行方式：
 *   cd llm-demo
 *   node week1/01-concepts.js
 *
 * 每次运行会执行全部实验，观察输出并对照下面的注释理解每个参数的意义。
 */

import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─────────────────────────────────────────────
// 工具函数：调用 LLM，统一处理并打印结果
// ─────────────────────────────────────────────
async function callLLM({ messages, temperature = 1.0, max_tokens = 500, label = "" }) {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    temperature,
    max_tokens,
  });

  const content = response.choices[0].message.content;
  const usage = response.usage; // { prompt_tokens, completion_tokens, total_tokens }

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${label}`);
  console.log(`${"─".repeat(60)}`);
  console.log(`💬 输出：\n${content}`);
  console.log(`\n📊 Token 用量：`);
  console.log(`   输入（prompt）：${usage.prompt_tokens} tokens`);
  console.log(`   输出（completion）：${usage.completion_tokens} tokens`);
  console.log(`   合计：${usage.total_tokens} tokens`);

  return { content, usage };
}

// ─────────────────────────────────────────────
// 实验 1：Token 计数
// 目的：理解"token 不等于字符"，中文 token 效率低于英文
// ─────────────────────────────────────────────
async function experiment1_tokens() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 1】Token 计数 - 观察不同文本的 token 消耗");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 关键知识：token 是模型处理文字的最小单位。");
  console.log("   英文单词通常 1 个词 ≈ 1 token");
  console.log("   中文通常 1-2 个汉字 ≈ 1 token");
  console.log("   数字、符号也会消耗 token");

  // 短中文 vs 短英文：token 数量对比
  await callLLM({
    messages: [{ role: "user", content: "你好" }],
    label: "输入'你好'（2个汉字）的 token 消耗",
  });

  await callLLM({
    messages: [{ role: "user", content: "Hello" }],
    label: "输入'Hello'（5个英文字母）的 token 消耗",
  });

  // 长文本
  await callLLM({
    messages: [
      {
        role: "user",
        content:
          "请用一句话介绍人工智能，要求不超过20个字",
      },
    ],
    label: "输入一句较长的中文指令",
  });

  console.log("\n📝 实验 1 观察要点：");
  console.log("   - 对比上面三组的 prompt_tokens，感受不同文本的 token 消耗");
  console.log("   - token 消耗直接影响 API 费用，设计 Prompt 时要注意");
}

// ─────────────────────────────────────────────
// 实验 2：Temperature 对输出的影响
// 目的：理解 temperature 控制"随机性"，0=确定，1=发散
// ─────────────────────────────────────────────
async function experiment2_temperature() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 2】Temperature - 同一问题，不同温度，不同输出");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 关键知识：");
  console.log("   temperature = 0：输出几乎固定，每次一样，适合需要精确答案的场景");
  console.log("   temperature = 1：输出有随机性，每次不同，适合创意写作");
  console.log("   temperature > 1：输出更随机，可能产生奇怪内容（不推荐）");

  const question = [{ role: "user", content: "给我一个创意的咖啡馆名字，只回答名字本身" }];

  // temperature = 0：两次应该给出完全相同的答案
  await callLLM({ messages: question, temperature: 0, label: "temperature=0，第1次" });
  await callLLM({ messages: question, temperature: 0, label: "temperature=0，第2次（应该和第1次一样）" });

  // temperature = 1.2：每次应该给出不同的答案
  await callLLM({ messages: question, temperature: 1.2, label: "temperature=1.2，第1次（发散）" });
  await callLLM({ messages: question, temperature: 1.2, label: "temperature=1.2，第2次（应该和第1次不同）" });

  console.log("\n📝 实验 2 观察要点：");
  console.log("   - temperature=0 的两次输出是否相同？");
  console.log("   - temperature=1.2 的两次输出是否不同？");
  console.log("   - 什么场景用低温度？什么场景用高温度？");
}

// ─────────────────────────────────────────────
// 实验 3：messages 的三种角色
// 目的：理解 system/user/assistant 各自的作用
// ─────────────────────────────────────────────
async function experiment3_roles() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 3】messages 角色 - system 如何塑造模型人格");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 关键知识：");
  console.log("   system：设定模型的角色、规则、人格，用户看不到但模型始终遵守");
  console.log("   user：用户说的话");
  console.log("   assistant：模型之前说的话（用于模拟历史对话）");

  const question = "你是什么？";

  // 没有 system prompt
  await callLLM({
    messages: [{ role: "user", content: question }],
    label: "没有 system prompt 时问'你是什么？'",
  });

  // 有 system prompt：定义为猫咪
  await callLLM({
    messages: [
      { role: "system", content: "你是一只可爱的猫咪，只会用喵喵叫回应，偶尔说几个字。" },
      { role: "user", content: question },
    ],
    label: "system 定义为猫咪后问'你是什么？'",
  });

  // 有 system prompt：定义为严肃的工程师
  await callLLM({
    messages: [
      {
        role: "system",
        content:
          "你是一名严肃的高级软件工程师，回答问题简洁精准，不废话，不用表情符号。",
      },
      { role: "user", content: question },
    ],
    label: "system 定义为严肃工程师后问'你是什么？'",
  });

  console.log("\n📝 实验 3 观察要点：");
  console.log("   - 三次回答的语气和内容差异有多大？");
  console.log("   - system prompt 是塑造 Agent 人格最重要的工具");
}

// ─────────────────────────────────────────────
// 实验 4：max_tokens 截断行为
// 目的：理解输出长度限制，以及被截断时的表现
// ─────────────────────────────────────────────
async function experiment4_maxTokens() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 4】max_tokens - 限制输出长度，观察截断行为");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 关键知识：");
  console.log("   max_tokens 控制模型最多输出多少 token");
  console.log("   设置太小会导致输出被截断（句子不完整）");
  console.log("   finish_reason='stop' 表示正常结束");
  console.log("   finish_reason='length' 表示被 max_tokens 截断");

  const prompt = [{ role: "user", content: "请详细介绍一下人工智能的历史，至少写500字" }];

  // 正常长度
  const result1 = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: prompt,
    max_tokens: 500,
  });
  console.log("\n─────────────────────────────────────────");
  console.log("📌 max_tokens=500（正常）");
  console.log("─────────────────────────────────────────");
  console.log(`💬 输出前100字：${result1.choices[0].message.content.slice(0, 100)}...`);
  console.log(`⏹️  结束原因：${result1.choices[0].finish_reason}`);
  // stop = 正常结束，length = 被截断

  // 极短截断
  const result2 = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: prompt,
    max_tokens: 20,
  });
  console.log("\n─────────────────────────────────────────");
  console.log("📌 max_tokens=20（强制截断）");
  console.log("─────────────────────────────────────────");
  console.log(`💬 输出：${result2.choices[0].message.content}`);
  console.log(`⏹️  结束原因：${result2.choices[0].finish_reason}`);
  // 应该是 'length'，说明被截断了

  console.log("\n📝 实验 4 观察要点：");
  console.log("   - finish_reason 是 'stop' 还是 'length'？");
  console.log("   - 被截断的输出是否句子不完整？");
  console.log("   - 生产环境中要设置合理的 max_tokens，既防超长又不截断");
}

// ─────────────────────────────────────────────
// 主流程：依次执行所有实验
// ─────────────────────────────────────────────
async function main() {
  console.log("🚀 Week 1 / Day 1-2：LLM 核心概念实验");
  console.log("每个实验结束后，仔细阅读「观察要点」，确保你理解了这个概念。\n");

  try {
    await experiment1_tokens();
    await experiment2_temperature();
    await experiment3_roles();
    await experiment4_maxTokens();

    console.log("\n\n✅ 全部实验完成！");
    console.log("─────────────────────────────────────────────────────────");
    console.log("📚 课后思考题（不需要写代码，想清楚就行）：");
    console.log("  1. 如果你要做一个[每次回答都一样]的客服机器人，temperature 设多少？");
    console.log("  2. 如果你要做一个[每次都给出不同创意]的文案生成器，temperature 设多少？");
    console.log("  3. 为什么 system prompt 对 Agent 系统如此重要？");
    console.log("  4. max_tokens 设置太小有什么危险？设置太大又有什么代价？");
    console.log("─────────────────────────────────────────────────────────");
    console.log("\n⏭️  完成后进入 Day 3-4：实现多轮对话 → week1/02-chat.js");
  } catch (error) {
    console.error("❌ 实验出错：", error.message);
    console.error("请检查：1. .env 文件中 DEEPSEEK_API_KEY 是否正确  2. 网络是否正常");
  }
}

main();

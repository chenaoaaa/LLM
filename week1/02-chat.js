/**
 * Week 1 / Day 3-4：多轮对话实现
 *
 * 核心概念：
 *   - messages 数组是"记忆"的载体，每轮对话必须把历史全部带上
 *   - 对话格式：system（人格） → user（你说） → assistant（模型说） → user → assistant...
 *   - Node.js readline 模块用于读取终端输入
 *
 * 运行方式：
 *   cd llm-demo
 *   node week1/02-chat.js
 *
 * 输入 'quit' 或按 Ctrl+C 退出对话
 */

import OpenAI from "openai";
import readline from "readline";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

// ─────────────────────────────────────────────────────────────
// 知识点：messages 数组就是对话的"记忆"
//
// 每轮对话前，messages 长这样：
// [
//   { role: "system",    content: "你是一个助手..." },   ← 人格设定，永远在第一位
//   { role: "user",      content: "你好，我叫陈澳" },    ← 用户第1轮
//   { role: "assistant", content: "你好，陈澳！..." },   ← 模型第1轮回答
//   { role: "user",      content: "我叫什么名字？" },    ← 用户第2轮
// ]
//
// 模型看到完整历史，所以能回答"你叫陈澳"。
// 如果每次只发最后一条 user 消息，模型就会"失忆"。
// ─────────────────────────────────────────────────────────────

// 对话历史（持久保留整个会话）
// 注意：这里用 const，但数组内容是可以 push 的
const messages = [
  {
    role: "system",
    content: `你是一个友善的 AI 助手，有以下特点：
- 记住对话中用户提到的所有信息
- 回答简洁，一般不超过3句话
- 如果用户没有明确要求，不主动询问太多问题`,
  },
];

// 统计 token 用量（用于观察多轮对话的累积消耗）
let totalTokens = 0;

// ─────────────────────────────────────────────────────────────
// 核心函数：发送消息并获取回复
// ─────────────────────────────────────────────────────────────
async function chat(userInput) {
  // Step 1: 把用户输入追加到历史
  messages.push({ role: "user", content: userInput });

  // Step 2: 把完整历史发给模型
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages, // ← 关键：每次都发送完整历史
    temperature: 0.8,
    max_tokens: 300,
  });

  const assistantReply = response.choices[0].message.content;
  const usage = response.usage;
  totalTokens += usage.total_tokens;

  // Step 3: 把模型回复也追加到历史（下一轮会带上）
  messages.push({ role: "assistant", content: assistantReply });

  return { reply: assistantReply, usage };
}

// ─────────────────────────────────────────────────────────────
// 终端交互：readline 读取用户输入
// ─────────────────────────────────────────────────────────────
function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function prompt(rl, question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

// ─────────────────────────────────────────────────────────────
// 主循环
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Week 1 / Day 3-4：多轮对话实验");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 学习要点：");
  console.log("   1. 告诉模型你的名字，然后隔几轮后问它你叫什么");
  console.log("   2. 观察底部的 [对话轮次] 和 [累计 Token] 如何增长");
  console.log("   3. 想想：如果轮次越多，token 消耗为什么越来越多？");
  console.log("─────────────────────────────────────────────────────────");
  console.log("输入 quit 退出\n");

  const rl = createInterface();
  let round = 0;

  // 优雅退出
  rl.on("close", () => {
    console.log("\n\n─────────────────────────────────────────────────────────");
    console.log("📊 本次对话统计：");
    console.log(`   对话轮次：${round} 轮`);
    console.log(`   累计消耗：${totalTokens} tokens`);
    console.log(`   历史消息：${messages.length} 条（含 system）`);
    console.log("─────────────────────────────────────────────────────────");
    console.log("📝 思考：随着对话增加，每次 API 调用都会带上全部历史。");
    console.log("   轮次越多，单次调用消耗的 token 就越多。");
    console.log("   这就是为什么生产中需要「对话压缩/截断」策略。");
    console.log("\n⏭️  完成后进入 Day 5-7：Prompt 工程实战 → week1/03-prompt.js");
    process.exit(0);
  });

  while (true) {
    const userInput = await prompt(rl, "你: ");

    if (userInput.trim().toLowerCase() === "quit") {
      rl.close();
      break;
    }

    if (!userInput.trim()) {
      continue;
    }

    try {
      process.stdout.write("助手: ");
      const { reply, usage } = await chat(userInput);
      console.log(reply);
      round++;
      console.log(
        `\n   [第 ${round} 轮 | 本次 ${usage.total_tokens} tokens | 历史共 ${messages.length} 条消息]\n`
      );
    } catch (error) {
      console.error("❌ 出错：", error.message);
    }
  }
}

main();

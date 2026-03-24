/**
 * Week 1 / Day 5-7：Prompt 工程实战
 *
 * 核心技巧：
 *   技巧 1 - 角色定义：明确告诉模型它是谁、能做什么、不能做什么
 *   技巧 2 - 输出格式约束：用结构化指令让模型按你要的格式输出
 *   技巧 3 - Few-shot 示例：给例子比讲道理更有效
 *   技巧 4 - 思维链（Chain of Thought）：让模型先思考再回答，提升复杂任务质量
 *
 * 运行方式：
 *   cd llm-demo
 *   node week1/03-prompt.js
 *
 * 实验方式：修改下面各个 SYSTEM_PROMPT_xxx 变量，观察输出变化
 */

import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

async function callLLM(systemPrompt, userMessage, label) {
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.8,
    max_tokens: 800,
  });

  console.log(`\n${"─".repeat(60)}`);
  console.log(`📌 ${label}`);
  console.log(`${"─".repeat(60)}`);
  console.log(response.choices[0].message.content);
  console.log(`\n📊 消耗 ${response.usage.total_tokens} tokens`);

  return response.choices[0].message.content;
}

// ─────────────────────────────────────────────────────────────
// 实验 1：无 Prompt vs 有角色定义
// ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT_EMPTY = "你是一个助手。";

// 技巧 1：明确角色 + 能力边界 + 限制
const SYSTEM_PROMPT_WITH_ROLE = `你是一名专业的小红书内容创作顾问，有以下特点：

【你擅长的】
- 写出标题吸引眼球、内容真实接地气的小红书笔记
- 了解小红书平台的内容规律，知道什么样的内容容易爆
- 擅长把普通素材包装成有共鸣感的故事

【你的限制】
- 只回答和内容创作相关的问题，其他问题礼貌拒绝
- 不写夸大宣传、虚假功效的内容
- 不模仿他人作品，确保原创性

【你的风格】
- 像一个有经验的朋友给建议，不摆架子，接地气
- 给建议时直接说重点，不废话`;

async function experiment1_roleDefinition() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 1】角色定义的效果对比");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 同样的问题，有没有角色定义，回答差距很大");

  const question = "帮我写一篇关于秋天咖啡馆打卡的小红书";

  await callLLM(SYSTEM_PROMPT_EMPTY, question, "无角色定义");
  await callLLM(SYSTEM_PROMPT_WITH_ROLE, question, "有角色定义");

  console.log("\n📝 观察要点：");
  console.log("   - 两次输出的格式、风格、实用性有什么差别？");
  console.log("   - 有角色定义的版本是否更贴合小红书的真实风格？");
}

// ─────────────────────────────────────────────────────────────
// 实验 2：输出格式约束
// ─────────────────────────────────────────────────────────────

// 技巧 2：用严格的格式指令控制输出结构
const SYSTEM_PROMPT_WITH_FORMAT = `${SYSTEM_PROMPT_WITH_ROLE}

【输出格式要求】
每次创作必须严格按照以下格式输出，不能省略任何部分：

---
📝 标题方案（提供3个，每个风格不同）
1. [标题1，吸引眼球型，含emoji]
2. [标题2，情感共鸣型，含emoji]  
3. [标题3，干货攻略型，含emoji]

📖 正文（选用标题1展开）
[正文内容，300字以内，分3-4段，口语化，有情感有细节]

🏷️ 标签推荐
[8-10个标签，用#格式，从大到小：泛话题#咖啡 → 细话题#秋日咖啡馆打卡]

📸 配图建议
[2-3条具体的拍照建议，说明构图和氛围]
---`;

async function experiment2_format() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 2】输出格式约束");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 结构化输出是 Agent 系统的基础，让结果可被程序解析");

  const question = "帮我写一篇关于秋天咖啡馆打卡的小红书";

  await callLLM(SYSTEM_PROMPT_WITH_FORMAT, question, "有格式约束的输出");

  console.log("\n📝 观察要点：");
  console.log("   - 输出是否严格按照格式？");
  console.log("   - 想象一下：如果格式固定，你可以用代码解析输出、提取各个部分");
  console.log("   - 这就是 Agent 系统处理结构化输出的基础思路");
}

// ─────────────────────────────────────────────────────────────
// 实验 3：Few-shot 示例
// ─────────────────────────────────────────────────────────────

// 技巧 3：给出真实示例，让模型"对齐"到你想要的风格
const SYSTEM_PROMPT_WITH_FEWSHOT = `${SYSTEM_PROMPT_WITH_FORMAT}

【风格参考示例】
以下是2篇高互动量的小红书笔记，请仔细学习其语言风格：

示例1（情感共鸣型）：
标题：第一次一个人去咖啡馆，我哭了😭
正文：
上周末，鼓起勇气一个人走进了那家一直想去的咖啡馆。
窗边的位置，阳光正好打在拿铁上，我突然发现——
原来一个人也可以很好。
坐了两个小时，看完了一本书，喝完了一杯咖啡。
出门的时候，感觉整个人都轻松了很多。
你有没有试过，一个人去咖啡馆？

示例2（干货攻略型）：
标题：发现宝藏咖啡馆！人少景美出片率100%✨
正文：
终于找到一家不用排队的咖啡馆，而且超级出片！
【店名/地址】XX咖啡·XX路
【人均】38元
【必点】桂花拿铁（强烈推荐！！）
【最佳拍照位】靠窗第3排，下午3点左右阳光刚好
【小tips】工作日去人少，周末要提前1小时到`;

async function experiment3_fewshot() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 3】Few-shot 示例效果");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 给示例比给规则更有效。模型会模仿示例的风格和结构");

  const question = "帮我写一篇关于秋天咖啡馆打卡的小红书";

  await callLLM(SYSTEM_PROMPT_WITH_FEWSHOT, question, "加了 Few-shot 示例后的输出");

  console.log("\n📝 观察要点：");
  console.log("   - 和实验2相比，加了示例后语言风格是否更像真实小红书？");
  console.log("   - Few-shot 示例的数量和质量直接影响输出效果");
  console.log("   - 代价：示例会占用大量 token（观察本次 token 用量）");
}

// ─────────────────────────────────────────────────────────────
// 实验 4：思维链（Chain of Thought）
// ─────────────────────────────────────────────────────────────

// 技巧 4：让模型先思考再输出，尤其适合需要判断的任务
const SYSTEM_PROMPT_COT = `你是一名内容创作顾问。

在创作之前，请按以下步骤思考（用 <思考过程> 标签包裹，不会展示给用户）：

<思考过程>
1. 这个主题的目标用户是谁？他们的痛点和兴趣点是什么？
2. 当前是什么季节/节点？有什么热点可以结合？
3. 选择哪种内容风格最合适：情感共鸣 / 干货攻略 / 好物推荐？
4. 标题的钩子是什么（情绪钩子/好奇钩子/利益钩子）？
</思考过程>

思考完成后，直接给出最终的创作内容（格式同之前的要求）。`;

async function experiment4_cot() {
  console.log("\n\n═══════════════════════════════════════════════════════════");
  console.log("【实验 4】思维链（Chain of Thought）");
  console.log("═══════════════════════════════════════════════════════════");
  console.log("💡 让模型先想再说，输出质量通常更高，尤其是复杂任务");

  const question = "帮我写一篇关于秋天咖啡馆打卡的小红书";

  await callLLM(SYSTEM_PROMPT_COT, question, "使用思维链后的输出");

  console.log("\n📝 观察要点：");
  console.log("   - 模型是否真的先进行了思考？思考过程是否有逻辑？");
  console.log("   - 最终输出是否比前几个实验更有针对性？");
  console.log("   - 思维链会增加 token 消耗，但通常提升质量");
}

// ─────────────────────────────────────────────────────────────
// 主流程
// ─────────────────────────────────────────────────────────────
async function main() {
  console.log("🚀 Week 1 / Day 5-7：Prompt 工程实战");
  console.log("同一个问题，用4种不同的 Prompt 技巧，观察输出差异\n");

  try {
    await experiment1_roleDefinition();
    await experiment2_format();
    await experiment3_fewshot();
    await experiment4_cot();

    console.log("\n\n✅ Week 1 全部完成！");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("🎯 Week 1 里程碑回顾：");
    console.log("   ✅ Day 1-2：理解 Token、temperature、messages 角色、max_tokens");
    console.log("   ✅ Day 3-4：实现支持多轮对话的聊天程序");
    console.log("   ✅ Day 5-7：掌握4个核心 Prompt 工程技巧");
    console.log("═══════════════════════════════════════════════════════════");
    console.log("\n📚 Week 1 总结 - 你现在应该能回答这些问题：");
    console.log("  Q: Token 是什么？为什么 Prompt 工程师要关注 token 数量？");
    console.log("  Q: temperature=0 和 temperature=1 分别用在什么场景？");
    console.log("  Q: system/user/assistant 三种角色分别是什么作用？");
    console.log("  Q: Few-shot 和 Chain of Thought 分别解决什么问题？");
    console.log("\n⏭️  进入 Week 2：Tool Calling → week2/01-tool-calling.js");
    console.log("   你将学习：让模型「调用」你写的函数，这是 Agent 的心脏");
  } catch (error) {
    console.error("❌ 出错：", error.message);
    console.error("请检查：.env 文件中 DEEPSEEK_API_KEY 是否正确");
  }
}

main();

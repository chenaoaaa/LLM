import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: "https://api.deepseek.com",
});

const response = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [
    { role: "system", content: "你是一个助手" },
    { role: "user", content: "用一句话解释什么是人工智能" },
  ],
});

console.log(response.choices[0].message.content);

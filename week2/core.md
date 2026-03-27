Tool Calling 协议（3步）：
  你 ──[问题 + 工具定义]──▶ 模型
  模型 ──[我要调 xxx，参数是 yyy]──▶ 你   ← 只是"声明"，不执行
  你 ──[真正执行，结果是 zzz]──▶ 模型
  模型 ──[最终回答]──▶ 你

Agent Loop（循环）：
  while (true) {
    调模型
    if finish_reason === "tool_calls" → 执行工具 → 继续
    if finish_reason === "stop"       → 任务完成 → 退出
  }
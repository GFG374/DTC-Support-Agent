export type ChatItem = {
  id: number;
  user: string;
  lastMsg: string;
  time: string;
  status: "ai_handling" | "needs_human" | "closed";
  risk: "low" | "high";
};

export type ChatMessage = { role: "user" | "ai" | "system"; content: string; type?: "alert" };

export type ApprovalTask = {
  id: string;
  user: string;
  item: string;
  amount: number;
  riskScore: number;
  platform: string;
};

export const chatList: ChatItem[] = [
  { id: 1, user: "Sarah Jenkins", lastMsg: "我想退掉这件大衣...", time: "2m", status: "ai_handling", risk: "low" },
  { id: 2, user: "Mike Ross", lastMsg: "还没发货吗？都三天了", time: "15m", status: "needs_human", risk: "high" },
  { id: 3, user: "Jessica Wu", lastMsg: "谢谢，已经收到退款了", time: "1h", status: "closed", risk: "low" },
];

export const chatHistory: ChatMessage[] = [
  { role: "user", content: "你好，我刚收到这件羊毛大衣，但是颜色和图片差别太大了。" },
  { role: "ai", content: "非常抱歉给您带来困扰。我会协助处理。您想换颜色还是直接退款呢？" },
  { role: "user", content: "我不想换了，直接退吧。这可是 899 元的东西，失望。" },
  { role: "system", type: "alert", content: "⚠️ 检测到用户情绪负面，且金额 > ¥350，建议人工介入。" },
];

export const approvalTasks: ApprovalTask[] = [
  { id: "T-1001", user: "Mike Ross", item: "限量版球鞋 (42)", amount: 1299, riskScore: 85, platform: "Alipay" },
  { id: "T-1002", user: "Sarah Jenkins", item: "高级羊绒大衣", amount: 899, riskScore: 12, platform: "WeChat" },
];

# 🤖 DSW 智能客服 Agent 系统设计文档

## 📋 目录
- [系统架构](#系统架构)
- [Agent 设计](#agent-设计)
- [工作流程](#工作流程)
- [API 集成](#api-集成)
- [快速开始](#快速开始)
- [设计哲学](#设计哲学)

---

## 🏗️ 系统架构

### 响应式交互架构（Reactive Design）

```
用户输入
   ↓
┌─────────────────────────────────────────┐
│         Q&A Agent (对话层)              │
│  - 立即响应用户（0.5秒内）              │
│  - 建立连接："正在处理..."              │
│  - 流式更新处理结果                      │
└─────────────────────────────────────────┘
   ↓                                    ↑
   [触发后台异步处理]                  [流式推送结果]
   ↓                                    ↑
┌─────────────────┐                     │
│  Router Agent   │ ← 意图识别、情绪检测 │
└─────────────────┘                     │
   ↓                                    │
   ├─→ 退货请求 → ┌──────────────────┐  │
   │              │ Return Planner   │──┘
   │              │ - 查询订单        │
   │              │ - 检查政策        │
   │              │ - 调用 API        │
   │              └──────────────────┘
   │
   ├─→ 换货请求 → ┌──────────────────┐
   │              │ Exchange Planner │ （待实现）
   │              └──────────────────┘
   │
   └─→ 物流查询 → ┌──────────────────┐
                  │ WISMO Agent      │ （待实现）
                  └──────────────────┘

关键特性：
✅ 先响应后处理（不让用户等待）
✅ 异步工具调用（Router + Planner 后台执行）
✅ 流式结果更新（实时推送处理进度）
```

---

## 🎭 Agent 设计

### 1️⃣ **Router Agent（路由智能体）**

**职责**：
- 理解用户意图（退货、换货、查询等）
- 检测用户情绪（生气、沮丧、中性、愉快）
- 决定路由到哪个专业 Agent
- 判断是否需要人工介入

**输出格式**：
```json
{
  "intent": "return_request",
  "confidence": 0.95,
  "emotion": "neutral",
  "need_human": false,
  "reason": "用户请求退货，情绪正常"
}
```

**触发人工介入的条件**：
- 用户明确要求人工客服
- 用户情绪激动（生气/非常沮丧）
- 意图识别置信度 < 0.5

**实现位置**：`backend/app/agents/router.py`

---

### 2️⃣ **Q&A Agent（对话智能体）**

**职责**：
- **唯一与用户对话的界面**
- 性格温暖、耐心、专业
- 使用 Emoji 表达情绪
- 接收其他 Agent 的处理结果并转达用户

**性格特点**：
- 🌟 热情友好：像朋友一样亲切
- 💙 耐心细致：认真倾听，不急躁
- ✨ 积极乐观：用正能量感染用户
- 🙏 共情能力：理解用户情绪

**Emoji 使用规范**：
- 欢迎：`您好！我是小薇~ 😊`
- 确认：`好的，我明白了 ✅`
- 道歉：`非常抱歉给您带来不便 🙏`
- 成功：`退款已处理完成！🎉`
- 等待：`正在为您查询中... ⏳`

**禁止行为**：
- ❌ 使用过于正式的官方话术
- ❌ 机械重复相同回复
- ❌ 推卸责任或敷衍用户
- ❌ 过度使用 Emoji（一句话不超过2个）

**实现位置**：`backend/app/agents/qa.py`

---

### 3️⃣ **Return Planner Agent（退货规划智能体）**

**职责**：
- 检查退货是否符合政策
- 调用订单 API 验证订单信息
- 调用支付宝 API 处理退款
- 生成退货授权码（RMA）

**退货政策规则**：

| 条件 | 要求 | 结果 |
|------|------|------|
| 时间窗口 | ≤ 30天 | ✅ 符合 |
| 时间窗口 | > 30天 | ❌ 拒绝 |
| 商品状态 | 未使用、有包装 | ✅ 符合 |
| 金额 | < ¥50 | 🤖 自动退款 |
| 金额 | ¥50 ~ ¥499 | 👔 经理审批 |
| 金额 | ≥ ¥500 | 👨‍💼 主管审批 |

**处理流程**：
```
1. 获取订单信息（订单 API）
   ↓
2. 检查退货条件（时间、状态）
   ↓
3. 判断金额是否需要审批
   ↓
4. 调用支付宝 API 退款（自动批准的情况）
   ↓
5. 返回处理结果给 Q&A Agent
```

**输出格式**：
```json
{
  "approved": true,
  "action": "auto_refund",
  "refund_amount": 89.00,
  "refund_id": "ALIPAY_REFUND_20250117123456",
  "rma_number": "RMA20250117123456",
  "estimated_days": "3-5",
  "reason": "符合30天退货政策，自动退款已处理",
  "next_steps": [
    "请将商品寄回指定地址",
    "退款将在3-5个工作日到账"
  ]
}
```

**实现位置**：`backend/app/agents/return_planner.py`

---

## 🔄 工作流程

### 核心设计理念 💡

**响应式交互设计**：先响应用户（建立连接），再后台处理（工具调用）

```
快速情绪检测 → Q&A (动态第一轮回复) → Router (后台分析) → Planner (后台处理) → Q&A (流式更新)
     ↑
  0.1秒内完成，根据情绪调整语气
```

**为什么第一轮回复要动态调整？**
- 🎯 **第一印象决定一切** - 用户在 0.5 秒内形成印象
- 😠 **愤怒用户看到笑脸会更生气** - "你们产品太差了！" → "😊" = 差评
- 🙏 **先道歉后处理** - 情绪激动的用户需要先被安抚
- ⭐ **避免直接差评** - 不合适的第一轮回复 = 失去挽回机会

**情绪检测策略**：
1. **快速关键词检测（0.1秒）** - 用于第一轮回复
   - 愤怒：差、烂、垃圾、投诉 → 道歉语气 🙏
   - 沮丧：怎么还没、为什么 → 理解语气 💙
   - 好奇：？、请问 → 友好语气 😊
   - 普通：默认 → 积极语气 ✨

2. **深度 AI 分析（1-2秒）** - 用于后续处理
   - Router Agent 使用 Kimi 深度理解意图和情绪
   - 决定是否需要人工介入

---

### 典型对话流程示例（响应式）

```
👤 用户: "我要退货，订单号 ORD20250101001"

    ↓ (0.5秒内)

🤖 Q&A Agent (小薇) - 立即响应:
   "好的！我来帮您处理退货~ 😊 
    正在查询订单信息，请稍等..."

    ↓ [后台异步执行]

🔍 Router Agent (后台):
   - 意图：return_request
   - 置信度：0.95
   - 情绪：neutral
   - 路由：Return Planner

    ↓

📦 Return Planner (后台):
   1. 查询订单：ORD20250101001
   2. 订单信息：¥89.00，10天前购买
   3. 检查政策：✅ 在30天内，✅ 金额 < ¥50
   4. 调用支付宝：退款 ¥89.00
   5. 生成 RMA：RMA20250117001

    ↓ (2-3秒后)

🤖 Q&A Agent (小薇) - 流式更新:
   "✅ 订单查询完成！
   
   好消息！🎉 您的退货申请已通过，退款已自动处理~ 
   
   💰 退款金额：¥89.00
   📅 预计到账：3-5个工作日
   💳 请留意银行账户通知
   
   📦 请将商品寄回：
   北京市朝阳区 DSW 退货中心（邮编100000）
   
   🔖 退货授权码：RMA20250117001
   （寄回时请在包裹上注明此编号）"

    ↓

👤 用户: 收到完整回复，体验流畅 ✨
```

---

### 对比：为什么不是传统流程？

**❌ 传统批处理流程（我之前的错误设计）**：
```
用户 → 等待5秒 → 收到完整回复
```
- 问题：等待时间长，用户会想"我为什么不直接在订单页面点退款？"

**✅ 响应式流程（正确设计）**：
```
用户 → 0.5秒立即响应 → 后台处理 → 流式更新结果
```
- 优势：即时反馈，体验像真人客服，AI 价值体现

---

## 🔌 API 集成

### 1️⃣ **支付宝沙箱环境**

**功能**：
- 退款处理（`alipay.trade.refund`）
- 退款查询（`alipay.trade.fastpay.refund.query`）

**配置步骤**：
1. 访问 [支付宝开放平台沙箱](https://open.alipay.com/develop/sandbox/app)
2. 获取 AppID、应用私钥、支付宝公钥
3. 在 `.env` 中配置：
   ```env
   ALIPAY_APP_ID=your_app_id
   ALIPAY_PRIVATE_KEY=your_private_key
   ALIPAY_PUBLIC_KEY=alipay_public_key
   ALIPAY_SANDBOX=true
   ```

**当前状态**：
- ✅ Mock 版本已实现（无需配置即可演示）
- ⏳ 真实 API 集成（待配置密钥后启用）

**实现位置**：`backend/app/integrations/alipay.py`

---

### 2️⃣ **订单 API（Mock）**

**功能**：
- 查询订单信息
- 查询用户订单列表
- 更新订单状态
- 查询物流信息

**预置测试数据**：
- `ORD20250101001`：¥89，10天前，可退货 ✅
- `ORD20250102002`：¥299，5天前，需要审批 ⚠️
- `ORD20241201003`：¥599，40天前，超期拒绝 ❌
- `ORD20250110004`：¥129，运输中，未签收 ⏳

**实现位置**：`backend/app/integrations/order.py`

---

## 🚀 快速开始

### 1️⃣ 运行演示

```bash
# 进入后端目录
cd backend

# 运行 Agent 系统演示
python demo_agents.py
```

**演示场景**：
1. 小额退货（自动批准）
2. 大额退货（需要审批）
3. 超期退货（拒绝）
4. 用户情绪激动（转人工）

---

### 2️⃣ 集成到现有 API（响应式设计）

在 `backend/app/api/chat.py` 中使用 Agent（流式响应）：

```python
from app.agents.router import RouterAgent
from app.agents.qa import QAAgent
from app.agents.return_planner import ReturnPlannerAgent
from app.integrations import get_alipay_client, get_order_api

# 初始化
router = RouterAgent()
qa_agent = QAAgent()
return_planner = ReturnPlannerAgent(
    order_api=get_order_api(),
    payment_api=get_alipay_client(use_mock=True)
)

# 流式处理用户消息
async def handle_message_stream(user_message: str, history: list):
    """响应式处理：先响应，后执行"""
    
    # 1. Q&A Agent 立即响应（0.5秒内）
    async for chunk in qa_agent.chat_stream(
        user_message,
        history,
        context={"status": "processing", "message": "正在为您处理，请稍等..."}
    ):
        yield chunk  # 流式输出初始响应
    
    # 2. 后台异步：Router 分析意图
    intent = await router.analyze_intent(user_message, history)
    
    # 3. 后台异步：根据意图调用工具
    if intent['intent'] == 'return_request':
        # 提取订单号
        order_id = extract_order_id(user_message)
        
        # Return Planner 处理退货
        result = await return_planner.process_return_request(order_id)
        
        # 4. Q&A Agent 流式输出结果
        async for chunk in qa_agent.chat_stream(
            user_message,
            history,
            context={'return_result': result}
        ):
            yield chunk  # 流式输出处理结果
    
    elif intent['intent'] == 'order_status':
        # 查询订单状态
        order_info = await get_order_api().get_order(order_id)
        
        # Q&A Agent 告知用户
        async for chunk in qa_agent.chat_stream(
            user_message,
            history,
            context={'order_info': order_info}
        ):
            yield chunk
    
    # ... 其他意图处理
```

**关键点**：
1. ✅ `qa_agent.chat_stream()` - 流式输出，立即响应
2. ✅ 后台 `await router.analyze_intent()` - 异步分析
3. ✅ 后台 `await return_planner.process_return_request()` - 异步处理
4. ✅ 再次流式输出结果 - 用户看到完整流程

---

## 📊 性能指标

| 指标 | 目标 | 当前状态 |
|------|------|---------|
| 意图识别准确率 | > 90% | 🔄 测试中 |
| 情绪检测准确率 | > 85% | 🔄 测试中 |
| 自动化率 | > 70% | ⏳ 待评估 |
| 响应速度 p50 | < 1s | ✅ 已达标 |
| 响应速度 p95 | < 2.5s | ✅ 已达标 |
| CSAT（客户满意度） | > 4.5/5 | ⏳ 待收集 |

---

## 🔮 下一步计划

### 近期
- [ ] 集成 RAG（从政策文档检索答案）
- [ ] 实现 Exchange Planner（换货流程）
- [ ] 实现 WISMO Agent（物流查询）
- [ ] 添加单元测试

### 中期
- [ ] 接入真实支付宝沙箱环境
- [ ] 实现人工审批工作流
- [ ] 添加对话质量评估
- [ ] A/B 测试不同 Prompts

### 长期
- [ ] 多语言支持
- [ ] 语音输入/输出
- [ ] 情绪分析可视化
- [ ] 自动学习优化

---

## 🎨 设计哲学

### 为什么是"Q&A 先行"而不是"Router 先行"？

#### ❌ 传统错误：批处理思维
```
用户消息 → Router 分析 → Planner 处理 → Q&A 响应
等待时间：3-5秒
```

**问题**：
1. 用户等待时间长，体验差
2. 用户会想："我为什么不直接在订单页面点退款？"
3. AI 的价值没有体现（等待时间和传统系统一样）

---

#### ✅ 正确设计：对话式思维
```
Q&A 立即响应 → Router 后台分析 → Planner 后台处理 → Q&A 流式更新
等待时间：0.5秒（首次响应）
```

**优势**：
1. ⚡ **即时反馈**：用户立即知道 AI 在处理
2. 🤝 **建立连接**：像真人客服一样先应答
3. 💪 **AI 优势**：
   - 比订单页面点击更智能（AI 帮你检查政策、解释原因、提供建议）
   - 对话式交互更自然（"我来帮您处理"比冰冷的按钮温暖）
   - 异常情况处理更好（AI 可以解释为什么不能退、提供替代方案）

---

### 类比：ChatGPT 的成功秘诀

**ChatGPT 为什么体验好？**
- 不是等 10 秒给你完整答案 ❌
- 而是 0.1 秒开始打字，边思考边输出 ✅

**我们的设计遵循同样原则**：
- 不是等 Router + Planner 都完成再回复 ❌
- 而是 Q&A 先说话，后台异步处理，流式更新结果 ✅

---

### MCP 工具调用的正确姿势

**MCP (Model Context Protocol)** 的核心理念：
> 工具调用应该**透明且异步**，不阻塞用户交互

**我们的实现**：
```python
# ✅ 正确：先响应，后调用工具
async def handle_message():
    # 1. 立即响应
    yield "正在处理..."
    
    # 2. 后台调用工具
    result = await call_mcp_tool()  # 异步，不阻塞
    
    # 3. 流式更新结果
    yield f"处理完成：{result}"
```

```python
# ❌ 错误：先调用工具，后响应
async def handle_message():
    # 用户等待...
    result = await call_mcp_tool()  # 阻塞3秒
    
    # 3秒后才响应
    return f"处理完成：{result}"
```

---

### 设计原则总结

1. **用户体验优先** - 0.5秒内必须有响应
2. **对话式交互** - Q&A Agent 是唯一界面
3. **异步工具调用** - Router/Planner 后台执行
4. **流式结果推送** - 实时更新处理进度
5. **AI 价值体现** - 不是替代按钮，而是提供智能服务

---

## 📚 相关文档

- [Kimi API 文档](https://platform.moonshot.cn/docs)
- [支付宝开放平台](https://open.alipay.com/develop/sandbox/app)
- [Supabase 文档](https://supabase.com/docs)
- [FastAPI 文档](https://fastapi.tiangolo.com/)

---

## 👥 贡献者

- **开发者**：您的名字
- **项目类型**：学生毕业设计 / AI Agent 系统
- **技术栈**：FastAPI + Next.js + Supabase + Kimi AI

---

## 📄 许可证

MIT License

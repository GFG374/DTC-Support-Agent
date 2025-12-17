# Multi-Agent 架构说明

## 架构概览

```
用户 → Q&A Agent (前台) → 各专业部门 Agent
                          ├─ Return Planner (退货部)
                          ├─ Order Agent (订单部)
                          └─ Logistics (物流部)
```

### 核心理念：公司部门模型

- **Q&A Agent** = 前台接待员
  - 直接与用户对话
  - 简单问题自己处理（问候、感谢）
  - 复杂业务呼叫专业部门

- **各部门 Agent** = 专业处理部门
  - 不直接面对用户
  - 只处理专业领域业务
  - 返回结构化结果给前台

## Q&A Agent (前台)

**文件**: `backend/app/agents/qa.py`

**职责**:
- 与用户友好对话（emoji、温暖、专业）
- 简单问题直接回答
- 复杂业务调用 MCP 工具

**可用工具** (`QA_AGENT_TOOLS`):
1. `call_return_department` - 呼叫退货部门
2. `call_order_department` - 呼叫订单部门
3. `call_logistics_department` - 呼叫物流部门
4. `transfer_to_human` - 转接人工客服

**工作流程**:
1. 接收用户消息
2. Kimi AI 分析意图
3. 如果简单 → 直接回答
4. 如果复杂 → 调用对应部门工具
5. 获得部门结果 → 用友好语言转达用户

## Return Planner Agent (退货部门)

**文件**: `backend/app/agents/return_planner.py`

**职责**:
- 检查退货政策（30天内、金额限制）
- 处理退款（调用支付宝 API）
- 生成退货授权码（RMA）

**内部工具** (`RETURN_PLANNER_TOOLS`):
1. `check_return_policy` - 检查是否符合政策
2. `process_refund` - 处理退款
3. `generate_rma_number` - 生成 RMA

**返回格式**:
```json
{
  "approved": true,
  "action": "auto_refund",
  "refund_amount": 89.0,
  "refund_id": "ALIPAY_xxx",
  "rma_number": "RMA20250117001",
  "days": "3-5",
  "message": "已自动退款"
}
```

## Order Agent (订单部门)

**文件**: `backend/app/agents/order_agent.py`

**职责**:
- 查询订单详情
- 查询物流信息

**内部工具** (`ORDER_AGENT_TOOLS`):
1. `get_order_details` - 获取订单信息
2. `get_logistics_info` - 获取物流跟踪

## 技术实现

### Kimi Function Calling

Q&A Agent 使用 Kimi 的 `tools` 参数:

```python
response = await client.post(
    f"{self.api_base}/chat/completions",
    json={
        "model": "moonshot-v1-8k",
        "messages": messages,
        "tools": QA_AGENT_TOOLS,  # 定义可用工具
        "temperature": 0.7
    }
)
```

### 工作流程

1. **用户发送消息** → `/api/chat/agent`

2. **Q&A Agent 调用 Kimi**
   - Kimi 分析意图
   - 决定是否需要调用工具

3. **如果需要工具**:
   ```
   Kimi 返回: finish_reason="tool_calls"
   → 执行工具调用（呼叫部门）
   → 获得部门结果
   → 再次调用 Kimi，传入结果
   → Kimi 生成友好回复
   → 返回用户
   ```

4. **如果不需要工具**:
   ```
   Kimi 直接生成回复
   → 返回用户
   ```

## API 端点

### POST `/api/chat/agent`

**请求**:
```json
{
  "conversation_id": "uuid",
  "message": "我要退货，订单号 ORD20250101001"
}
```

**响应** (SSE 流式):
```
data: {"content": "好"}
data: {"content": "的"}
data: {"content": "亲"}
...
data: {"done": true}
```

## 测试订单数据

**订单 1**: `ORD20250101001`
- 金额: ¥89
- 状态: 已签收（10天前）
- 可退货: ✅

**订单 2**: `ORD20250102002`
- 金额: ¥299
- 状态: 已签收（5天前）
- 可退货: ✅ (但需要审批，金额>200)

**订单 3**: `ORD20241201003`
- 金额: ¥599
- 状态: 已签收（40天前）
- 可退货: ❌ (超过30天)

**订单 4**: `ORD20250110004`
- 金额: ¥129
- 状态: 运输中
- 可退货: ❌ (未签收)

## 对话示例

### 简单对话（不调用工具）

```
用户: 你好
AI: 您好呀！👋 我是 DSW 的 AI 客服小助手，很高兴为您服务~ 有什么可以帮到您的吗？😊
```

### 复杂业务（调用退货部门）

```
用户: 我要退货，订单号 ORD20250101001
AI: [调用 call_return_department]
    → 退货部门返回：{"approved": true, "refund_amount": 89, ...}
AI: 好消息！✅ 您的退货申请已通过，退款 89 元会在 3-5 个工作日内原路退回支付宝~ 请将商品寄回我们的退货中心哦！📮
```

### 订单查询（调用订单部门）

```
用户: 我的订单 ORD20250110004 到哪了？
AI: [调用 call_logistics_department]
    → 物流部门返回：{"status": "运输中", "location": "上海", ...}
AI: 您的包裹正在飞奔赶来！🚚 目前在上海分拨中心，预计明天就能送达~ 请保持电话畅通哦！
```

## 文件结构

```
backend/app/
├── agents/
│   ├── __init__.py           # 导出 Agents
│   ├── qa.py                 # Q&A Agent (前台)
│   ├── return_planner.py     # Return Planner (退货部)
│   ├── order_agent.py        # Order Agent (订单部)
│   ├── mcp_tools.py          # MCP 工具定义
│   ├── router.py             # (已废弃)
│   └── first_response.py     # (已废弃)
├── core/
│   └── prompts.py            # System Prompts
├── api/
│   └── chat.py               # /chat/agent 端点
└── integrations/
    ├── order.py              # Mock 订单 API
    └── alipay.py             # Mock 支付宝 API
```

## 关键设计原则

1. **AI 驱动，非规则引擎**
   - 不用 if-else 判断关键词
   - 用 AI Prompt 和 Function Calling
   - AI 自己决定调用哪个工具

2. **多 Agent 分工**
   - 每个 Agent 有明确职责
   - 前台只管对话，部门只管业务
   - 类似公司部门协作

3. **友好 + 专业**
   - 用 emoji 表达情绪
   - 对愤怒用户更温柔
   - 对开心用户分享喜悦

4. **简洁高效**
   - 简单问题不调工具
   - 复杂问题才呼叫部门
   - 减少不必要的 API 调用

## 下一步扩展

可以轻松添加新部门：

1. 创建新 Agent (如 `customer_complaint.py`)
2. 定义该部门的工具
3. 添加到 Q&A Agent 的 `QA_AGENT_TOOLS`
4. 更新 Prompt 教 AI 何时调用

就像公司新增一个部门一样简单！🎉

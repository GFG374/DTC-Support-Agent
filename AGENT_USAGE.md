# 🚀 响应式 Multi-Agent 系统 - 使用指南

## 📋 快速开始

### 1️⃣ 测试 Agent 系统

```bash
# 进入后端目录
cd backend

# 运行测试脚本（验证 Agent 系统）
python test_agent_flow.py
```

**测试场景**：
- ✅ 小额退货（自动批准）
- ✅ 订单查询
- ✅ 情绪检测转人工

---

### 2️⃣ 启动完整服务

#### 后端
```bash
cd backend
uvicorn app.main:app --reload --port 8000
```

#### 前端
```bash
cd frontend
npm run dev
```

---

## 🔌 API 接口

### 响应式 Agent 接口
**Endpoint**: `POST /chat/agent`

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
data: {"content": "！"}
...
data: {"done": true}
```

---

## 🧪 测试用例

### 场景 1: 小额退货（自动批准）
```
用户: "我要退货，订单号 ORD20250101001"

预期流程:
1. Q&A 立即响应: "好的！我来帮您处理..."
2. Router 后台分析意图: return_request
3. Return Planner 处理: ✅ 自动批准（¥89 < ¥50）
4. Q&A 流式更新: "退款已处理完成！🎉"

结果: ✅ 退款单号 ALIPAY_REFUND_xxx
```

### 场景 2: 大额退货（需要审批）
```
用户: "退货，订单 ORD20250102002"

预期流程:
1. 立即响应
2. 分析意图: return_request
3. 处理: ⚠️ 需要审批（¥299 ≥ ¥50）
4. 更新: "需要经理审批，预计1个工作日..."

结果: ⏳ 审批单号 APPROVAL_xxx
```

### 场景 3: 超期退货（拒绝）
```
用户: "能退货吗？订单 ORD20241201003"

预期流程:
1. 立即响应
2. 分析意图: return_request
3. 检查政策: ❌ 超过30天
4. 更新: "抱歉，已超过退货期限（40天）"

结果: ❌ 拒绝退货
```

### 场景 4: 情绪激动（转人工）
```
用户: "你们的产品太差了！必须退货！"

预期流程:
1. 立即响应
2. 分析情绪: angry
3. 触发转人工: need_human = true
4. 更新: "正在为您转接人工客服..."

结果: 🤝 转接人工
```

### 场景 5: 订单查询
```
用户: "查一下订单 ORD20250102002"

预期流程:
1. 立即响应
2. 分析意图: order_status
3. 查询订单 API
4. 更新订单信息

结果: 📦 显示订单详情
```

---

## 🎯 响应时间目标

| 阶段 | 目标时间 | 说明 |
|------|---------|------|
| **首次响应** | < 0.5秒 | Q&A Agent 立即回复 |
| **意图分析** | 0.5-1秒 | Router Agent 后台执行 |
| **工具调用** | 1-2秒 | Planner 调用 API |
| **完整流程** | < 3秒 | 从用户发送到显示完整结果 |

---

## 📊 当前状态

### ✅ 已实现功能
- [x] Router Agent - 意图识别 + 情绪检测
- [x] Q&A Agent - 友好对话 + Emoji
- [x] Return Planner - 退货规则判断
- [x] Mock 订单 API（4个测试订单）
- [x] Mock 支付宝 API（退款模拟）
- [x] 响应式流式 API `/chat/agent`
- [x] 订单号自动提取
- [x] 前端代理路由 `/api/chat-agent`

### ⏳ 待实现功能
- [ ] RAG 政策检索
- [ ] Exchange Planner（换货）
- [ ] WISMO Agent（物流查询）
- [ ] 人工审批工作流
- [ ] 对话质量评估

---

## 🔧 配置说明

### 当前配置（Mock 模式）
```python
# backend/app/api/chat.py
return_planner = ReturnPlannerAgent(
    order_api=get_order_api(),           # Mock 订单 API
    payment_api=get_alipay_client(use_mock=True)  # Mock 支付宝
)
```

### 切换到真实支付宝（需要配置）
```python
# 1. 在 .env 中添加配置
ALIPAY_APP_ID=your_app_id
ALIPAY_PRIVATE_KEY=your_private_key
ALIPAY_PUBLIC_KEY=alipay_public_key
ALIPAY_SANDBOX=true

# 2. 修改代码
payment_api=get_alipay_client(use_mock=False)  # 使用真实 API
```

**何时需要真实 API？**
- 演示时需要展示真实退款流程
- 答辩时需要证明真实 API 集成能力
- 生产环境部署

**现在还不需要**，Mock 版本已经足够演示完整功能！

---

## 🎨 前端集成示例

### 调用 Agent API
```typescript
// frontend/app/c/assistant/page.tsx

const response = await fetch("/api/chat-agent", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${session.access_token}`
  },
  body: JSON.stringify({
    conversation_id: conversationId,
    message: userMessage
  })
});

// 读取流式响应
const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split("\n");
  
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const data = JSON.parse(line.slice(6));
      
      if (data.content) {
        // 逐字显示（打字机效果）
        aiMessage += data.content;
        updateUI(aiMessage);
      }
      
      if (data.done) {
        // 完成
        break;
      }
    }
  }
}
```

---

## 🐛 故障排查

### 问题 1: Kimi API 调用失败
**症状**: Router Agent 无法分析意图

**解决**:
```bash
# 检查环境变量
echo $MOONSHOT_API_KEY

# 检查网络
curl https://api.moonshot.cn/v1/models
```

### 问题 2: 订单号未提取
**症状**: 提示"请提供订单号"

**原因**: 订单号格式不正确

**正确格式**:
- `ORD20250101001` ✅
- `ORD123` ❌ (长度不足)
- `ord20250101001` ❌ (小写)

### 问题 3: 流式响应不显示
**症状**: 等待很久才一次性显示

**检查**:
1. 浏览器是否支持 SSE
2. 代理是否开启缓冲（检查 `X-Accel-Buffering: no`）
3. 网络是否稳定

---

## 📈 性能优化建议

### 1. 并行处理
当前顺序执行 → 可以并行：
```python
# 并行执行多个查询
order_task = asyncio.create_task(order_api.get_order(order_id))
logistics_task = asyncio.create_task(logistics_api.get_status(order_id))

order, logistics = await asyncio.gather(order_task, logistics_task)
```

### 2. 缓存常见问题
```python
# 缓存 FAQ 答案
@lru_cache(maxsize=100)
def get_faq_answer(question: str):
    return rag_service.search(question)
```

### 3. 预加载对话历史
```python
# 提前加载，减少等待
history = await repo.list_messages(conversation_id)
```

---

## 🎓 学习资源

- [FastAPI 异步编程](https://fastapi.tiangolo.com/async/)
- [SSE (Server-Sent Events)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)
- [支付宝开放平台沙箱](https://open.alipay.com/develop/sandbox/app)
- [Kimi API 文档](https://platform.moonshot.cn/docs)

---

## 🤝 贡献

欢迎提交 Issue 和 PR！

**优先级**:
1. 🔥 RAG 集成（从政策文档检索答案）
2. 🔥 Exchange Planner（换货流程）
3. 💡 WISMO Agent（物流查询）
4. 💡 人工审批工作流

---

## 📄 许可证

MIT License

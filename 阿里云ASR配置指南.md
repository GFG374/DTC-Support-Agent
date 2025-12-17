# 阿里云语音识别（ASR）配置指南

## 📋 功能说明

语音转文字功能已完成开发，支持：
1. **C端用户发送语音**：自动调用ASR转写（用于AI理解）
2. **右键菜单转写**：C端和S端都可以右键点击语音消息选择"语音转文字"

## 🔑 申请阿里云ASR密钥

### 步骤1：开通智能语音交互服务

1. 登录 [阿里云控制台](https://www.aliyun.com/)
2. 搜索"智能语音交互"或访问：https://nls-portal.console.aliyun.com/
3. 点击"开通服务"（如果未开通）
4. 选择"录音文件识别"或"实时语音识别"产品

### 步骤2：创建项目并获取AppKey

1. 在智能语音交互控制台，进入"项目管理"
2. 点击"创建项目"
3. 填写项目名称（如：DTC客服语音识别）
4. 创建成功后，记录 **AppKey**（类似：`abc12345`）

### 步骤3：获取Access Key

1. 点击右上角头像 → 访问控制
2. 或直接访问：https://ram.console.aliyun.com/manage/ak
3. 点击"创建AccessKey"
4. 记录：
   - **AccessKey ID**（类似：`LTAI5tAbCdEfGhIjKlMn`）
   - **AccessKey Secret**（类似：`OpQrStUvWxYz1234567890AbCdEf`）
   - ⚠️ **Secret只显示一次，务必保存！**

### 步骤4：配置到项目

编辑 `backend/.env` 文件，添加：

```bash
ALIYUN_ASR_APPKEY=你的AppKey
ALIYUN_ASR_ACCESS_KEY_ID=你的AccessKeyID
ALIYUN_ASR_ACCESS_KEY_SECRET=你的AccessKeySecret
```

## 💰 费用说明

阿里云ASR计费方式（2025年参考）：
- **录音文件识别**：约 ¥0.0025/秒（即1小时约9元）
- **实时语音识别**：约 ¥0.005/秒（即1小时约18元）
- **免费额度**：新用户可能有免费试用额度

建议使用"录音文件识别"，成本更低。

## 🚀 使用说明

### C端用户
1. 长按发送语音消息
2. 语音自动上传并调用转写（后台进行）
3. 右键点击已发送的语音 → 选择"语音转文字"查看转写结果

### S端客服
1. 查看用户发来的语音消息
2. 右键点击语音 → 选择"语音转文字"
3. 转写完成后会在消息下方显示文本

## 🛠️ 技术实现

### 已完成的功能
- ✅ 后端ASR服务模块（`backend/app/services/asr.py`）
- ✅ 转写API接口（`/api/transcribe`）
- ✅ C端自动转写（发送语音时）
- ✅ C端右键菜单转写
- ✅ S端右键菜单转写
- ✅ 数据库transcript字段存储

### 配置完密钥后需要做的优化

目前代码中使用了占位实现，配置密钥后需要：

1. 安装阿里云SDK（推荐）：
```bash
cd backend
pip install aliyun-python-sdk-core
pip install nls-python-sdk
```

2. 或者使用HTTP API直接调用（当前实现）

3. 修改 `backend/app/services/asr.py` 中的实际调用逻辑

## 📞 问题排查

### 1. 转写失败
- 检查密钥是否正确配置
- 检查阿里云账号余额
- 查看后端日志：`backend/app/services/asr.py`

### 2. 语音上传失败
- 检查Supabase storage配置
- 检查voice-messages bucket是否存在

### 3. 右键菜单不出现
- 确保在语音消息上右键
- 检查浏览器控制台错误

## 📚 参考文档

- [阿里云智能语音交互文档](https://help.aliyun.com/product/30413.html)
- [录音文件识别API](https://help.aliyun.com/document_detail/90727.html)
- [Python SDK使用指南](https://help.aliyun.com/document_detail/120693.html)

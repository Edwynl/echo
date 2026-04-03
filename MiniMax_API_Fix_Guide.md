# MiniMax API 配置修正指南

## 问题诊断

根据 MiniMax 官方文档（https://platform.minimaxi.com/docs/api-reference/text-chat），您的配置存在以下错误：

### 错误1: API端点域名错误
```
❌ 错误: https://api.minimax.chat/v1
✅ 正确: https://api.minimaxi.com/v1/text/chatcompletion_v2
```

### 错误2: 模型名称错误
```
❌ 错误: MINIMAX_MODEL="MiniMax-Text-01"
✅ 正确: MINIMAX_MODEL="M2-her"
```

---

## 修正后的 .env 配置

```env
# MiniMax API 配置
MINIMAX_API_KEY="您的API密钥"
MINIMAX_BASE_URL="https://api.minimaxi.com/v1"
MINIMAX_MODEL="M2-her"
```

---

## 正确的 Python 调用代码

```python
import requests
import json

# MiniMax API 配置
API_KEY = "您的API密钥"
API_URL = "https://api.minimaxi.com/v1/text/chatcompletion_v2"
MODEL = "M2-her"

def chat_with_minimax(prompt: str, system_prompt: str = "你是一个有用的AI助手") -> str:
    """
    调用 MiniMax M2-her 模型进行对话

    Args:
        prompt: 用户输入
        system_prompt: 系统提示词

    Returns:
        模型回复内容
    """
    headers = {
        "Authorization": f"Bearer {API_KEY}",
        "Content-Type": "application/json"
    }

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "system",
                "name": "assistant",
                "content": system_prompt
            },
            {
                "role": "user",
                "name": "user",
                "content": prompt
            }
        ],
        "temperature": 0.7,
        "top_p": 0.95,
        "stream": False
    }

    try:
        response = requests.post(API_URL, headers=headers, json=payload, timeout=60)
        response.raise_for_status()

        result = response.json()

        # 解析响应
        if "choices" in result and len(result["choices"]) > 0:
            return result["choices"][0]["message"]["content"]
        elif "base_resp" in result:
            status_code = result["base_resp"].get("status_code", -1)
            status_msg = result["base_resp"].get("status_msg", "未知错误")
            raise Exception(f"API错误 {status_code}: {status_msg}")
        else:
            raise Exception(f"响应格式异常: {result}")

    except requests.exceptions.RequestException as e:
        raise Exception(f"请求失败: {str(e)}")

def summarize_video_content(transcript: str, video_title: str) -> dict:
    """
    使用 MiniMax M2-her 总结视频内容

    Args:
        transcript: 视频文字稿
        video_title: 视频标题

    Returns:
        包含总结结果的字典
    """
    prompt = f"""请为以下YouTube视频创建一个全面的知识总结：

视频标题：{video_title}

视频内容：
{transcript}

请按照以下格式总结：
1. **核心主题**：视频的主要讨论话题（一句话）
2. **关键要点**：提取5个最重要的观点
3. **详细内容**：按时间顺序的重要片段（3-5个段落）
4. **结论**：视频的最终结论或行动建议

请用中文回答，总结要简洁但信息丰富。"""

    response = chat_with_minimax(prompt)

    # 解析返回的文本，提取结构化信息
    return {
        "core_topic": extract_core_topic(response),
        "key_points": extract_key_points(response),
        "detailed_segments": extract_segments(response),
        "conclusions": extract_conclusions(response),
        "full_summary": response
    }

# 辅助函数
def extract_core_topic(text: str) -> str:
    """提取核心主题"""
    import re
    match = re.search(r'核心主题[：:]\s*(.+)', text)
    return match.group(1).strip() if match else "未找到核心主题"

def extract_key_points(text: str) -> list:
    """提取关键要点"""
    import re
    points = re.findall(r'[•\-\d]\s*(.+)', text)
    return [p.strip() for p in points[:5]] if points else []

def extract_segments(text: str) -> list:
    """提取时间段内容"""
    import re
    segments = re.findall(r'\[([^\]]+)\]\s*(.+)', text)
    return [{"timestamp": s[0], "content": s[1].strip()} for s in segments]

def extract_conclusions(text: str) -> str:
    """提取结论"""
    import re
    match = re.search(r'结论[：:]\s*(.+)', text, re.DOTALL)
    return match.group(1).strip() if match else "未找到结论"

# 测试代码
if __name__ == "__main__":
    # 测试API连接
    try:
        response = chat_with_minimax("你好，请介绍一下你自己")
        print("API连接成功!")
        print(f"回复: {response}")
    except Exception as e:
        print(f"API连接失败: {e}")
```

---

## MiniMax-Text-01 模型说明

### 重要提醒

根据官方文档，**MiniMax-Text-01 不能直接通过官方API调用**。它需要通过以下方式使用：

1. **vLLM 自行部署** - 适合有GPU资源的用户
2. **Hugging Face** - 下载模型自行部署
3. **OpenRouter** - 第三方API网关（可能有调用限制）

### MiniMax-Text-01 官方信息

| 属性 | 值 |
|------|-----|
| 参数总量 | 4560亿 |
| 激活参数 | 459亿/-token |
| 训练上下文 | 100万 tokens |
| 推理上下文 | 400万 tokens |
| 发布日期 | 2025年1月 |

MiniMax-Text-01 是一个强大的长上下文模型，但目前官方API只支持 M2-her 模型。

---

## 快速检查清单

请按以下步骤检查您的配置：

- [ ] `.env` 文件中 `MINIMAX_BASE_URL` 是否为 `https://api.minimaxi.com/v1`
- [ ] `.env` 文件中 `MINIMAX_MODEL` 是否为 `M2-her`
- [ ] `MINIMAX_API_KEY` 是否是从 https://platform.minimaxi.com 获取的正确密钥
- [ ] API密钥是否有足够的调用额度

---

## 获取正确的API密钥

1. 访问 [MiniMax开放平台](https://platform.minimaxi.com)
2. 注册/登录账户
3. 进入 **账户管理 > 接口密钥**
4. 创建新的API密钥
5. 确保账户有足够的调用额度

---

## 常见错误代码

| 错误码 | 含义 | 解决方案 |
|--------|------|---------|
| 1001 | API密钥无效 | 检查密钥是否正确 |
| 1002 | 密钥已过期 | 生成新的API密钥 |
| 1003 | 额度不足 | 充值或等待额度重置 |
| 1004 | 请求格式错误 | 检查请求体格式 |
| 1005 | 模型不支持 | 使用 M2-her 模型 |
| 2000 | 并发超限 | 减少请求频率 |
| 2001 | 速率超限 | 降低请求速度 |

---

## 技术支持

如果以上方法都无法解决问题，请：

1. 查看 MiniMax 官方文档：https://platform.minimaxi.com/docs
2. 检查错误码说明：https://platform.minimaxi.com/docs/api-reference/errorcode
3. 联系 MiniMax 技术支持

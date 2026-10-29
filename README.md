---

> [!NOTE]
> **本仓库已迁移至 Gitee**：<https://gitee.com/Everett5678/shiyin-player>
> GitHub 端仅作只读归档，新代码请推送到 Gitee。

# 拾音 · Shiyin Player

一个自研的网易云音乐第三方网页客户端。苔绿视觉、液态玻璃、逐字卡拉OK歌词、听歌热力、以及一个能帮你点歌的 AI 助理。

> 拾音不是网易云音乐官方客户端，仅用于个人学习与本地体验。请遵守网易云音乐的用户协议、版权规则与会员权益规则。本项目不提供绕过付费、绕过会员、破解音质或重新分发音乐内容的能力。

## 功能一览

**播放体验**
- 扫码登录（网易云 App），同步你的歌单、喜欢、私人FM、每日推荐
- 双 `<audio>` 无缝交叉淡入淡出切歌
- 全屏播放页：封面取色动态主题、流体动态背景、三列布局（封面 / 歌词 / 评论·队列）
- 逐字卡拉OK歌词：优先逐字歌词（yrc），无逐字数据时回退行级伪逐字；歌词悬停跳转、字号/字体/字重自定义
- 音质四档：标准 / 极高 / 无损 / Hi-Res（按账号权益自动降级提示）

**发现与管理**
- 发现页：每日推荐（日历卡）、私人雷达、排行榜、热门歌手、新歌速递
- 歌单管理：收藏歌单、收藏单曲到我的歌单、右键菜单（下一首播放/收藏/红心/评论）
- 播放队列浮层、歌曲评论区（热评 + 最新）

**「我的」主页**
- 听歌排行（本周/全部）、累计数据、本地听歌热力图（GitHub 风格）
- 歌单墙、一言

**AI 助理**
- OpenAI 兼容接口（GPT/DeepSeek/通义等均可），配置即用
- 真 Agent：9 个工具（搜歌、点播、歌单入队、每日推荐、播放控制、红心……）
- 对它说"我今天心情有点丧，放点歌"试试

**个性化**
- 亮/暗双主题、5 套主题色、歌词大小滑杆、封面样式（方形/圆形旋转）
- 自定义 CSS 注入（高级用户）

## 快速开始

需要 Node.js（v22 已验证）。

```bash
npm run setup   # 首次：安装 server 依赖（已配置 npmmirror 镜像）
npm start       # 启动 API(3000) + 静态服务(8080)
```

然后浏览器打开 **http://localhost:8080**。

> 必须通过 http 访问，不能直接双击 index.html（图片代理和跨域 fetch 依赖同源）。
> Windows 用户也可以直接双击 `server/start.bat`。

## 登录

顶栏「点击登录」→ 二维码 → 网易云音乐 App 扫码确认。
Cookie 仅保存在你自己浏览器的 localStorage 中，不会上传任何地方。

## AI 助理配置

设置 → AI 配置：填入 API Base URL（默认 `https://api.openai.com/v1`）、API Key、模型名（需支持 function calling，如 `gpt-4o-mini`、`deepseek-chat`）。模型不支持工具调用时自动降级为普通对话。

## 技术栈

- 前端：原生 HTML/CSS/JS，零框架零构建，经典 script 模块化
- 后端：[NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi)（网易云 API 封装）+ Express 静态服务与图片代理
- 灵感致谢：[BetterNCM](https://github.com/std-microblock/BetterNCM)（插件生态）、[AMLL](https://github.com/amll-dev/applemusic-like-lyrics)（歌词体验）

## 已知限制

- VIP / 无版权歌曲无法获取音源，会自动跳过并提示
- 桌面歌词、全局快捷键等能力需要未来的 Electron 桌面化
- 登录态通过 query 参数携带 cookie，**仅适合本地自用，请勿部署到公网**

## License

[MIT](LICENSE)

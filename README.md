# PersonalHub - 个人操作台

一个轻量级的个人效率工具 Web 应用，帮助你管理时间和文本草稿。

## 功能模块

### 🕐 时间记录助手
- 快速记录每个时间段的活动
- 支持语音输入事项名称
- 按日期查看和管理记录
- 导出数据为 JSON 格式
- 分类统计与回顾

### 📝 文本草稿
- 快速创建和保存文本草稿
- 本地存储，数据安全

## 技术栈

- **前端**: 原生 HTML5 + CSS3 + JavaScript
- **字体**: Inter (Google Fonts)
- **存储**: LocalStorage
- **语音识别**: Web Speech API

## 快速开始

1. 克隆项目到本地：
   ```bash
   git clone <repository-url>
   cd personalhub
   ```

2. 直接在浏览器中打开 `index.html`，或使用本地服务器：
   ```bash
   # 使用 Python
   python -m http.server 8080

   # 或使用 Node.js
   npx serve
   ```

3. 访问 `http://localhost:8080` 开始使用

## 项目结构

```
personalhub/
├── index.html      # 主页面
├── app.js          # 应用逻辑与模块注册
├── styles.css      # 样式表
├── package.json    # 项目配置
└── README.md       # 项目说明
```

## 浏览器支持

- Chrome (推荐，完整支持语音识别)
- Edge
- Firefox
- Safari

> 注意：语音输入功能需要浏览器支持 Web Speech API

## 许可证

ISC

# PersonalHub - 个人操作台

一个轻量级的个人效率工具 Web 应用，帮助你管理时间、文本草稿和跨设备文件传输。

## 功能模块

### ⏱ 时间记录助手
- 快速记录每个时间段的活动
- **待办事项管理** - 支持拖拽排序
- 支持语音输入事项名称
- 按日期查看和管理记录
- 导出数据为 JSON 格式
- 分类统计与回顾

### 📝 文本草稿
- 快速创建和保存文本草稿
- **自动保存** - 关闭页面自动保存为历史记录
- 本地存储，数据安全
- 支持语音输入

### 📤 文件快传
- 上传文件生成下载链接
- **直链下载** - 无需打开控制台，直接通过链接下载
- **上传进度可视化** - 显示实时上传速度与预计剩余时间
- **双链接支持** - 浏览器直接下载 + wget 命令一键复制
- 支持拖拽上传，最大 15GB
- 完美支持中文文件名
- 显示下载次数统计
- 适合跨设备传输文件

## 技术栈

- **前端**: 原生 HTML5 + CSS3 + JavaScript
- **后端**: Node.js + Express
- **文件上传**: Multer
- **字体**: Inter (Google Fonts)
- **存储**: LocalStorage (前端) + 文件系统 (后端)
- **语音识别**: Web Speech API

## 快速开始

### 本地运行

```bash
# 克隆项目
git clone https://github.com/your-username/personalhub.git
cd personalhub

# 安装依赖
npm install

# 启动服务器
npm start

# 访问
open http://localhost:3000
```

### 服务器部署

详见下方「部署到服务器」章节，或直接运行部署脚本：

```bash
# 在服务器上执行
chmod +x deploy.sh
./deploy.sh
```

## 项目结构

```
personalhub/
├── index.html          # 主页面
├── app.js              # 前端应用逻辑
├── styles.css          # 样式表
├── server.js           # 后端服务器
├── package.json        # 项目配置
├── deploy.sh           # 部署脚本
├── uploads/            # 上传文件存储目录
├── uploads_meta.json   # 文件元数据
└── README.md           # 项目说明
```

## 部署到服务器

### 前置要求

- Node.js 18+ 
- npm 或 yarn
- 开放端口 3000（或自定义端口）

### 手动部署步骤

1. **上传代码到服务器**
   ```bash
   git clone https://github.com/your-username/personalhub.git
   cd personalhub
   ```

2. **安装依赖**
   ```bash
   npm install --production
   ```

3. **配置端口（可选）**
   ```bash
   export PORT=3000
   ```

4. **使用 PM2 启动（推荐）**
   ```bash
   # 安装 PM2
   npm install -g pm2
   
   # 启动应用
   pm2 start server.js --name personalhub
   
   # 设置开机自启
   pm2 startup
   pm2 save
   ```

5. **配置防火墙**
   ```bash
   # 阿里云安全组需要开放端口 80
   # CentOS/RHEL
   firewall-cmd --permanent --add-service=http
   firewall-cmd --reload
   
   # Ubuntu
   ufw allow 'Nginx HTTP'
   ```

6. **访问应用**
   ```
   http://你的服务器IP
   ```

### Nginx 反向代理配置（部署脚本自动配置）

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 支持大文件上传 (15GB)
    client_max_body_size 15G;
    
    # 上传超时设置
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # 禁用缓冲以支持大文件
        proxy_buffering off;
        proxy_request_buffering off;
    }
}
```

## API 说明

### 文件上传
```
POST /api/files/upload
Content-Type: multipart/form-data
Body: file (文件)
```

### 获取文件列表
```
GET /api/files
```

### 删除文件
```
DELETE /api/files/:id
```

### 下载文件（直链）
```
GET /d/:id
```

直接在浏览器访问 `http://服务器地址/d/文件ID` 即可下载，无需登录。

## 浏览器支持

- Chrome (推荐，完整支持语音识别)
- Edge
- Firefox
- Safari

> 注意：语音输入功能需要浏览器支持 Web Speech API

## 许可证

ISC

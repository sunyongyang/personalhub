const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// 确保上传目录存在
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// 文件元数据存储
const META_FILE = path.join(__dirname, 'uploads_meta.json');

// 数据存储文件
const DATA_DIR = path.join(__dirname, 'data');
const TIME_ENTRIES_FILE = path.join(DATA_DIR, 'time_entries.json');
const TODOS_FILE = path.join(DATA_DIR, 'todos.json');
const DRAFTS_FILE = path.join(DATA_DIR, 'drafts.json');

// 确保数据目录存在
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadMeta() {
  try {
    if (fs.existsSync(META_FILE)) {
      return JSON.parse(fs.readFileSync(META_FILE, 'utf-8'));
    }
  } catch (error) {
    console.error('Failed to load meta file:', error);
  }
  return { files: [] };
}

function saveMeta(meta) {
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// 通用数据加载/保存函数
function loadData(filePath, defaultValue = []) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (error) {
    console.error(`Failed to load ${filePath}:`, error);
  }
  return defaultValue;
}

function saveData(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// 配置 multer 存储
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // 修复中文文件名编码问题
    file.originalname = Buffer.from(file.originalname, 'latin1').toString('utf-8');
    // 生成唯一文件ID
    const fileId = crypto.randomBytes(8).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${fileId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 15 * 1024 * 1024 * 1024 // 最大 15GB
  }
});

// 静态文件服务
app.use(express.static(__dirname));
app.use(express.json());

// 文件上传 API
app.post('/api/files/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '没有上传文件' });
  }

  const meta = loadMeta();
  const fileInfo = {
    id: path.basename(req.file.filename, path.extname(req.file.filename)),
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype,
    uploadedAt: Date.now(),
    downloads: 0
  };

  meta.files.unshift(fileInfo);
  saveMeta(meta);

  // 生成下载链接
  const downloadUrl = `/d/${fileInfo.id}`;

  res.json({
    success: true,
    file: fileInfo,
    downloadUrl
  });
});

// 获取文件列表 API
app.get('/api/files', (req, res) => {
  const meta = loadMeta();
  res.json({ files: meta.files });
});

// 删除文件 API
app.delete('/api/files/:id', (req, res) => {
  const meta = loadMeta();
  const fileIndex = meta.files.findIndex(f => f.id === req.params.id);

  if (fileIndex === -1) {
    return res.status(404).json({ error: '文件不存在' });
  }

  const file = meta.files[fileIndex];
  const filePath = path.join(UPLOAD_DIR, file.filename);

  // 删除物理文件
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Failed to delete file:', error);
  }

  // 从元数据中移除
  meta.files.splice(fileIndex, 1);
  saveMeta(meta);

  res.json({ success: true });
});

// 直接下载链接（短链接）
app.get('/d/:id', (req, res) => {
  const meta = loadMeta();
  const file = meta.files.find(f => f.id === req.params.id);

  if (!file) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head><title>文件不存在</title></head>
      <body style="font-family: sans-serif; text-align: center; padding: 50px;">
        <h1>404</h1>
        <p>文件不存在或已被删除</p>
        <a href="/">返回首页</a>
      </body>
      </html>
    `);
  }

  const filePath = path.join(UPLOAD_DIR, file.filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('文件已被删除');
  }

  // 更新下载次数
  file.downloads = (file.downloads || 0) + 1;
  saveMeta(meta);

  // 设置下载响应头
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`);
  res.setHeader('Content-Type', file.mimetype || 'application/octet-stream');
  res.setHeader('Content-Length', file.size);

  // 发送文件
  const fileStream = fs.createReadStream(filePath);
  fileStream.pipe(res);
});

// ============ 时间记录 API ============
// 获取所有时间记录
app.get('/api/time-entries', (req, res) => {
  const entries = loadData(TIME_ENTRIES_FILE, []);
  res.json({ entries });
});

// 保存时间记录（全量覆盖）
app.post('/api/time-entries', (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries)) {
    return res.status(400).json({ error: '无效的数据格式' });
  }
  saveData(TIME_ENTRIES_FILE, entries);
  res.json({ success: true });
});

// 添加单条时间记录
app.post('/api/time-entries/add', (req, res) => {
  const entry = req.body;
  if (!entry || !entry.id) {
    return res.status(400).json({ error: '无效的记录' });
  }
  const entries = loadData(TIME_ENTRIES_FILE, []);
  entries.unshift(entry);
  saveData(TIME_ENTRIES_FILE, entries);
  res.json({ success: true, entry });
});

// 删除时间记录
app.delete('/api/time-entries/:id', (req, res) => {
  const entries = loadData(TIME_ENTRIES_FILE, []);
  const newEntries = entries.filter(e => e.id !== req.params.id);
  saveData(TIME_ENTRIES_FILE, newEntries);
  res.json({ success: true });
});

// ============ 待办事项 API ============
// 获取所有待办事项
app.get('/api/todos', (req, res) => {
  const todos = loadData(TODOS_FILE, {});
  res.json({ todos });
});

// 保存待办事项（全量覆盖）
app.post('/api/todos', (req, res) => {
  const { todos } = req.body;
  if (typeof todos !== 'object') {
    return res.status(400).json({ error: '无效的数据格式' });
  }
  saveData(TODOS_FILE, todos);
  res.json({ success: true });
});

// 保存指定日期的待办事项
app.post('/api/todos/:date', (req, res) => {
  const { items } = req.body;
  const dateKey = req.params.date;
  if (!Array.isArray(items)) {
    return res.status(400).json({ error: '无效的数据格式' });
  }
  const todos = loadData(TODOS_FILE, {});
  todos[dateKey] = items;
  saveData(TODOS_FILE, todos);
  res.json({ success: true });
});

// ============ 文本草稿 API ============
// 获取所有草稿
app.get('/api/drafts', (req, res) => {
  const drafts = loadData(DRAFTS_FILE, []);
  res.json({ drafts });
});

// 保存草稿（全量覆盖）
app.post('/api/drafts', (req, res) => {
  const { drafts } = req.body;
  if (!Array.isArray(drafts)) {
    return res.status(400).json({ error: '无效的数据格式' });
  }
  saveData(DRAFTS_FILE, drafts);
  res.json({ success: true });
});

// 添加单条草稿
app.post('/api/drafts/add', (req, res) => {
  const draft = req.body;
  if (!draft || !draft.id) {
    return res.status(400).json({ error: '无效的草稿' });
  }
  const drafts = loadData(DRAFTS_FILE, []);
  drafts.unshift(draft);
  saveData(DRAFTS_FILE, drafts);
  res.json({ success: true, draft });
});

// 更新草稿
app.put('/api/drafts/:id', (req, res) => {
  const updates = req.body;
  const drafts = loadData(DRAFTS_FILE, []);
  const index = drafts.findIndex(d => d.id === req.params.id);
  if (index === -1) {
    return res.status(404).json({ error: '草稿不存在' });
  }
  drafts[index] = { ...drafts[index], ...updates };
  saveData(DRAFTS_FILE, drafts);
  res.json({ success: true, draft: drafts[index] });
});

// 删除草稿
app.delete('/api/drafts/:id', (req, res) => {
  const drafts = loadData(DRAFTS_FILE, []);
  const newDrafts = drafts.filter(d => d.id !== req.params.id);
  saveData(DRAFTS_FILE, newDrafts);
  res.json({ success: true });
});

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(`文件上传目录: ${UPLOAD_DIR}`);
});

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

// 启动服务器
app.listen(PORT, '0.0.0.0', () => {
  console.log(`服务器已启动: http://localhost:${PORT}`);
  console.log(`文件上传目录: ${UPLOAD_DIR}`);
});

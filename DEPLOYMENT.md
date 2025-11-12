# Chloe 部署文档

本文档详细说明如何在各种环境中部署 Chloe（增强版 SillyTavern）。

## 📋 部署前准备

### 系统要求

- **操作系统**：Linux (推荐 Ubuntu 20.04+) / macOS / Windows
- **Node.js**：18.x 或更高版本
- **内存**：至少 4GB RAM (推荐 8GB+)
- **磁盘空间**：至少 10GB 可用空间
- **网络**：需要访问外部 API（OpenAI、Discord 等）

### 必需的账户和凭据

1. **Discord OAuth 应用**（可选）
   - 访问：https://discord.com/developers/applications
   - 创建应用并配置 OAuth2

2. **LinuxDo OAuth 应用**（可选）
   - 在 LinuxDo 平台申请 OAuth 凭据

3. **域名和 SSL 证书**（生产环境推荐）
   - 用于 HTTPS 访问
   - 可使用 Let's Encrypt 免费证书

## 🚀 部署方式

### 方式一：直接部署（开发/测试）

#### 1. 克隆项目

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_REPO.git
cd YOUR_REPO
```

#### 2. 安装依赖

```bash
npm install
```

#### 3. 配置应用

复制配置模板：

```bash
cp default/config.yaml config.yaml
```

编辑 `config.yaml`，重点配置：

```yaml
# 基础配置
listen: true
port: 8000

# 如果使用域名访问，配置主机白名单
hostWhitelist:
  enabled: true
  hosts:
    - your-domain.com

# 启用用户账户
enableUserAccounts: true

# OAuth 配置
oauth:
  redirectUri: 'https://your-domain.com/oauth'
  discord:
    clientId: 'YOUR_DISCORD_CLIENT_ID'
    clientSecret: 'YOUR_DISCORD_CLIENT_SECRET'
  linuxdo:
    clientId: 'YOUR_LINUXDO_CLIENT_ID'
    clientSecret: 'YOUR_LINUXDO_CLIENT_SECRET'
```

#### 4. 修改管理员凭据

**重要**：编辑 `src/endpoints/admin.js` 修改管理员账号：

```javascript
const ADMIN_CREDENTIALS = {
    username: 'your_admin_username',
    password: 'your_strong_password',
};
```

更好的做法是从环境变量读取（需要修改代码）。

#### 5. 启动应用

```bash
# 开发模式
npm start

# 或使用 PM2（推荐生产环境）
npm install -g pm2
pm2 start server.js --name chloe
pm2 save
pm2 startup  # 配置开机自启
```

### 方式二：使用 Docker 部署

#### 1. 准备配置文件

创建 `docker/config` 目录并放置你的 `config.yaml`：

```bash
mkdir -p docker/config
cp default/config.yaml docker/config/config.yaml
# 编辑 docker/config/config.yaml
```

#### 2. 修改 docker-compose.yml（如需要）

```yaml
version: '3.8'
services:
  sillytavern:
    image: node:18
    working_dir: /app
    volumes:
      - ./:/app
      - ./docker/config:/app/config
      - ./docker/data:/app/data
    ports:
      - "8000:8000"
    command: npm start
    environment:
      - NODE_ENV=production
```

#### 3. 启动容器

```bash
docker compose -f docker/docker-compose.yml up -d
```

#### 4. 查看日志

```bash
docker compose -f docker/docker-compose.yml logs -f
```

### 方式三：使用反向代理部署（生产环境推荐）

#### 使用 Caddy

项目已包含 Caddy 配置文件 `ops/Caddyfile`。

1. **安装 Caddy**

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy
```

2. **配置 Caddy**

编辑 `ops/Caddyfile` 替换域名：

```
your-domain.com {
    reverse_proxy localhost:8000

    encode gzip

    header {
        X-Frame-Options "SAMEORIGIN"
        X-Content-Type-Options "nosniff"
        X-XSS-Protection "1; mode=block"
        Referrer-Policy "no-referrer-when-downgrade"
    }

    log {
        output file /var/log/caddy/access.log
    }
}
```

3. **启动 Caddy**

```bash
sudo cp ops/Caddyfile /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable caddy
```

#### 使用 Nginx

1. **安装 Nginx**

```bash
sudo apt install nginx
```

2. **配置 Nginx**

创建 `/etc/nginx/sites-available/chloe`：

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 重定向到 HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name your-domain.com;

    # SSL 证书配置
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

    # SSL 优化
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # 安全头
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # 代理配置
    location / {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;

        # 超时配置
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # 日志
    access_log /var/log/nginx/chloe_access.log;
    error_log /var/log/nginx/chloe_error.log;
}
```

3. **启用站点**

```bash
sudo ln -s /etc/nginx/sites-available/chloe /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **配置 SSL（Let's Encrypt）**

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

## 🔧 配置详解

### config.yaml 关键配置项

```yaml
# 监听配置
listen: true              # 允许远程访问
port: 8000               # 端口号

# 白名单模式（生产环境建议关闭，使用反向代理）
whitelistMode: false

# 主机白名单（使用域名时必须配置）
hostWhitelist:
  enabled: true
  hosts:
    - your-domain.com

# SSL（如果不使用反向代理）
ssl:
  enabled: true
  certPath: "./certs/cert.pem"
  keyPath: "./certs/privkey.pem"

# 用户账户
enableUserAccounts: true

# OAuth
oauth:
  redirectUri: 'https://your-domain.com/oauth'
  discord:
    clientId: ''
    clientSecret: ''

# 安全
disableCsrfProtection: false  # 生产环境必须保持 false
securityOverride: false       # 不要在生产环境启用

# 日志
logging:
  enableAccessLog: true
  minLogLevel: 1  # 0=DEBUG, 1=INFO, 2=WARN, 3=ERROR
```

### 环境变量

可以通过环境变量覆盖部分配置：

```bash
export DISCORD_CLIENT_ID="your_client_id"
export DISCORD_CLIENT_SECRET="your_client_secret"
export LINUXDO_CLIENT_ID="your_client_id"
export LINUXDO_CLIENT_SECRET="your_client_secret"
```

## 🔒 安全最佳实践

### 1. 修改默认凭据

- ✅ 修改 `src/endpoints/admin.js` 中的管理员账号密码
- ✅ 使用强密码（至少 16 位，包含大小写字母、数字、特殊字符）
- ✅ 定期更换密码

### 2. 使用 HTTPS

- ✅ 生产环境必须使用 HTTPS
- ✅ 使用 Let's Encrypt 免费证书
- ✅ 配置 HSTS 头

### 3. 配置防火墙

```bash
# UFW (Ubuntu)
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable

# 如果直接暴露应用端口
sudo ufw allow 8000/tcp
```

### 4. 限制访问

- ✅ 使用反向代理，不直接暴露应用端口
- ✅ 配置 `whitelistMode` 或使用反向代理的访问控制
- ✅ 启用 CSRF 保护

### 5. 数据备份

```bash
# 备份数据目录
tar -czf backup-$(date +%Y%m%d).tar.gz data/

# 定期备份（添加到 crontab）
0 2 * * * cd /path/to/chloe && tar -czf /backups/chloe-$(date +\%Y\%m\%d).tar.gz data/
```

### 6. 日志监控

```bash
# 使用 PM2 查看日志
pm2 logs chloe

# 或查看文件日志
tail -f server.log
tail -f /var/log/nginx/chloe_error.log
```

## 🔍 故障排查

### 问题 1：无法访问

**症状**：访问 URL 时连接超时或拒绝连接

**解决方案**：
1. 检查应用是否运行：`pm2 status` 或 `docker ps`
2. 检查端口是否监听：`netstat -tlnp | grep 8000`
3. 检查防火墙：`sudo ufw status`
4. 检查配置：确保 `listen: true`

### 问题 2：OAuth 回调失败

**症状**：OAuth 登录后返回错误

**解决方案**：
1. 检查 `redirectUri` 配置是否与 OAuth 应用设置一致
2. 确保使用 HTTPS（大多数 OAuth 提供商要求）
3. 检查 OAuth 凭据是否正确
4. 查看服务器日志获取详细错误

### 问题 3：权限错误

**症状**：无法写入文件或读取目录

**解决方案**：
```bash
# 确保数据目录权限正确
sudo chown -R $USER:$USER data/
chmod -R 755 data/
```

### 问题 4：性能问题

**症状**：响应缓慢或超时

**解决方案**：
1. 增加服务器资源（RAM/CPU）
2. 启用缓存：`useDiskCache: true`
3. 调整 Node.js 内存限制：`node --max-old-space-size=4096 server.js`
4. 使用 CDN 加速静态资源

## 📊 监控和维护

### 使用 PM2 监控

```bash
# 查看状态
pm2 status

# 查看日志
pm2 logs chloe

# 重启应用
pm2 restart chloe

# 查看资源使用
pm2 monit
```

### 系统资源监控

```bash
# 安装 htop
sudo apt install htop
htop

# 磁盘使用
df -h
du -sh data/*

# 内存使用
free -h
```

### 日志轮转

配置 logrotate：

```bash
sudo nano /etc/logrotate.d/chloe
```

添加：

```
/path/to/chloe/server.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
    create 0644 user user
}
```

## 📈 性能优化

### 1. Node.js 优化

```bash
# 增加内存限制
node --max-old-space-size=4096 server.js

# 使用生产模式
NODE_ENV=production npm start
```

### 2. 数据库优化

```yaml
# config.yaml
performance:
  lazyLoadCharacters: true
  memoryCacheCapacity: '200mb'
  useDiskCache: true
```

### 3. 网络优化

- 启用 gzip 压缩（反向代理层）
- 使用 CDN 加速静态资源
- 启用 HTTP/2

## 🆙 更新和升级

### 更新应用

```bash
# 拉取最新代码
git pull origin main

# 安装新依赖
npm install

# 重启应用
pm2 restart chloe

# 或 Docker
docker compose -f docker/docker-compose.yml restart
```

### 数据迁移

在升级前备份数据：

```bash
cp -r data/ data.backup/
```

## 📞 获取帮助

如果遇到问题：

1. 查看日志文件
2. 检查 GitHub Issues
3. 参考原始 SillyTavern 文档：https://docs.sillytavern.app/

## ⚠️ 注意事项

1. **不要在互联网上公开没有认证保护的实例**
2. **定期备份数据目录**
3. **保持系统和依赖更新**
4. **监控服务器资源使用**
5. **使用强密码和安全配置**
6. **遵守相关法律法规和服务条款**

## 📋 部署检查清单

- [ ] Node.js 18+ 已安装
- [ ] 依赖已安装（npm install）
- [ ] config.yaml 已配置
- [ ] 管理员凭据已修改
- [ ] OAuth 应用已配置（如使用）
- [ ] 防火墙规则已设置
- [ ] HTTPS 已配置（生产环境）
- [ ] 反向代理已配置（生产环境）
- [ ] 日志监控已设置
- [ ] 备份策略已制定
- [ ] 测试所有功能是否正常

---

祝部署顺利！🎉

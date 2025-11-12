# Chloe - 增强版 SillyTavern

基于 [SillyTavern](https://github.com/SillyTavern/SillyTavern) 的增强版本，添加了 OAuth 登录、用户管理和积分系统。

## ✨ 新增功能

### 🔐 OAuth 登录系统
- 支持 Discord OAuth 登录
- 支持 LinuxDo OAuth 登录
- 安全的状态验证和会话管理
- 自动创建用户账户

### 👥 用户账户系统
- 多用户支持，每个用户独立的数据存储
- 用户积分系统
- 签到功能
- 兑换码系统

### 🎨 用户界面增强
- 现代化的登录页面（`/oauth.html`）
- 用户主页界面（`/home.html`）
- 管理员控制面板（`/admin.html`）
- 像素风格设计

### ⚙️ 管理功能
- 用户管理（查看、删除、重置密码）
- 兑换码管理（生成、查看使用情况）
- 注册开关控制
- 系统统计信息

## 📋 系统要求

- Node.js 18 或更高版本
- 至少 4GB RAM
- 10GB 可用磁盘空间

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置

复制 `default/config.yaml` 到项目根目录的 `config.yaml`，并根据需要修改配置：

```yaml
# 启用多用户模式
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

**⚠️ 重要安全提示：**
- 请修改 `src/endpoints/admin.js` 中的管理员凭据
- 不要将包含敏感信息的 `config.yaml` 提交到版本控制
- 使用强密码和安全的密钥

### 3. 启动服务

```bash
npm start
```

服务将在 `http://localhost:8000` 启动。

## 🔧 配置 OAuth

### Discord OAuth

1. 访问 [Discord Developer Portal](https://discord.com/developers/applications)
2. 创建新应用
3. 在 OAuth2 设置中添加回调 URL：`https://your-domain.com/oauth`
4. 复制 Client ID 和 Client Secret 到配置文件

### LinuxDo OAuth

1. 在 LinuxDo 平台申请 OAuth 应用
2. 配置回调 URL：`https://your-domain.com/oauth`
3. 将凭据添加到配置文件

## 📁 项目结构

```
.
├── src/
│   ├── oauth.js              # OAuth 登录逻辑
│   ├── endpoints/
│   │   ├── admin.js          # 管理员接口
│   │   └── account.js        # 用户账户接口
│   └── ...
├── public/
│   ├── home.html             # 用户主页
│   ├── oauth.html            # OAuth 登录页
│   ├── admin.html            # 管理面板
│   └── ...
├── ops/
│   └── Caddyfile             # Caddy 反向代理配置
└── default/
    └── config.yaml           # 配置模板
```

## 🛠️ 开发

```bash
# 开发模式（带调试）
npm run debug

# 代码检查
npm run lint

# 自动修复代码风格
npm run lint:fix
```

## 🐳 Docker 部署

```bash
docker compose -f docker/docker-compose.yml up -d
```

## 📚 API 端点

### 用户端点
- `GET /api/account/info` - 获取账户信息
- `POST /api/account/checkin` - 签到
- `POST /api/account/redeem` - 使用兑换码

### 管理员端点
- `GET /api/admin/users` - 获取用户列表
- `POST /api/admin/redeem-codes` - 生成兑换码
- `POST /api/admin/toggle-registration` - 切换注册开关

### OAuth 端点
- `GET /login/:provider` - 发起 OAuth 登录
- `GET /oauth` - OAuth 回调处理

## 🔒 安全性

1. **管理员凭据**：修改 `src/endpoints/admin.js` 中的硬编码凭据
2. **CSRF 保护**：生产环境务必保持启用
3. **SSL/TLS**：生产环境建议启用 HTTPS
4. **密钥管理**：使用环境变量或密钥管理服务存储敏感信息

## 📖 文档

详细部署文档请参考 [DEPLOYMENT.md](./DEPLOYMENT.md)

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

本项目基于 AGPL-3.0 许可证开源。

## 🙏 致谢

- [SillyTavern](https://github.com/SillyTavern/SillyTavern) - 原始项目
- 所有贡献者和支持者

## ⚠️ 免责声明

本项目仅供学习和研究使用，请勿用于非法用途。使用本项目所造成的一切后果由使用者自行承担。

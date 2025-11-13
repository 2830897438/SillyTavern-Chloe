import crypto from 'node:crypto';

import storage from 'node-persist';
import express from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { getIpFromRequest, getRealIpFromHeader } from '../express-common.js';
import { Cache, getConfigValue } from '../util.js';
import { getUserDirectories, toKey, getPasswordHash, getPasswordSalt } from '../users.js';
import { checkForNewContent } from './content-manager.js';
import { isRegistrationEnabled } from './admin.js';

const PREFER_REAL_IP_HEADER = getConfigValue('rateLimiting.preferRealIpHeader', false, 'boolean');
const MFA_CACHE = new Cache(5 * 60 * 1000);

const getIpAddress = (request) => PREFER_REAL_IP_HEADER ? getRealIpFromHeader(request) : getIpFromRequest(request);

// 用户名黑名单
const USERNAME_BLACKLIST = new Set([
    'admin', 'administrator', 'root', 'system', 'moderator', 'mod',
    'owner', 'support', 'help', 'service', 'api', 'www', 'ftp',
    'mail', 'email', 'webmaster', 'postmaster', 'hostmaster',
    'null', 'undefined', 'none', 'test', 'demo', 'guest',
    'anonymous', 'bot', 'robot', 'official', 'staff',
]);

export const router = express.Router();
const loginLimiter = new RateLimiterMemory({ points: 5, duration: 60 });

// 为登录页提供“隐式登录”模式：返回 204 让前端展示手动输入用户名/密码
router.post('/list', async (_request, response) => response.sendStatus(204));

// 用户名/密码登录
router.post('/login', async (request, response) => {
    try {
        const ip = getIpAddress(request);
        await loginLimiter.consume(ip);
    } catch {
        return response.status(429).json({ error: '尝试过于频繁，请稍后重试' });
    }

    try {
        const { handle, password } = request.body || {};
        if (!handle || typeof handle !== 'string') {
            return response.status(400).json({ error: '缺少用户名' });
        }
        if (typeof password !== 'string') {
            return response.status(400).json({ error: '缺少密码' });
        }

        const key = toKey(String(handle).toLowerCase());
        /** @type {{ enabled: boolean; password: string; salt: string } | undefined} */
        const user = await storage.getItem(key);
        if (!user || user.enabled === false) {
            return response.status(403).json({ error: '用户不存在或已被禁用' });
        }
        const ok = user.password && user.salt && user.password === getPasswordHash(password, user.salt);
        if (!ok) {
            return response.status(401).json({ error: '用户名或密码错误' });
        }
        if (request.session) {
            request.session.handle = handle.toLowerCase();
            request.session.touch = Date.now();
        }
        return response.json({ handle: handle.toLowerCase() });
    } catch (error) {
        console.error('Password login failed:', error);
        return response.status(500).json({ error: '登录失败' });
    }
});

// 使用邀请码注册
// 注意：邀请码注册不受 isRegistrationEnabled() 限制
// 邀请码本身就是访问控制机制 - 管理员可以通过不生成/删除邀请码来控制注册
router.post('/register', async (request, response) => {
    try {
        const { code, handle, password, name } = request.body || {};
        if (!code || typeof code !== 'string') {
            return response.status(400).json({ error: '请输入邀请码' });
        }
        if (!handle || typeof handle !== 'string') {
            return response.status(400).json({ error: '请输入用户名' });
        }
        if (!password || typeof password !== 'string' || password.length < 6) {
            return response.status(400).json({ error: '请设置不少于 6 位的密码' });
        }

        // 校验并规范化用户名（仅允许 a-z0-9-_）
        const normHandle = handle.toLowerCase()
            .replace(/[^a-z0-9-_]/g, '-')
            .replace(/-{2,}/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);
        const finalHandle = normHandle || `user-${crypto.randomBytes(3).toString('hex')}`;

        // 检查用户名长度
        if (finalHandle.length < 3) {
            return response.status(400).json({ error: '用户名至少需要 3 个字符' });
        }

        // 检查用户名是否在黑名单中
        if (USERNAME_BLACKLIST.has(finalHandle)) {
            return response.status(400).json({ error: '该用户名不可用，请选择其他用户名' });
        }

        // 检查用户名是否包含敏感词
        const sensitivePatterns = ['admin', 'moderator', 'support', 'official'];
        if (sensitivePatterns.some(pattern => finalHandle.includes(pattern))) {
            return response.status(400).json({ error: '用户名包含保留关键词，请选择其他用户名' });
        }

        // 校验邀请码
        const inviteKey = `invite:${code.toUpperCase()}`;
        /** @type {{ code:string, used:boolean, usedBy:string|null, usedAt:number|null, createdAt:number, expiresAt:number|null }} */
        const invite = await storage.getItem(inviteKey);
        if (!invite) {
            return response.status(404).json({ error: '邀请码不存在' });
        }
        if (invite.used) {
            return response.status(400).json({ error: '邀请码已被使用' });
        }
        // 检查邀请码是否过期
        if (invite.expiresAt && invite.expiresAt < Date.now()) {
            return response.status(400).json({ error: '邀请码已过期' });
        }

        // 检查重名
        const userKey = toKey(finalHandle);
        const exists = await storage.getItem(userKey);
        if (exists) {
            return response.status(409).json({ error: '该用户名已被占用' });
        }

        // 创建用户
        const salt = getPasswordSalt();
        const user = {
            handle: finalHandle,
            name: typeof name === 'string' && name.trim() ? String(name).trim() : finalHandle,
            created: Date.now(),
            password: getPasswordHash(password, salt),
            salt,
            admin: false,
            enabled: true,
        };
        await storage.setItem(userKey, user);

        // 初始化目录并写入默认内容
        const dirs = getUserDirectories(finalHandle);
        try {
            await checkForNewContent([dirs]);
        } catch (err) {
            console.warn('Failed to seed default content for newly registered user', finalHandle, err?.message || err);
        }

        // 标记邀请码已使用
        invite.used = true;
        invite.usedBy = finalHandle;
        invite.usedAt = Date.now();
        await storage.setItem(inviteKey, invite);

        // 写入会话
        if (request.session) {
            request.session.handle = finalHandle;
            request.session.touch = Date.now();
        }

        return response.json({ success: true, handle: finalHandle });
    } catch (error) {
        console.error('Registration failed:', error);
        return response.status(500).json({ error: '注册失败，请稍后重试' });
    }
});

// 保持找回密码禁用（如需启用，可实现对应流程）
router.post('/recover-step1', async (_request, response) => response.sendStatus(404));
router.post('/recover-step2', async (_request, response) => response.sendStatus(404));

// 获取系统统计信息（公开接口）
router.get('/stats', async (_request, response) => {
    try {
        const keys = await storage.keys();
        const userKeys = keys.filter(key => key.startsWith('user:'));
        const userCount = userKeys.length;

        return response.json({
            userCount,
            timestamp: Date.now(),
        });
    } catch (error) {
        console.error('Get stats error:', error);
        return response.status(500).json({ error: '获取统计信息失败' });
    }
});

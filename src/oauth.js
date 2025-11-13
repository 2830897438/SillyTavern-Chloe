import crypto from 'node:crypto';
import fs from 'node:fs';
import yaml from 'yaml';

import express from 'express';
import storage from 'node-persist';

import { getConfigValue } from './util.js';
import { getUserDirectories, toKey } from './users.js';
import { checkForNewContent } from './endpoints/content-manager.js';
import { isRegistrationEnabled } from './endpoints/admin.js';

/**
 * OAuth router providing login initiation and callback handling.
 */
export const router = express.Router();

function getRedirectUri() {
    const uri = getConfigValue('oauth.redirectUri', 'http://localhost:8000/oauth');
    return String(uri || 'http://localhost:8000/oauth');
}

function getDiscordConfig() {
    return {
        clientId: String(getConfigValue('oauth.discord.clientId', process.env.DISCORD_CLIENT_ID || '')),
        clientSecret: String(getConfigValue('oauth.discord.clientSecret', process.env.DISCORD_CLIENT_SECRET || '')),
        authorizeUrl: 'https://discord.com/oauth2/authorize',
        tokenUrl: 'https://discord.com/api/oauth2/token',
        userInfoUrl: 'https://discord.com/api/users/@me',
        scope: 'identify email',
    };
}

function getLinuxdoConfig() {
    return {
        clientId: String(getConfigValue('oauth.linuxdo.clientId', process.env.LINUXDO_CLIENT_ID || '')),
        clientSecret: String(getConfigValue('oauth.linuxdo.clientSecret', process.env.LINUXDO_CLIENT_SECRET || '')),
        authorizeUrl: String(getConfigValue('oauth.linuxdo.authorizeUrl', process.env.LINUXDO_AUTHORIZE_URL || 'https://connect.linux.do/oauth2/authorize')),
        tokenUrl: String(getConfigValue('oauth.linuxdo.tokenUrl', process.env.LINUXDO_TOKEN_URL || 'https://connect.linux.do/oauth2/token')),
        userInfoUrl: String(getConfigValue('oauth.linuxdo.userInfoUrl', process.env.LINUXDO_USERINFO_URL || 'https://connect.linux.do/api/user')),
        scope: String(getConfigValue('oauth.linuxdo.scope', process.env.LINUXDO_SCOPE || 'openid profile email')),
    };
}

function createState() {
    return crypto.randomBytes(16).toString('hex');
}

function sanitizeHandle(raw) {
    return String(raw || '')
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 64) || `user-${crypto.randomBytes(3).toString('hex')}`;
}

/**
 * 验证邀请码是否有效
 * @param {string} code - 邀请码
 * @returns {Promise<boolean>} - 是否有效
 */
async function validateInviteCode(code) {
    if (!code || typeof code !== 'string') {
        return false;
    }

    const inviteKey = `invite:${code.toUpperCase()}`;
    const invite = await storage.getItem(inviteKey);

    if (!invite) {
        return false;
    }

    if (invite.used) {
        return false;
    }

    // 检查是否过期
    if (invite.expiresAt && invite.expiresAt < Date.now()) {
        return false;
    }

    return true;
}

/**
 * 标记邀请码为已使用
 * @param {string} code - 邀请码
 * @param {string} usedBy - 使用者用户名
 */
async function markInviteCodeAsUsed(code, usedBy) {
    const inviteKey = `invite:${code.toUpperCase()}`;
    const invite = await storage.getItem(inviteKey);

    if (invite) {
        invite.used = true;
        invite.usedBy = usedBy;
        invite.usedAt = Date.now();
        await storage.setItem(inviteKey, invite);
    }
}

async function ensureUser(handle, name, inviteCode = null) {
    const key = toKey(handle);
    const existing = await storage.getItem(key);

    if (!existing) {
        // 检查是否允许注册
        const registrationAllowed = await isRegistrationEnabled();

        // 如果提供了有效的邀请码，则允许注册（即使注册开关关闭）
        const hasValidInviteCode = inviteCode ? await validateInviteCode(inviteCode) : false;

        if (!registrationAllowed && !hasValidInviteCode) {
            throw new Error('REGISTRATION_DISABLED');
        }

        const user = {
            handle,
            name: name || handle,
            created: Date.now(),
            password: '',
            admin: false,
            enabled: true,
            salt: '',
        };
        await storage.setItem(key, user);

        // 如果使用了邀请码，标记为已使用
        if (hasValidInviteCode) {
            await markInviteCodeAsUsed(inviteCode, handle);
        }
    }

    // Ensure directories exist
    const dirs = getUserDirectories(handle);
    for (const dir of Object.values(dirs)) {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    // Seed default content (including settings.json) if missing
    try {
        await checkForNewContent([dirs]);
    } catch (e) {
        console.warn('Failed to seed default content for user', handle, e?.message || e);
    }
}

async function retireDefaultAdmin() {
    try {
        const key = toKey('default-user');
        const user = await storage.getItem(key);
        if (user && user.admin && !user.password) {
            user.enabled = false;
            user.admin = false;
            await storage.setItem(key, user);
        }
    } catch (err) {
        console.warn('Failed to retire default admin:', err?.message || err);
    }
}

async function disableSecurityOverrideInConfig() {
    try {
        const configPath = globalThis?.COMMAND_LINE_ARGS?.configPath || './config.yaml';
        if (!fs.existsSync(configPath)) return;

        const raw = fs.readFileSync(configPath, 'utf8');
        const cfg = yaml.parse(raw);
        if (cfg && cfg.securityOverride === true) {
            cfg.securityOverride = false;
            fs.writeFileSync(configPath, yaml.stringify(cfg), 'utf8');
            process.env.SILLYTAVERN_SECURITYOVERRIDE = 'false';
            console.log('securityOverride has been disabled automatically after first OAuth login.');
        }
    } catch (err) {
        console.warn('Failed to disable securityOverride automatically:', err?.message || err);
    }
}

// Initiate Discord OAuth
router.get('/auth/discord', async (req, res) => {
    try {
        const cfg = getDiscordConfig();
        const redirectUri = getRedirectUri();

        if (!cfg.clientId) {
            return res.status(500).send('Discord OAuth is not configured (missing clientId).');
        }

        const state = createState();
        // 从 query 参数获取邀请码（如果有）
        const inviteCode = req.query.invite || '';

        if (req.session) {
            req.session.oauthState = state;
            req.session.oauthProvider = 'discord';
            req.session.oauthInviteCode = inviteCode || null; // 保存邀请码到 session
            req.session.touch = Date.now();
        }

        const params = new URLSearchParams({
            client_id: cfg.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: cfg.scope,
            state,
        });
        const url = `${cfg.authorizeUrl}?${params.toString()}`;
        return res.redirect(url);
    } catch (err) {
        console.error('Discord auth init failed', err);
        return res.sendStatus(500);
    }
});

// Initiate LinuxDo OAuth
router.get('/auth/linuxdo', async (req, res) => {
    try {
        const cfg = getLinuxdoConfig();
        const redirectUri = getRedirectUri();

        if (!cfg.clientId || !cfg.authorizeUrl) {
            return res.status(500).send('LinuxDo OAuth is not configured (missing clientId/authorizeUrl).');
        }

        const state = createState();
        // 从 query 参数获取邀请码（如果有）
        const inviteCode = req.query.invite || '';

        if (req.session) {
            req.session.oauthState = state;
            req.session.oauthProvider = 'linuxdo';
            req.session.oauthInviteCode = inviteCode || null; // 保存邀请码到 session
            req.session.touch = Date.now();
        }

        const params = new URLSearchParams({
            client_id: cfg.clientId,
            response_type: 'code',
            redirect_uri: redirectUri,
            scope: cfg.scope,
            state,
        });
        const url = `${cfg.authorizeUrl}?${params.toString()}`;
        return res.redirect(url);
    } catch (err) {
        console.error('LinuxDo auth init failed', err);
        return res.sendStatus(500);
    }
});

// OAuth callback: /oauth?code=...&state=...
router.get('/oauth', async (req, res) => {
    try {
        const code = String(req.query.code || '');
        const state = String(req.query.state || '');
        const provider = req.session?.oauthProvider || '';
        const sessionState = req.session?.oauthState || '';

        if (!code || !provider) {
            return res.status(400).send('Invalid OAuth response');
        }

        if (!sessionState || state !== sessionState) {
            return res.status(400).send('OAuth state mismatch');
        }

        const redirectUri = getRedirectUri();
        // 从 session 获取邀请码
        const inviteCode = req.session?.oauthInviteCode || null;

        if (provider === 'discord') {
            const cfg = getDiscordConfig();
            // Exchange code for token
            const body = new URLSearchParams({
                client_id: cfg.clientId,
                client_secret: cfg.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            });

            const tokenResp = await fetch(cfg.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            if (!tokenResp.ok) {
                const text = await tokenResp.text();
                console.error('Discord token exchange failed', tokenResp.status, text);
                return res.status(500).send('Token exchange failed');
            }
            const token = await tokenResp.json();

            const meResp = await fetch(cfg.userInfoUrl, {
                headers: { Authorization: `Bearer ${token.access_token}` },
            });
            if (!meResp.ok) {
                const text = await meResp.text();
                console.error('Discord userinfo failed', meResp.status, text);
                return res.status(500).send('User info fetch failed');
            }
            const me = await meResp.json();
            const discordId = String(me.id || '').trim();
            const baseHandle = sanitizeHandle(`discord-${discordId || crypto.randomBytes(2).toString('hex')}`);
            const displayName = me.global_name || me.username || 'Discord 用户';

            try {
                await ensureUser(baseHandle, displayName, inviteCode);

                if (req.session) {
                    req.session.handle = baseHandle;
                    req.session.touch = Date.now();
                    // clear one-time oauth fields
                    req.session.oauthState = null;
                    req.session.oauthProvider = null;
                    req.session.oauthInviteCode = null;
                }
                await retireDefaultAdmin();
                await disableSecurityOverrideInConfig();
                return res.redirect('/');
            } catch (err) {
                if (err.message === 'REGISTRATION_DISABLED') {
                    // 保存OAuth用户信息到session，等待邀请码
                    if (req.session) {
                        req.session.pendingOAuth = {
                            provider: 'discord',
                            handle: baseHandle,
                            name: displayName,
                            timestamp: Date.now(),
                        };
                    }
                    // 重定向到oauth页面，带上需要邀请码的标记
                    return res.redirect('/oauth.html?needInvite=true');
                }
                throw err;
            }
        }

        if (provider === 'linuxdo') {
            const cfg = getLinuxdoConfig();
            if (!cfg.tokenUrl || !cfg.userInfoUrl) {
                return res.status(500).send('LinuxDo OAuth endpoints not configured');
            }

            const body = new URLSearchParams({
                client_id: cfg.clientId,
                client_secret: cfg.clientSecret,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri,
            });

            const tokenResp = await fetch(cfg.tokenUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body,
            });
            if (!tokenResp.ok) {
                const text = await tokenResp.text();
                console.error('LinuxDo token exchange failed', tokenResp.status, text);
                return res.status(500).send('Token exchange failed');
            }
            const token = await tokenResp.json();

            const meResp = await fetch(cfg.userInfoUrl, {
                headers: { Authorization: `Bearer ${token.access_token}` },
            });
            if (!meResp.ok) {
                const text = await meResp.text();
                console.error('LinuxDo userinfo failed', meResp.status, text);
                return res.status(500).send('User info fetch failed');
            }
            const me = await meResp.json();
            const displayName = me.username || me.name || me.preferred_username || 'LinuxDo 用户';
            const possibleId = String(me.id || me.sub || '').trim();
            const baseHandle = sanitizeHandle(`linuxdo-${possibleId || crypto.randomBytes(2).toString('hex')}`);

            try {
                await ensureUser(baseHandle, displayName, inviteCode);

                if (req.session) {
                    req.session.handle = baseHandle;
                    req.session.touch = Date.now();
                    req.session.oauthState = null;
                    req.session.oauthProvider = null;
                    req.session.oauthInviteCode = null;
                }
                await retireDefaultAdmin();
                await disableSecurityOverrideInConfig();
                return res.redirect('/');
            } catch (err) {
                if (err.message === 'REGISTRATION_DISABLED') {
                    // 保存OAuth用户信息到session，等待邀请码
                    if (req.session) {
                        req.session.pendingOAuth = {
                            provider: 'linuxdo',
                            handle: baseHandle,
                            name: displayName,
                            timestamp: Date.now(),
                        };
                    }
                    // 重定向到oauth页面，带上需要邀请码的标记
                    return res.redirect('/oauth.html?needInvite=true');
                }
                throw err;
            }
        }

        return res.status(400).send('Unknown OAuth provider');
    } catch (err) {
        console.error('OAuth callback failed', err);
        return res.sendStatus(500);
    }
});

// 完成带邀请码的OAuth注册
router.post('/auth/complete-oauth', async (req, res) => {
    try {
        const { inviteCode } = req.body || {};
        const pendingOAuth = req.session?.pendingOAuth;

        if (!pendingOAuth) {
            return res.status(400).json({ error: '没有待处理的OAuth注册' });
        }

        // 检查session是否过期（10分钟）
        const now = Date.now();
        if (now - pendingOAuth.timestamp > 10 * 60 * 1000) {
            delete req.session.pendingOAuth;
            return res.status(400).json({ error: 'OAuth会话已过期，请重新登录' });
        }

        if (!inviteCode || typeof inviteCode !== 'string') {
            return res.status(400).json({ error: '请输入邀请码' });
        }

        // 验证邀请码
        const isValid = await validateInviteCode(inviteCode);
        if (!isValid) {
            return res.status(400).json({ error: '邀请码无效或已过期' });
        }

        // 完成用户注册
        await ensureUser(pendingOAuth.handle, pendingOAuth.name, inviteCode);

        // 设置session
        if (req.session) {
            req.session.handle = pendingOAuth.handle;
            req.session.touch = Date.now();
            delete req.session.pendingOAuth;
        }

        await retireDefaultAdmin();
        await disableSecurityOverrideInConfig();

        return res.json({ success: true, message: '注册成功' });
    } catch (err) {
        console.error('Complete OAuth with invite code failed', err);
        return res.status(500).json({ error: '注册失败，请稍后重试' });
    }
});

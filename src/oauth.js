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

async function ensureUser(handle, name) {
    const key = toKey(handle);
    const existing = await storage.getItem(key);

    if (!existing) {
        // 检查是否允许注册
        const registrationAllowed = await isRegistrationEnabled();
        if (!registrationAllowed) {
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
        if (req.session) {
            req.session.oauthState = state;
            req.session.oauthProvider = 'discord';
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
        if (req.session) {
            req.session.oauthState = state;
            req.session.oauthProvider = 'linuxdo';
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
            await ensureUser(baseHandle, me.global_name || me.username || 'Discord 用户');

            if (req.session) {
                req.session.handle = baseHandle;
                req.session.touch = Date.now();
                // clear one-time oauth fields
                req.session.oauthState = null;
                req.session.oauthProvider = null;
            }
            await retireDefaultAdmin();
            await disableSecurityOverrideInConfig();
            return res.redirect('/');
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
            const possibleName = me.username || me.name || me.preferred_username || 'LinuxDo 用户';
            const possibleId = String(me.id || me.sub || '').trim();
            const baseHandle = sanitizeHandle(`linuxdo-${possibleId || crypto.randomBytes(2).toString('hex')}`);
            await ensureUser(baseHandle, possibleName);

            if (req.session) {
                req.session.handle = baseHandle;
                req.session.touch = Date.now();
                req.session.oauthState = null;
                req.session.oauthProvider = null;
            }
            await retireDefaultAdmin();
            await disableSecurityOverrideInConfig();
            return res.redirect('/');
        }

        return res.status(400).send('Unknown OAuth provider');
    } catch (err) {
        console.error('OAuth callback failed', err);
        if (err.message === 'REGISTRATION_DISABLED') {
            return res.status(403).send('<!DOCTYPE html><html><head><meta charset="utf-8"><title>注册已关闭</title><style>body{font-family:sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f5f5f5}div{background:white;padding:40px;border-radius:8px;box-shadow:0 2px 10px rgba(0,0,0,0.1);text-align:center;max-width:400px}h1{color:#d32f2f;margin:0 0 20px}p{color:#666;line-height:1.6;margin:0}</style></head><body><div><h1>⚠️ 注册已关闭</h1><p>抱歉，系统管理员已关闭新用户注册功能。</p><p style="margin-top:20px">如有疑问，请联系管理员。</p></div></body></html>');
        }
        return res.sendStatus(500);
    }
});

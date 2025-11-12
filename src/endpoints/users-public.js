import crypto from 'node:crypto';

import storage from 'node-persist';
import express from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { getIpFromRequest, getRealIpFromHeader } from '../express-common.js';
import { color, Cache, getConfigValue } from '../util.js';
import { KEY_PREFIX, getUserAvatar, toKey, getPasswordHash, getPasswordSalt } from '../users.js';

const DISCREET_LOGIN = getConfigValue('enableDiscreetLogin', false, 'boolean');
const PREFER_REAL_IP_HEADER = getConfigValue('rateLimiting.preferRealIpHeader', false, 'boolean');
const MFA_CACHE = new Cache(5 * 60 * 1000);

const getIpAddress = (request) => PREFER_REAL_IP_HEADER ? getRealIpFromHeader(request) : getIpFromRequest(request);

export const router = express.Router();
const loginLimiter = new RateLimiterMemory({
    points: 5,
    duration: 60,
});
const recoverLimiter = new RateLimiterMemory({
    points: 5,
    duration: 300,
});

// OAuth-only 模式：禁用原有用户列表查询
router.post('/list', async (_request, response) => response.sendStatus(404));

// OAuth-only 模式：禁用原有用户名/密码登录
router.post('/login', async (_request, response) => response.sendStatus(404));

// OAuth-only 模式：禁用找回密码
router.post('/recover-step1', async (_request, response) => response.sendStatus(404));

router.post('/recover-step2', async (_request, response) => response.sendStatus(404));

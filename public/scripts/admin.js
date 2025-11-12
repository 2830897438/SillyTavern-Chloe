/* ═══════════════════════════════════════════════════════════════
   ADMIN PANEL JAVASCRIPT
   ═══════════════════════════════════════════════════════════════ */

// ═══════════════════════════════════════════════════════════════
// UTILITIES
// ═══════════════════════════════════════════════════════════════

const qs = (selector) => document.querySelector(selector);
const qsa = (selector) => document.querySelectorAll(selector);

let csrfToken = null;

async function getCsrfToken() {
    if (csrfToken) return csrfToken;

    try {
        const response = await fetch('/csrf-token');
        const data = await response.json();
        csrfToken = data.token;
        return csrfToken;
    } catch (error) {
        console.error('Failed to get CSRF token:', error);
        return null;
    }
}

async function postJSON(url, data) {
    const token = await getCsrfToken();
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token && token !== 'disabled') {
        headers['X-CSRF-Token'] = token;
    }

    const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(data),
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw error;
    }

    return response.json();
}

async function getJSON(url) {
    const response = await fetch(url, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw error;
    }

    return response.json();
}

async function deleteJSON(url) {
    const token = await getCsrfToken();
    const headers = {
        'Content-Type': 'application/json'
    };

    if (token && token !== 'disabled') {
        headers['X-CSRF-Token'] = token;
    }

    const response = await fetch(url, {
        method: 'DELETE',
        headers: headers,
    });

    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: response.statusText }));
        throw error;
    }

    return response.json();
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
    });
}

// ═══════════════════════════════════════════════════════════════
// TOAST NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════

function showToast(type, title, message) {
    const container = qs('#toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `pixel-toast ${type}`;

    toast.innerHTML = `
        <div class="toast-header">
            <span class="toast-icon">${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
            <span class="toast-title">${title}</span>
            <button class="toast-close">✕</button>
        </div>
        <div class="toast-message">${message}</div>
        <div class="toast-progress"></div>
    `;

    const closeBtn = toast.querySelector('.toast-close');
    const progress = toast.querySelector('.toast-progress');

    closeBtn.addEventListener('click', () => {
        toast.remove();
    });

    container.appendChild(toast);

    // Animate progress bar
    if (window.Motion) {
        window.Motion.animate(
            progress,
            { scaleX: [1, 0] },
            { duration: 5, easing: 'linear' }
        );
    }

    // Auto remove after 5 seconds
    setTimeout(() => {
        toast.remove();
    }, 5000);
}

// ═══════════════════════════════════════════════════════════════
// CONFIRM DIALOG
// ═══════════════════════════════════════════════════════════════

function showConfirmDialog(title, message) {
    return new Promise((resolve) => {
        const dialog = qs('#confirmDialog');
        const titleEl = qs('#dialogTitle');
        const messageEl = qs('#dialogMessage');
        const confirmBtn = qs('#dialogConfirm');
        const cancelBtn = qs('#dialogCancel');

        titleEl.textContent = title;
        messageEl.textContent = message;
        dialog.classList.remove('hidden');

        const cleanup = () => {
            dialog.classList.add('hidden');
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            cleanup();
            resolve(true);
        };

        const onCancel = () => {
            cleanup();
            resolve(false);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// ═══════════════════════════════════════════════════════════════
// POINTS EDIT DIALOG
// ═══════════════════════════════════════════════════════════════

let currentEditUserHandle = null;

function showPointsDialog(userHandle) {
    return new Promise((resolve) => {
        currentEditUserHandle = userHandle;
        const dialog = qs('#pointsDialog');
        const actionSelect = qs('#pointsAction');
        const amountInput = qs('#pointsAmount');
        const confirmBtn = qs('#pointsConfirm');
        const cancelBtn = qs('#pointsCancel');

        actionSelect.value = 'add';
        amountInput.value = '10';
        dialog.classList.remove('hidden');

        const cleanup = () => {
            dialog.classList.add('hidden');
            currentEditUserHandle = null;
            confirmBtn.removeEventListener('click', onConfirm);
            cancelBtn.removeEventListener('click', onCancel);
        };

        const onConfirm = () => {
            const action = actionSelect.value;
            const amount = parseFloat(amountInput.value);
            cleanup();
            resolve({ action, amount });
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        confirmBtn.addEventListener('click', onConfirm);
        cancelBtn.addEventListener('click', onCancel);
    });
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════

async function handleLogin() {
    const usernameInput = qs('#adminUsername');
    const passwordInput = qs('#adminPassword');
    const errorDiv = qs('#loginError');
    const loginBtn = qs('#loginBtn');

    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();

    if (!username || !password) {
        errorDiv.textContent = '请输入用户名和密码';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        loginBtn.disabled = true;
        errorDiv.classList.add('hidden');

        const result = await postJSON('/api/admin/login', { username, password });

        if (result.success) {
            // Hide login screen and show dashboard
            qs('#loginScreen').classList.add('hidden');
            const app = qs('#app');
            app.classList.remove('hidden');

            // Force sidebar and topbar visibility
            const sidebar = qs('#sidebar');
            const topbar = qs('.top-bar');
            if (sidebar) {
                sidebar.style.opacity = '1';
                sidebar.style.display = 'flex';
            }
            if (topbar) {
                topbar.style.opacity = '1';
                topbar.style.display = 'flex';
            }

            // Setup navigation after app is visible
            setupNavigationHandlers();

            // Load initial data
            await loadDashboard();
            showToast('success', '登录成功', '欢迎回来，管理员！');
        }
    } catch (error) {
        errorDiv.textContent = error.error || '登录失败，请检查用户名和密码';
        errorDiv.classList.remove('hidden');
    } finally {
        loginBtn.disabled = false;
    }
}

async function handleLogout() {
    const confirmed = await showConfirmDialog('确认退出', '确定要退出管理后台吗？');
    if (!confirmed) return;

    try {
        await postJSON('/api/admin/logout', {});
        location.reload();
    } catch (error) {
        showToast('error', '退出失败', error.error || '退出失败');
    }
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

async function loadDashboard() {
    try {
        const stats = await getJSON('/api/admin/stats');

        qs('#totalUsers').textContent = stats.totalUsers || 0;
        qs('#activeUsers').textContent = stats.activeUsers || 0;
        qs('#totalStorage').textContent = stats.totalStorageFormatted || '0 B';
        qs('#totalPoints').textContent = stats.totalPoints || 0;
        qs('#totalCodes').textContent = stats.redeemCodes?.total || 0;
        qs('#usedCodes').textContent = stats.redeemCodes?.used || 0;
        qs('#unusedCodes').textContent = stats.redeemCodes?.unused || 0;

        // Load system config
        await loadSystemConfig();
    } catch (error) {
        console.error('Failed to load dashboard:', error);
        showToast('error', '加载失败', '无法加载系统统计信息');
    }
}

async function loadSystemConfig() {
    try {
        const config = await getJSON('/api/admin/config');
        const registrationToggle = qs('#registrationToggle');
        if (registrationToggle) {
            registrationToggle.checked = config.registrationEnabled !== false;
        }
    } catch (error) {
        console.error('Failed to load system config:', error);
    }
}

async function handleRegistrationToggle() {
    const registrationToggle = qs('#registrationToggle');
    if (!registrationToggle) return;

    const enabled = registrationToggle.checked;

    try {
        const result = await postJSON('/api/admin/config', {
            registrationEnabled: enabled,
        });

        showToast('success', '设置已更新', result.message || `注册功能已${enabled ? '开启' : '关闭'}`);
    } catch (error) {
        console.error('Failed to update registration setting:', error);
        showToast('error', '设置失败', error.error || '更新注册设置失败');
        // Revert toggle on error
        registrationToggle.checked = !enabled;
    }
}

// ═══════════════════════════════════════════════════════════════
// USER MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function loadUsers() {
    const loading = qs('#usersLoading');
    const table = qs('#usersTable');
    const tbody = qs('#usersTableBody');

    try {
        loading.classList.remove('hidden');
        table.classList.add('hidden');

        const data = await getJSON('/api/admin/users');
        const users = data.users || [];

        tbody.innerHTML = '';

        if (users.length === 0) {
            tbody.innerHTML = '<div class="table-row"><div class="table-cell" style="grid-column: 1 / -1; justify-content: center;">暂无用户</div></div>';
        } else {
            users.forEach(user => {
                const row = document.createElement('div');
                row.className = 'table-row';

                row.innerHTML = `
                    <div class="table-cell" data-label="用户">
                        <div class="user-info">
                            <div class="user-name">${escapeHtml(user.name)}</div>
                            <div class="user-handle">@${escapeHtml(user.handle)}</div>
                        </div>
                    </div>
                    <div class="table-cell" data-label="积分">${user.points}</div>
                    <div class="table-cell" data-label="访问">
                        <span class="status-badge ${user.accessOn ? 'on' : 'off'}">
                            ${user.accessOn ? '开启' : '关闭'}
                        </span>
                    </div>
                    <div class="table-cell" data-label="存储">${user.storageSizeFormatted}</div>
                    <div class="table-cell" data-label="状态">
                        <span class="status-badge ${user.enabled ? 'enabled' : 'disabled'}">
                            ${user.enabled ? '正常' : '封禁'}
                        </span>
                    </div>
                    <div class="table-cell" data-label="操作">
                        <div class="action-buttons">
                            <button class="pixel-button action-btn-small" data-action="points" data-handle="${escapeHtml(user.handle)}">
                                <span class="button-content"><span class="button-text">积分</span></span>
                            </button>
                            <button class="pixel-button action-btn-small" data-action="ban" data-handle="${escapeHtml(user.handle)}">
                                <span class="button-content"><span class="button-text">${user.enabled ? '封禁' : '解封'}</span></span>
                            </button>
                            <button class="pixel-button action-btn-small danger" data-action="delete" data-handle="${escapeHtml(user.handle)}">
                                <span class="button-content"><span class="button-text">删除数据</span></span>
                            </button>
                        </div>
                    </div>
                `;

                tbody.appendChild(row);
            });

            // Add event listeners to action buttons
            tbody.querySelectorAll('[data-action]').forEach(btn => {
                btn.addEventListener('click', handleUserAction);
            });
        }

        loading.classList.add('hidden');
        table.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load users:', error);
        showToast('error', '加载失败', '无法加载用户列表');
        loading.classList.add('hidden');
    }
}

async function handleUserAction(event) {
    const btn = event.currentTarget;
    const action = btn.dataset.action;
    const handle = btn.dataset.handle;

    if (action === 'points') {
        const result = await showPointsDialog(handle);
        if (result) {
            await modifyUserPoints(handle, result.action, result.amount);
        }
    } else if (action === 'ban') {
        const currentText = btn.textContent.trim();
        const isCurrentlyEnabled = currentText === '封禁';
        const confirmed = await showConfirmDialog(
            isCurrentlyEnabled ? '确认封禁' : '确认解封',
            `确定要${isCurrentlyEnabled ? '封禁' : '解封'}用户 ${handle} 吗？`
        );
        if (confirmed) {
            await toggleUserBan(handle);
        }
    } else if (action === 'delete') {
        const confirmed = await showConfirmDialog(
            '确认删除',
            `确定要删除用户 ${handle} 的所有数据吗？此操作不可恢复！`
        );
        if (confirmed) {
            await deleteUserData(handle);
        }
    }
}

async function modifyUserPoints(handle, action, amount) {
    try {
        const result = await postJSON(`/api/admin/users/${handle}/points`, { action, amount });
        showToast('success', '操作成功', result.message || '积分已修改');
        await loadUsers();
        await loadDashboard();
    } catch (error) {
        showToast('error', '操作失败', error.error || '修改积分失败');
    }
}

async function toggleUserBan(handle) {
    try {
        const result = await postJSON(`/api/admin/users/${handle}/toggle-ban`, {});
        showToast('success', '操作成功', result.message || '状态已更新');
        await loadUsers();
        await loadDashboard();
    } catch (error) {
        showToast('error', '操作失败', error.error || '操作失败');
    }
}

async function deleteUserData(handle) {
    try {
        const result = await deleteJSON(`/api/admin/users/${handle}/data`);
        showToast('success', '删除成功', result.message || '用户数据已删除');
        await loadUsers();
        await loadDashboard();
    } catch (error) {
        showToast('error', '删除失败', error.error || '删除用户数据失败');
    }
}

// ═══════════════════════════════════════════════════════════════
// REDEEM CODE MANAGEMENT
// ═══════════════════════════════════════════════════════════════

async function loadRedeemCodes() {
    const loading = qs('#codesLoading');
    const table = qs('#codesTable');
    const tbody = qs('#codesTableBody');

    try {
        loading.classList.remove('hidden');
        table.classList.add('hidden');

        const data = await getJSON('/api/admin/redeem-codes');
        const codes = data.codes || [];

        tbody.innerHTML = '';

        if (codes.length === 0) {
            tbody.innerHTML = '<div class="table-row"><div class="table-cell" style="grid-column: 1 / -1; justify-content: center;">暂无兑换码</div></div>';
        } else {
            codes.forEach(code => {
                const row = document.createElement('div');
                row.className = 'table-row';

                row.innerHTML = `
                    <div class="table-cell" data-label="兑换码">
                        <span class="code-text">${escapeHtml(code.code)}</span>
                    </div>
                    <div class="table-cell" data-label="积分">${code.points}</div>
                    <div class="table-cell" data-label="状态">
                        <span class="status-badge ${code.used ? 'used' : 'unused'}">
                            ${code.used ? '已使用' : '未使用'}
                        </span>
                    </div>
                    <div class="table-cell" data-label="使用者">${code.usedBy ? escapeHtml(code.usedBy) : '-'}</div>
                    <div class="table-cell" data-label="创建时间">
                        <span class="date-text">${formatDate(code.createdAt)}</span>
                    </div>
                    <div class="table-cell" data-label="操作">
                        ${!code.used ? `
                            <button class="pixel-button action-btn-small danger" data-action="delete-code" data-code="${escapeHtml(code.code)}">
                                <span class="button-content"><span class="button-text">删除</span></span>
                            </button>
                        ` : '-'}
                    </div>
                `;

                tbody.appendChild(row);
            });

            // Add event listeners to delete buttons
            tbody.querySelectorAll('[data-action="delete-code"]').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const code = e.currentTarget.dataset.code;
                    const confirmed = await showConfirmDialog(
                        '确认删除',
                        `确定要删除兑换码 ${code} 吗？`
                    );
                    if (confirmed) {
                        await deleteRedeemCode(code);
                    }
                });
            });
        }

        loading.classList.add('hidden');
        table.classList.remove('hidden');
    } catch (error) {
        console.error('Failed to load redeem codes:', error);
        showToast('error', '加载失败', '无法加载兑换码列表');
        loading.classList.add('hidden');
    }
}

async function createRedeemCodes() {
    const pointsInput = qs('#redeemPoints');
    const countInput = qs('#redeemCount');
    const createBtn = qs('#createRedeemBtn');

    const points = parseInt(pointsInput.value);
    const count = parseInt(countInput.value);

    if (!points || points <= 0) {
        showToast('error', '输入错误', '请输入有效的积分数量');
        return;
    }

    if (!count || count <= 0 || count > 100) {
        showToast('error', '输入错误', '生成数量必须在1-100之间');
        return;
    }

    try {
        createBtn.disabled = true;
        const result = await postJSON('/api/admin/redeem-codes', { points, count });

        showToast('success', '创建成功', result.message || `成功创建 ${count} 个兑换码`);

        // Reset inputs
        pointsInput.value = '10';
        countInput.value = '1';

        await loadRedeemCodes();
        await loadDashboard();
    } catch (error) {
        showToast('error', '创建失败', error.error || '创建兑换码失败');
    } finally {
        createBtn.disabled = false;
    }
}

async function deleteRedeemCode(code) {
    try {
        const result = await deleteJSON(`/api/admin/redeem-codes/${code}`);
        showToast('success', '删除成功', result.message || '兑换码已删除');
        await loadRedeemCodes();
        await loadDashboard();
    } catch (error) {
        showToast('error', '删除失败', error.error || '删除兑换码失败');
    }
}

// ═══════════════════════════════════════════════════════════════
// PAGE NAVIGATION
// ═══════════════════════════════════════════════════════════════

const PAGE_TITLES = {
    dashboard: '系统总览',
    users: '用户管理',
    redeem: '兑换码管理',
};

function switchPage(pageName) {
    // Update active nav item
    qsa('.nav-item').forEach(item => {
        if (item.dataset.page === pageName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });

    // Update active page
    qsa('.page').forEach(page => {
        if (page.id === `page-${pageName}`) {
            page.classList.add('active');
        } else {
            page.classList.remove('active');
        }
    });

    // Update page title
    qs('#currentPageTitle').textContent = PAGE_TITLES[pageName] || pageName;

    // Close sidebar on mobile
    const sidebar = qs('#sidebar');
    const overlay = qs('#sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('active');

    // Load page data
    if (pageName === 'users') {
        loadUsers();
    } else if (pageName === 'redeem') {
        loadRedeemCodes();
    } else if (pageName === 'dashboard') {
        loadDashboard();
    }
}

// ═══════════════════════════════════════════════════════════════
// EVENT HANDLERS
// ═══════════════════════════════════════════════════════════════

function setupNavigationHandlers() {
    // Logout
    const logoutBtn = qs('#logoutBtn');
    if (logoutBtn) {
        logoutBtn.removeEventListener('click', handleLogout);
        logoutBtn.addEventListener('click', handleLogout);
    }

    // Navigation
    qsa('.nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const pageName = item.dataset.page;
            if (pageName) {
                switchPage(pageName);
            }
        });
    });

    // Mobile menu toggle
    const menuToggle = qs('#menuToggle');
    const sidebar = qs('#sidebar');
    const sidebarOverlay = qs('#sidebarOverlay');
    const closeSidebar = qs('#closeSidebar');

    if (menuToggle && sidebar && sidebarOverlay) {
        menuToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            sidebarOverlay.classList.toggle('active');
        });

        sidebarOverlay.addEventListener('click', () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
        });

        if (closeSidebar) {
            closeSidebar.addEventListener('click', () => {
                sidebar.classList.remove('open');
                sidebarOverlay.classList.remove('active');
            });
        }
    }

    // Create redeem codes
    const createRedeemBtn = qs('#createRedeemBtn');
    if (createRedeemBtn) {
        createRedeemBtn.removeEventListener('click', createRedeemCodes);
        createRedeemBtn.addEventListener('click', createRedeemCodes);
    }

    // Registration toggle
    const registrationToggle = qs('#registrationToggle');
    if (registrationToggle) {
        registrationToggle.removeEventListener('change', handleRegistrationToggle);
        registrationToggle.addEventListener('change', handleRegistrationToggle);
    }
}

function setupEventHandlers() {
    // Login
    const loginBtn = qs('#loginBtn');
    const usernameInput = qs('#adminUsername');
    const passwordInput = qs('#adminPassword');

    if (loginBtn) {
        loginBtn.addEventListener('click', handleLogin);
    }

    if (usernameInput && passwordInput) {
        [usernameInput, passwordInput].forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    handleLogin();
                }
            });
        });
    }
}

// ═══════════════════════════════════════════════════════════════
// UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════════

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

function init() {
    setupEventHandlers();

    // Initialize animations if Motion is available
    if (window.Motion) {
        // Animate login screen elements
        const loginScreen = qs('#loginScreen');
        if (loginScreen && !loginScreen.classList.contains('hidden')) {
            window.Motion.animate(
                loginScreen.querySelector('.pixel-card'),
                { opacity: [0, 1], y: [20, 0] },
                { duration: 0.5, easing: 'ease-out' }
            );
        }
    }
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

// ═══════════════════════════════════════════════════════════════
// PIXEL ART ANIMATION SYSTEM - CHLOE OAUTH
// Enhanced with Motion One for smooth pixel-style animations
// ═══════════════════════════════════════════════════════════════

const { animate, stagger, timeline, inView } = window.Motion || {};

// ═══════════════════════════════════════════════════════════════
// PARTICLE SYSTEM - Floating pixel particles
// ═══════════════════════════════════════════════════════════════

class PixelParticleSystem {
    constructor(containerId, particleCount = 30) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.particles = [];
        this.particleCount = particleCount;
        this.init();
    }

    createParticle() {
        const particle = document.createElement('div');
        const size = Math.random() * 3 + 1;
        const startX = Math.random() * window.innerWidth;
        const startY = Math.random() * window.innerHeight;
        const duration = Math.random() * 10 + 15;
        const baseOpacity = Math.random() * 0.3 + 0.2;

        particle.style.cssText = `
            position: absolute;
            width: ${size}px;
            height: ${size}px;
            background: #000;
            left: ${startX}px;
            top: ${startY}px;
            opacity: ${baseOpacity};
            pointer-events: none;
            border-radius: ${Math.random() > 0.5 ? '50%' : '0'};
            will-change: transform, opacity;
        `;

        this.container.appendChild(particle);
        this.particles.push(particle);

        // Smooth infinite particle animation
        if (animate) {
            const moveY = Math.random() * 200 - 100;
            const moveX = Math.random() * 150 - 75;
            const opacityMax = Math.min(baseOpacity + 0.3, 0.6);

            animate(
                particle,
                {
                    y: [0, moveY],
                    x: [0, moveX],
                    opacity: [baseOpacity, opacityMax],
                    rotate: [0, Math.random() * 360],
                    scale: [1, 1.3]
                },
                {
                    duration,
                    easing: 'ease-in-out',
                    repeat: Infinity,
                    direction: 'alternate'
                }
            );
        }
    }

    init() {
        for (let i = 0; i < this.particleCount; i++) {
            setTimeout(() => this.createParticle(), i * 50);
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// VISITOR COUNTER ANIMATION
// ═══════════════════════════════════════════════════════════════

async function animateVisitorCounter() {
    const counterElement = document.querySelector('.count-number');
    if (!counterElement) return;

    // 获取真实用户数量
    let targetNumber = 100; // 默认值
    try {
        const res = await fetch('/api/users/stats');
        if (res.ok) {
            const data = await res.json();
            targetNumber = data.userCount || 100;
        }
    } catch (err) {
        console.warn('Failed to fetch user count:', err);
    }

    const chars = '█▓▒░0123456789';
    let frame = 0;
    const maxFrames = 30;

    const interval = setInterval(() => {
        if (frame >= maxFrames) {
            counterElement.textContent = targetNumber.toString();
            clearInterval(interval);
            return;
        }

        let scrambled = '';
        const numDigits = targetNumber.toString().length;
        for (let i = 0; i < numDigits; i++) {
            scrambled += chars[Math.floor(Math.random() * chars.length)];
        }
        counterElement.textContent = scrambled;
        frame++;
    }, 50);
}

// ═══════════════════════════════════════════════════════════════
// TYPING EFFECT FOR DESCRIPTIONS
// ═══════════════════════════════════════════════════════════════

function typewriterEffect(element, text, speed = 100) {
    if (!element) return;

    let i = 0;
    element.textContent = '';

    const timer = setInterval(() => {
        if (i < text.length) {
            element.textContent += text.charAt(i);
            i++;
        } else {
            clearInterval(timer);
        }
    }, speed);
}

// ═══════════════════════════════════════════════════════════════
// GLITCH EFFECT FOR TITLE
// ═══════════════════════════════════════════════════════════════

function createGlitchEffect() {
    const title = document.querySelector('.pixel-title');
    if (!title) return;

    setInterval(() => {
        if (Math.random() > 0.95) {
            title.style.transform = `translate(${Math.random() * 4 - 2}px, ${Math.random() * 4 - 2}px)`;
            setTimeout(() => {
                title.style.transform = 'translate(0, 0)';
            }, 50);
        }
    }, 100);
}

// ═══════════════════════════════════════════════════════════════
// BUTTON HOVER SOUND EFFECT (Visual feedback)
// ═══════════════════════════════════════════════════════════════

function addButtonEffects() {
    const buttons = document.querySelectorAll('.pixel-button');

    buttons.forEach(button => {
        button.addEventListener('mouseenter', () => {
            const icon = button.querySelector('.button-icon');
            if (icon && animate) {
                animate(icon, { x: [0, 5, 0] }, { duration: 0.3 });
            }
        });

        button.addEventListener('click', (e) => {
            const buttonText = button.querySelector('.button-text');
            if (buttonText) {
                buttonText.textContent = '连接中...';
            }

            // Create ripple effect
            const ripple = document.createElement('div');
            ripple.style.cssText = `
                position: absolute;
                width: 10px;
                height: 10px;
                background: #000;
                left: ${e.offsetX}px;
                top: ${e.offsetY}px;
                opacity: 0.5;
                pointer-events: none;
            `;
            button.appendChild(ripple);

            if (animate) {
                animate(
                    ripple,
                    {
                        width: [10, 100],
                        height: [10, 100],
                        opacity: [0.5, 0],
                        x: [-5, -50],
                        y: [-5, -50]
                    },
                    { duration: 0.6 }
                ).finished.then(() => ripple.remove());
            }
        });
    });
}

// ═══════════════════════════════════════════════════════════════
// MAIN ANIMATION SEQUENCE
// ═══════════════════════════════════════════════════════════════

function initializeAnimations() {
    if (!animate) {
        console.warn('Motion One not available, animations disabled');
        return;
    }

    try {
        // Simplified entrance animation - no transform conflicts
        const sequence = [
            // Grid fades in
            ['.pixel-grid', {
                opacity: [0, 0.15]
            }, { duration: 0.6, easing: 'ease-out' }],

            // Particles appear
            ['#particles', {
                opacity: [0, 1]
            }, { duration: 0.5, at: 0.15 }],

            // Card slides up smoothly
            ['.glitch-container', {
                opacity: [0, 1],
                y: [20, 0]
            }, { duration: 0.7, easing: 'ease-out', at: 0.25 }],

            // Logo fades in
            ['.logo-container', {
                opacity: [0, 1]
            }, { duration: 0.5, at: 0.4 }],

            // Title fades in
            ['.pixel-title', {
                opacity: [0, 1]
            }, { duration: 0.4, at: 0.55 }],

            // Subtitle fades
            ['.subtitle-container', {
                opacity: [0, 1]
            }, { duration: 0.4, at: 0.65 }],

            // Description fades
            ['.pixel-description', {
                opacity: [0, 1]
            }, { duration: 0.3, at: 0.75 }],

            // Buttons stagger in
            ['.pixel-button', {
                opacity: [0, 1],
                y: [10, 0]
            }, { duration: 0.4, delay: stagger(0.1), at: 0.85 }],

            // Footer line draws
            ['.footer-line', {
                scaleX: [0, 1]
            }, { duration: 0.5, easing: 'ease-out', at: 1.1 }],

            // Footer text
            ['.footer-text', {
                opacity: [0, 1]
            }, { duration: 0.3, at: 1.0 }],

            // Footer stats
            ['.footer-stats', {
                opacity: [0, 1]
            }, { duration: 0.3, at: 1.1 }],

            // Corner decorations
            ['.corner-decoration', {
                opacity: [0, 1]
            }, { duration: 0.3, delay: stagger(0.05), at: 1.2 }]
        ];

        timeline(sequence);

        // Continuous scanline animation
        animate('.scanline', {
            y: [0, 100]
        }, {
            duration: 3,
            repeat: Infinity,
            easing: 'linear'
        });

    } catch (error) {
        console.error('Animation error:', error);
    }
}

// ═══════════════════════════════════════════════════════════════
// INITIALIZATION
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
    // Initialize particle system with more particles
    new PixelParticleSystem('particles', 30);

    // Start animations immediately
    initializeAnimations();

    // Setup invite code dialog handlers
    setupInviteCodeDialogHandlers();

    // Check if need to show invite code dialog
    checkNeedInviteCode();

    // Add special effects with staggered timing
    setTimeout(() => {
        animateVisitorCounter();
    }, 2000);

    setTimeout(() => {
        createGlitchEffect();
        addButtonEffects();
    }, 1000);

    // Typing effect for description
    const description = document.querySelector('.pixel-description');
    if (description) {
        const originalText = description.textContent;
        setTimeout(() => {
            typewriterEffect(description, originalText, 80);
        }, 1500);
    }

    // Console easter egg
    console.log(`
    ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
    ┃  CHLOE OAUTH SYSTEM v1.0        ┃
    ┃  ▸ Pixel Art Interface          ┃
    ┃  ▸ Powered by Motion One        ┃
    ┃  ▸ Made with shadcn/ui style    ┃
    ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
    `);
});

// Handle visibility change to pause/resume animations
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        console.log('⏸ Animations paused');
    } else {
        console.log('▶ Animations resumed');
    }
});

// ═══════════════════════════════════════════════════════════════
// INVITE CODE DIALOG HANDLING
// ═══════════════════════════════════════════════════════════════

function checkNeedInviteCode() {
    const urlParams = new URLSearchParams(window.location.search);
    const needInvite = urlParams.get('needInvite');

    if (needInvite === 'true') {
        showInviteCodeDialog();
    }
}

function showInviteCodeDialog() {
    const dialog = document.getElementById('inviteCodeDialog');
    const input = document.getElementById('dialogInviteCodeInput');
    const errorDiv = document.getElementById('inviteCodeError');

    if (!dialog) return;

    // 清空输入和错误
    if (input) input.value = '';
    if (errorDiv) {
        errorDiv.textContent = '';
        errorDiv.classList.add('hidden');
    }

    // 显示对话框
    dialog.classList.remove('hidden');

    // 聚焦输入框
    setTimeout(() => input?.focus(), 300);
}

function hideInviteCodeDialog() {
    const dialog = document.getElementById('inviteCodeDialog');
    if (dialog) {
        dialog.classList.add('hidden');
    }
}

function showInviteCodeError(message) {
    const errorDiv = document.getElementById('inviteCodeError');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.classList.remove('hidden');
    }
}

async function getCsrfToken() {
    try {
        const res = await fetch('/csrf-token');
        const data = await res.json();
        return data.token || '';
    } catch {
        return '';
    }
}

async function submitInviteCode() {
    const input = document.getElementById('dialogInviteCodeInput');
    const confirmBtn = document.getElementById('inviteCodeConfirm');
    const inviteCode = input?.value?.trim();

    if (!inviteCode) {
        showInviteCodeError('请输入邀请码');
        return;
    }

    // 禁用按钮
    if (confirmBtn) confirmBtn.disabled = true;

    try {
        const token = await getCsrfToken();
        const res = await fetch('/auth/complete-oauth', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                ...(token && token !== 'disabled' ? { 'X-CSRF-Token': token } : {}),
            },
            body: JSON.stringify({ inviteCode }),
        });

        const data = await res.json();

        if (res.ok && data.success) {
            // 注册成功，跳转到首页
            window.location.href = '/';
        } else {
            showInviteCodeError(data.error || '邀请码验证失败');
            if (confirmBtn) confirmBtn.disabled = false;
        }
    } catch (err) {
        showInviteCodeError('网络错误，请稍后重试');
        if (confirmBtn) confirmBtn.disabled = false;
    }
}

function setupInviteCodeDialogHandlers() {
    const confirmBtn = document.getElementById('inviteCodeConfirm');
    const cancelBtn = document.getElementById('inviteCodeCancel');
    const input = document.getElementById('dialogInviteCodeInput');

    if (confirmBtn) {
        confirmBtn.addEventListener('click', submitInviteCode);
    }

    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            hideInviteCodeDialog();
            // 清除URL参数并刷新页面
            window.location.href = '/oauth.html';
        });
    }

    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                submitInviteCode();
            }
        });
    }
}


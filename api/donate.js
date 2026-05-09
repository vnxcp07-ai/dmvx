const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

// ── Log every single startup so we know the function is running ──
console.log('=== donate.js loaded ===');
console.log('WEBHOOK set:', !!WEBHOOK);

// ==============================
// Helpers
// ==============================

function formatNumber(n) {
    return parseInt(n).toLocaleString('en-US');
}

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}

async function fetchBuffer(url) {
    try {
        const res = await axios.get(url, {
            responseType: 'arraybuffer',
            timeout: 8000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(res.data);
    } catch (e) {
        console.warn('fetchBuffer failed:', url, e.message);
        return null;
    }
}

// ==============================
// Font — download Montserrat Bold once per cold start
// ==============================

let fontName = 'sans-serif';
let fontReady = false;

async function ensureFont() {
    if (fontReady) return;
    console.log('Loading font...');
    const buf = await fetchBuffer(
        'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf'
    );
    if (buf) {
        try {
            GlobalFonts.register(buf, 'Montserrat');
            fontName = 'Montserrat';
            fontReady = true;
            console.log('✅ Font loaded');
        } catch (e) {
            console.warn('Font register failed:', e.message);
        }
    } else {
        console.warn('Font download failed, using sans-serif fallback');
    }
}

// ==============================
// Robux Icon — load from repo root
// ==============================

let robuxIconCache = null;

async function getRobuxIcon() {
    if (robuxIconCache) return robuxIconCache;
    try {
        const robuxPath = path.join(process.cwd(), 'robux.png');
        console.log('Loading robux icon from:', robuxPath);
        console.log('File exists:', fs.existsSync(robuxPath));
        robuxIconCache = await loadImage(robuxPath);
        console.log('✅ Robux icon loaded from disk');
    } catch (e) {
        console.warn('Robux icon from disk failed:', e.message);
        // fallback: download from github
        const buf = await fetchBuffer(
            'https://raw.githubusercontent.com/vnxcp07-ai/donation-proxy/main/robux.png'
        );
        if (buf) {
            robuxIconCache = await loadImage(buf);
            console.log('✅ Robux icon loaded from GitHub');
        }
    }
    return robuxIconCache;
}

// ==============================
// Drawing helpers
// ==============================

function tintIcon(img, size, hexColor) {
    const off = createCanvas(size, size);
    const ctx = off.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = hexColor;
    ctx.fillRect(0, 0, size, size);
    return off;
}

function drawRobuxWithStroke(ctx, img, cx, cy, iconSize, color, strokeWidth) {
    const strokeSize = iconSize + strokeWidth * 2;
    const blackOff = createCanvas(strokeSize, strokeSize);
    const blackCtx = blackOff.getContext('2d');
    blackCtx.drawImage(img, 0, 0, strokeSize, strokeSize);
    blackCtx.globalCompositeOperation = 'source-in';
    blackCtx.fillStyle = 'rgba(0,0,0,0.9)';
    blackCtx.fillRect(0, 0, strokeSize, strokeSize);

    const offsets = [
        [-strokeWidth, -strokeWidth], [0, -strokeWidth], [strokeWidth, -strokeWidth],
        [-strokeWidth, 0],                               [strokeWidth, 0],
        [-strokeWidth,  strokeWidth], [0,  strokeWidth], [strokeWidth,  strokeWidth],
    ];
    for (const [ox, oy] of offsets) {
        ctx.drawImage(blackOff,
            cx - iconSize / 2 + ox - strokeWidth,
            cy - iconSize / 2 + oy - strokeWidth,
            strokeSize, strokeSize
        );
    }
    const tinted = tintIcon(img, iconSize, color);
    ctx.drawImage(tinted, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function drawStrokedText(ctx, text, x, y, fillColor, strokeWidth) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawAvatar(ctx, img, cx, cy, radius, borderColor) {
    // Glowing border
    ctx.save();
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.restore();

    // Circular clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

// ==============================
// Main Handler
// ==============================

module.exports = async function handler(req, res) {
    console.log('=== New request ===');
    console.log('Method:', req.method);
    console.log('Body:', JSON.stringify(req.body));

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    if (!WEBHOOK) {
        console.error('❌ DISCORD_WEBHOOK_URL not set in env');
        return res.status(500).json({ error: 'Webhook not configured' });
    }

    try {
        const { donatorName, receiverName, donatorAvatar, receiverAvatar, amount } = req.body || {};

        console.log('Fields:', { donatorName, receiverName, donatorAvatar, receiverAvatar, amount });

        if (!donatorName || !receiverName || !donatorAvatar || !receiverAvatar || amount == null) {
            return res.status(400).json({ error: 'Missing fields', received: req.body });
        }

        // Load font + robux icon in parallel
        await Promise.all([ensureFont(), getRobuxIcon()]);

        const numAmount = parseInt(
            typeof amount === 'string' ? amount.replace(/,/g, '') : amount
        );

        console.log('Amount:', numAmount);

        // ── Tier ──
        let themeHex, emoji, tier;
        if (numAmount >= 10_000_000) {
            themeHex = '#FF0037'; emoji = '<:starfall:1490655938506395829>'; tier = 'Starfall';
        } else if (numAmount >= 1_000_000) {
            themeHex = '#FF0062'; emoji = '<:smitebro:1490655992025841804>'; tier = 'Smite';
        } else {
            themeHex = '#cc66ff'; emoji = '<:nukeig:1490656026603683940>'; tier = 'Nuke';
        }

        const r = parseInt(themeHex.slice(1,3), 16);
        const g = parseInt(themeHex.slice(3,5), 16);
        const b = parseInt(themeHex.slice(5,7), 16);

        // ── Canvas ──
        const W = 620, H = 210;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // transparent base
        ctx.clearRect(0, 0, W, H);

        // gradient glow background
        const bgGrad = ctx.createLinearGradient(0, H, 0, 0);
        bgGrad.addColorStop(0,   `rgba(${r},${g},${b},0.40)`);
        bgGrad.addColorStop(0.5, `rgba(${r},${g},${b},0.12)`);
        bgGrad.addColorStop(1,   `rgba(0,0,0,0)`);
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Left accent bar
        ctx.fillStyle = themeHex;
        ctx.fillRect(0, 0, 7, H);

        // ── Avatars ──
        const [dBuf, rBuf] = await Promise.all([
            fetchBuffer(donatorAvatar),
            fetchBuffer(receiverAvatar)
        ]);

        const [dImg, rImg] = await Promise.all([
            dBuf ? loadImage(dBuf) : null,
            rBuf ? loadImage(rBuf) : null
        ]);

        const avatarRadius = 55;
        const avatarCY = H / 2 - 12;
        const leftCX = 85;
        const rightCX = W - 85;
        const centerX = W / 2;

        if (dImg) drawAvatar(ctx, dImg, leftCX,  avatarCY, avatarRadius, themeHex);
        if (rImg) drawAvatar(ctx, rImg, rightCX, avatarCY, avatarRadius, themeHex);

        // ── Robux icon + amount centered ──
        const iconSize = 40;
        const amtText  = formatNumber(numAmount);
        const gap      = 12;

        ctx.font = `bold 44px ${fontName}`;
        ctx.textBaseline = 'middle';
        const amtWidth  = ctx.measureText(amtText).width;
        const groupW    = iconSize + gap + amtWidth;
        const groupLeft = centerX - groupW / 2;
        const rowY      = H / 2 - 18;

        if (robuxIconCache) {
            drawRobuxWithStroke(ctx, robuxIconCache, groupLeft + iconSize/2, rowY, iconSize, themeHex, 2);
        }

        ctx.textAlign = 'left';
        drawStrokedText(ctx, amtText, groupLeft + iconSize + gap, rowY, themeHex, 6);

        // "donated to"
        ctx.font = `bold 21px ${fontName}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        drawStrokedText(ctx, 'donated to', centerX, H / 2 + 30, '#FFFFFF', 4);

        // Usernames
        ctx.font = `bold 14px ${fontName}`;
        const trim = (s, max = 14) => s.length > max ? s.slice(0, max) + '..' : s;
        drawStrokedText(ctx, '@' + trim(donatorName),  leftCX,  avatarCY + avatarRadius + 24, '#FFFFFF', 4);
        drawStrokedText(ctx, '@' + trim(receiverName), rightCX, avatarCY + avatarRadius + 24, '#FFFFFF', 4);

        // ── Timestamp ──
        const now = new Date();
        const hh  = now.getHours();
        const mm  = now.getMinutes().toString().padStart(2, '0');
        const ap  = hh >= 12 ? 'PM' : 'AM';
        const dh  = hh % 12 || 12;

        // ── Discord ──
        const imgBuf = canvas.toBuffer('image/png');
        console.log('Image buffer size:', imgBuf.length);

        const form = new FormData();
        form.append('payload_json', JSON.stringify({
            content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``,
            embeds: [{
                color: hexToDec(themeHex),
                image: { url: 'attachment://donation.png' },
                footer: { text: `DONATE MODDED VX • Vxid Utilities • Today at ${dh}:${mm} ${ap}` }
            }]
        }));

        form.append('files[0]', imgBuf, { filename: 'donation.png', contentType: 'image/png' });

        console.log('Posting to Discord...');
        const discordRes = await axios.post(WEBHOOK, form, {
            headers: form.getHeaders(),
            timeout: 15000
        });
        console.log('✅ Discord response:', discordRes.status);

        return res.status(200).json({ success: true, tier });

    } catch (err) {
        console.error('💥 Handler error:', err.message, err.stack);
        return res.status(500).json({ error: err.message });
    }
};

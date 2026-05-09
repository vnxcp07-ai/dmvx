const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

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
            timeout: 10000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        return Buffer.from(res.data);
    } catch (e) {
        console.warn('fetchBuffer failed:', url, e.message);
        return null;
    }
}

let fontName = 'sans-serif';
let fontReady = false;

async function ensureFont() {
    if (fontReady) return;
    console.log('Downloading font...')
    const buf = await fetchBuffer('https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf');
    if (buf) {
        GlobalFonts.register(buf, 'Montserrat');
        fontName = 'Montserrat';
        fontReady = true;
        console.log('✅ Font loaded');
    }
}

const ROBUX_URL = 'https://raw.githubusercontent.com/vnxcp07-ai/donation-proxy/main/edfae9388da4cd8496b885a8a2df613372500d9c-removebg-preview.png';
let robuxIconCache = null;

async function getRobuxIcon() {
    if (robuxIconCache) return robuxIconCache;
    const buf = await fetchBuffer(ROBUX_URL);
    if (buf) {
        robuxIconCache = await loadImage(buf);
        console.log('✅ Robux icon loaded');
    }
    return robuxIconCache;
}

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
    blackCtx.fillStyle = 'rgba(0,0,0,0.95)';
    blackCtx.fillRect(0, 0, strokeSize, strokeSize);

    const offsets = [
        [-strokeWidth, -strokeWidth], [0, -strokeWidth], [strokeWidth, -strokeWidth],
        [-strokeWidth, 0],                              [strokeWidth, 0],
        [-strokeWidth, strokeWidth],  [0, strokeWidth], [strokeWidth, strokeWidth],
    ];

    for (const [ox, oy] of offsets) {
        ctx.drawImage(blackOff, cx - iconSize/2 + ox, cy - iconSize/2 + oy, strokeSize, strokeSize);
    }

    const tinted = tintIcon(img, iconSize, color);
    ctx.drawImage(tinted, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function drawStrokedText(ctx, text, x, y, fillColor, strokeWidth) {
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.95)';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fillColor;
    ctx.fillText(text, x, y);
    ctx.restore();
}

function drawAvatar(ctx, img, cx, cy, radius, borderColor) {
    ctx.save();
    ctx.shadowColor = borderColor;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
}

module.exports = async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const { donatorName, receiverName, donatorAvatar, receiverAvatar, amount } = req.body;

        // Load everything first before drawing
        await Promise.all([ ensureFont(), getRobuxIcon() ]);

        const numAmount = parseInt(amount);

        // ✅ EXACT TIERS MATCHING YOUR GAME
        let themeHex, emoji;
        if (numAmount >= 10000000) {
            themeHex = '#ff2200';
            emoji    = '<:starfall:1490655938506395829>';
        } else if (numAmount >= 1000000) {
            themeHex = '#ff0099';
            emoji    = '<:smitebro:1490655992025841804>';
        } else if (numAmount >= 100000) {
            themeHex = '#cc66ff';
            emoji    = '<:nukeig:1490656026603683940>';
        }

        const r = parseInt(themeHex.slice(1,3),16);
        const g = parseInt(themeHex.slice(3,5),16);
        const b = parseInt(themeHex.slice(5,7),16);

        const W = 700, H = 220;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');

        // Full transparent base
        ctx.clearRect(0,0,W,H);

        // Tier colored gradient background glow
        const glow = ctx.createLinearGradient(0, H, 0, 0);
        glow.addColorStop(0,   `rgba(${r},${g},${b},0.35)`);
        glow.addColorStop(0.5, `rgba(${r},${g},${b},0.10)`);
        glow.addColorStop(1,   `rgba(0,0,0,0)`);
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        // Left accent bar
        ctx.fillStyle = themeHex;
        ctx.fillRect(0,0,8,H);

        // Load avatars
        const [dBuf, rBuf] = await Promise.all([ fetchBuffer(donatorAvatar), fetchBuffer(receiverAvatar) ]);
        const [dImg, rImg] = await Promise.all([ loadImage(dBuf), loadImage(rBuf) ]);

        const avatarRadius = 55;
        const avatarCY     = H / 2 - 12;
        const leftCX       = 105;
        const rightCX      = W - 105;
        const centerX      = W / 2;

        drawAvatar(ctx, dImg, leftCX,  avatarCY, avatarRadius, themeHex);
        drawAvatar(ctx, rImg, rightCX, avatarCY, avatarRadius, themeHex);

        const iconSize = 40;
        const amtText  = formatNumber(numAmount);
        const gap      = 12;

        ctx.font = `bold 44px ${fontName}`;
        ctx.textBaseline = 'middle';
        const amtWidth = ctx.measureText(amtText).width;

        const groupW    = iconSize + gap + amtWidth;
        const groupLeft = centerX - groupW / 2;
        const rowY      = H / 2 - 18;

        drawRobuxWithStroke(ctx, robuxIconCache, groupLeft + iconSize/2, rowY, iconSize, themeHex, 2);

        ctx.textAlign = 'left';
        drawStrokedText(ctx, amtText, groupLeft + iconSize + gap, rowY, themeHex, 5);

        ctx.font = `bold 22px ${fontName}`;
        ctx.textAlign = 'center';
        drawStrokedText(ctx, 'donated to', centerX, H / 2 + 24, '#FFFFFF', 4);

        ctx.font = `bold 15px ${fontName}`;
        const trim = (s, max = 14) => s.length > max ? s.slice(0, max) + '..' : s;
        drawStrokedText(ctx, '@' + trim(donatorName),  leftCX,  avatarCY + avatarRadius + 26, '#FFFFFF', 4);
        drawStrokedText(ctx, '@' + trim(receiverName), rightCX, avatarCY + avatarRadius + 26, '#FFFFFF', 4);

        // Timestamp
        const now = new Date();
        const hh  = now.getHours();
        const mm  = now.getMinutes().toString().padStart(2, '0');
        const ap  = hh >= 12 ? 'PM' : 'AM';
        const dh  = hh % 12 || 12;

        const imgBuf = canvas.toBuffer('image/png');
        const form   = new FormData();

        form.append('payload_json', JSON.stringify({
            content: `${emoji} **@${donatorName} just dropped a <:robux:1451215082640900146> ${formatNumber(numAmount)} to @${receiverName}!**`,
            embeds: [{
                color: hexToDec(themeHex),
                image: { url: 'attachment://donation.png' },
                footer: { text: `DONATE MODDED VX • Vxid Utilities • Today at ${dh}:${mm} ${ap}` },
                timestamp: new Date().toISOString()
            }]
        }));

        form.append('files[0]', imgBuf, { filename: 'donation.png' });

        await axios.post(WEBHOOK, form, { headers: form.getHeaders() });
        console.log('✅ Donation sent!', numAmount);

        return res.json({ success: true });

    } catch (err) {
        console.error('💥 Error:', err);
        return res.status(500).json({ error: err.message });
    }
};

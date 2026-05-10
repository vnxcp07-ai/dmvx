const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');

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
      headers: { 'User-Agent': 'Mozilla/5.0' },
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.warn('fetchBuffer failed:', url, e.message);
    return null;
  }
}

// ── Font ──────────────────────────────────────────────────────────────────────
let fontName = 'sans-serif';
let fontReady = false;

async function ensureFont() {
  if (fontReady) return;
  const urls = [
    'https://github.com/google/fonts/raw/main/apache/roboto/static/Roboto-Bold.ttf',
    'https://github.com/JulietaUla/Montserrat/raw/master/fonts/ttf/Montserrat-Bold.ttf',
  ];
  for (const url of urls) {
    const buf = await fetchBuffer(url);
    if (buf) {
      try {
        GlobalFonts.register(buf, 'DonationFont');
        fontName = 'DonationFont';
        fontReady = true;
        console.log('[Font] Loaded from:', url);
        return;
      } catch (e) {
        console.warn('[Font] Register failed:', e.message);
      }
    }
  }
  console.warn('[Font] Using sans-serif fallback');
}

// ── Robux Icon ────────────────────────────────────────────────────────────────
const ROBUX_URL = 'https://raw.githubusercontent.com/vnxcp07-ai/dmvx/main/robux.png';
let robuxIconCache = null;

async function getRobuxIcon() {
  if (robuxIconCache) return robuxIconCache;
  const buf = await fetchBuffer(ROBUX_URL);
  if (buf) {
    try {
      robuxIconCache = await loadImage(buf);
      console.log('[Robux] Icon loaded OK');
    } catch (e) {
      console.warn('[Robux] Load failed:', e.message);
    }
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
  blackCtx.fillStyle = 'rgba(0,0,0,0.9)';
  blackCtx.fillRect(0, 0, strokeSize, strokeSize);

  const offsets = [
    [-strokeWidth, -strokeWidth], [0, -strokeWidth], [strokeWidth, -strokeWidth],
    [-strokeWidth, 0],                               [strokeWidth, 0],
    [-strokeWidth,  strokeWidth], [0,  strokeWidth], [strokeWidth,  strokeWidth],
  ];
  for (const [ox, oy] of offsets) {
    ctx.drawImage(
      blackOff,
      cx - iconSize / 2 + ox - strokeWidth,
      cy - iconSize / 2 + oy - strokeWidth,
      strokeSize, strokeSize
    );
  }

  const tinted = tintIcon(img, iconSize, color);
  ctx.drawImage(tinted, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

// ── Text ──────────────────────────────────────────────────────────────────────
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

// ── Avatar ────────────────────────────────────────────────────────────────────
function drawAvatar(ctx, img, cx, cy, radius, borderColor) {
  // 1. Clip + draw image
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  // 2. Glowing ring on top
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 6;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur = 25;
  ctx.stroke();
  ctx.restore();
}

// ── Background glow ───────────────────────────────────────────────────────────
// 100k → transparent (glow: 'none')
// 1mil → subtle pink radial glow from bottom (glow: 'medium')
// 10mil → strong red radial glow from bottom-center (glow: 'high')
function drawBackground(ctx, W, H, themeHex, glow) {
  ctx.clearRect(0, 0, W, H);
  if (glow === 'none') return;

  const r = parseInt(themeHex.slice(1, 3), 16);
  const g = parseInt(themeHex.slice(3, 5), 16);
  const b = parseInt(themeHex.slice(5, 7), 16);

  if (glow === 'high') {
    // Deep red spotlight rising from bottom-center — matches 10m+ image
    const grad = ctx.createRadialGradient(W / 2, H + 30, 20, W / 2, H * 0.65, W * 0.78);
    grad.addColorStop(0,    `rgba(${r}, 0, 0, 1)`);
    grad.addColorStop(0.30, `rgba(${Math.floor(r * 0.65)}, 0, 0, 0.88)`);
    grad.addColorStop(0.60, `rgba(${Math.floor(r * 0.35)}, 0, 0, 0.55)`);
    grad.addColorStop(1,    `rgba(0, 0, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else if (glow === 'medium') {
    // Subtle pink blush from bottom — matches 1m+ image
    const grad = ctx.createRadialGradient(W / 2, H + 10, 0, W / 2, H * 0.85, W * 0.62);
    grad.addColorStop(0,   `rgba(${r}, ${Math.floor(g * 0.08)}, ${Math.floor(b * 0.28)}, 0.55)`);
    grad.addColorStop(0.5, `rgba(${Math.floor(r * 0.45)}, 0, ${Math.floor(b * 0.1)}, 0.28)`);
    grad.addColorStop(1,   `rgba(0, 0, 0, 0)`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── Fetch Roblox avatar URL ───────────────────────────────────────────────────
async function fetchAvatarUrl(userId) {
  try {
    const res = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`,
      { timeout: 5000 }
    );
    return res.data.data[0].imageUrl;
  } catch (e) {
    console.warn('[Avatar] Failed for userId', userId, e.message);
    return null;
  }
}

// ── Tier ──────────────────────────────────────────────────────────────────────
function getTier(amount) {
  if (amount >= 10000000) return { hex: '#ff0000', emoji: '<:starfall:1490655938506395829>', glow: 'high' };
  if (amount >= 1000000)  return { hex: '#FF0099', emoji: '<:smitebro:1490655992025841804>', glow: 'medium' };
  return                         { hex: '#FF00B5', emoji: '<:nukeig:1490656026603683940>',  glow: 'none' };
}

// ── Main Handler ──────────────────────────────────────────────────────────────
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { donatorName, receiverName, donatorId, receiverId, amount } = req.body;

    if (!donatorId || !receiverId || amount == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
    if (!WEBHOOK) return res.status(500).json({ error: 'No webhook URL configured' });

    const numAmount = parseInt(
      typeof amount === 'string' ? amount.replace(/,/g, '') : amount
    );

    const { hex: themeHex, emoji, glow } = getTier(numAmount);

    // Load font + robux icon in parallel
    await Promise.all([ensureFont(), getRobuxIcon()]);

    // Fetch avatar URLs
    const [donatorAvatarUrl, receiverAvatarUrl] = await Promise.all([
      fetchAvatarUrl(donatorId),
      fetchAvatarUrl(receiverId),
    ]);

    console.log('[Avatar URLs]', donatorAvatarUrl, receiverAvatarUrl);

    // Fetch avatar image buffers
    const [dBuf, rBuf] = await Promise.all([
      donatorAvatarUrl  ? fetchBuffer(donatorAvatarUrl)  : Promise.resolve(null),
      receiverAvatarUrl ? fetchBuffer(receiverAvatarUrl) : Promise.resolve(null),
    ]);

    if (!dBuf || !rBuf) {
      return res.status(500).json({ error: 'Avatar image fetch failed' });
    }

    const [dImg, rImg] = await Promise.all([loadImage(dBuf), loadImage(rBuf)]);

    // ── Canvas — wide banner format ───────────────────────────────────────
    const W = 1000, H = 260;
    const canvas = createCanvas(W, H);
    const ctx    = canvas.getContext('2d');

    // Background (transparent base + optional radial glow)
    drawBackground(ctx, W, H, themeHex, glow);

    // ── Layout constants ──────────────────────────────────────────────────
    const avatarRadius = 80;
    const avatarCY     = H / 2 - 16;   // avatar vertical center (slightly above mid)
    const leftCX       = 130;           // left avatar x
    const rightCX      = W - 130;       // right avatar x
    const centerX      = W / 2;

    // Draw avatars with glowing ring
    drawAvatar(ctx, dImg, leftCX,  avatarCY, avatarRadius, themeHex);
    drawAvatar(ctx, rImg, rightCX, avatarCY, avatarRadius, themeHex);

    // ── Center: [ Robux icon ][ amount ] ─────────────────────────────────
    const iconSize   = 56;
    const amtText    = formatNumber(numAmount);
    const amtFontSz  = 68;
    const gap        = 14;

    ctx.font         = `bold ${amtFontSz}px ${fontName}`;
    ctx.textBaseline = 'middle';
    const amtWidth   = ctx.measureText(amtText).width;

    const groupW     = iconSize + gap + amtWidth;
    const groupLeft  = centerX - groupW / 2;
    const amtRowY    = H / 2 - 20;    // vertical center of amount row

    if (robuxIconCache) {
      drawRobuxWithStroke(
        ctx, robuxIconCache,
        groupLeft + iconSize / 2, amtRowY,
        iconSize, themeHex, 3
      );
    }

    ctx.textAlign = 'left';
    drawStrokedText(ctx, amtText, groupLeft + iconSize + gap, amtRowY, themeHex, 6);

    // ── "donated to" below amount ─────────────────────────────────────────
    ctx.font         = `bold 30px ${fontName}`;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'alphabetic';
    drawStrokedText(ctx, 'donated to', centerX, H / 2 + 42, '#FFFFFF', 5);

    // ── Usernames below each avatar ───────────────────────────────────────
    const nameY  = avatarCY + avatarRadius + 26;
    const trim   = (s, max = 16) => s.length > max ? s.slice(0, max) + '..' : s;

    ctx.font      = `bold 16px ${fontName}`;
    ctx.textAlign = 'center';

    drawStrokedText(ctx, '@' + trim(donatorName  || 'Unknown'), leftCX,  nameY, '#FFFFFF', 4);
    drawStrokedText(ctx, '@' + trim(receiverName || 'Unknown'), rightCX, nameY, '#FFFFFF', 4);

    // ── Send to Discord ───────────────────────────────────────────────────
    const imgBuf = canvas.toBuffer('image/png');
    const form   = new FormData();

    const now = new Date();
    const hh  = now.getHours();
    const mm  = now.getMinutes().toString().padStart(2, '0');
    const ap  = hh >= 12 ? 'PM' : 'AM';
    const dh  = hh % 12 || 12;

    const payload = {
      content: `${emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${formatNumber(numAmount)} Robux** to \`@${receiverName}\``,
      embeds: [{
        color:  hexToDec(themeHex),
        image:  { url: 'attachment://donation.png' },
        footer: { text: `Donated on • Today at ${dh}:${mm} ${ap}` },
      }],
    };

    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', imgBuf, {
      filename:    'donation.png',
      contentType: 'image/png',
    });

    await axios.post(WEBHOOK, form, {
      headers:          form.getHeaders(),
      maxBodyLength:    Infinity,
      maxContentLength: Infinity,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Handler] Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};

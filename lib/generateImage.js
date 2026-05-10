const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const TIERS = {
  starfall: { accent: '#ff0000', glowColor: 'rgba(255,0,0,0.35)' },
  smite:    { accent: '#ff0099', glowColor: 'rgba(255,0,153,0.35)' },
  nuke:     { accent: '#a100ff', glowColor: 'rgba(161,0,255,0.35)' }
};

function getTier(amount) {
  if (amount >= 10000000) return 'starfall';
  if (amount >= 1000000)  return 'smite';
  return 'nuke';
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

async function fetchAvatar(userId) {
  try {
    const res = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`,
      { timeout: 5000 }
    );
    const url = res.data.data[0].imageUrl;
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return img.data;
  } catch { return null; }
}

// Try to load Poppins, log exactly what happens
function loadFont() {
  const attempts = [
    path.join(process.cwd(), 'Poppins-Bold.ttf'),
    path.join(process.cwd(), 'fonts', 'Poppins-Bold.ttf'),
    path.join(__dirname, '..', 'Poppins-Bold.ttf'),
    path.join(__dirname, 'Poppins-Bold.ttf'),
  ];

  for (const p of attempts) {
    try {
      if (fs.existsSync(p)) {
        GlobalFonts.register(fs.readFileSync(p), 'Poppins');
        console.log('[Font] Loaded Poppins from:', p);
        return 'Poppins';
      }
    } catch (e) {
      console.error('[Font] Failed at', p, e.message);
    }
  }

  // List available fonts so we know what we CAN use
  const available = GlobalFonts.families;
  console.log('[Font] Poppins NOT found. Available fonts:', JSON.stringify(available.map(f => f.family).slice(0, 20)));

  // Pick best available fallback
  const fallbacks = ['Arial', 'Liberation Sans', 'DejaVu Sans', 'FreeSans', 'Helvetica'];
  for (const f of fallbacks) {
    if (available.find(x => x.family === f)) {
      console.log('[Font] Using fallback:', f);
      return f;
    }
  }

  console.log('[Font] Using generic sans-serif');
  return 'sans-serif';
}

let resolvedFont = null;

function tintImage(image, color) {
  const c = createCanvas(image.width, image.height);
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = color;
  cx.fillRect(0, 0, image.width, image.height);
  return c;
}

function drawOutlined(ctx, text, x, y, fillColor, strokeWidth) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  // Load font once
  if (!resolvedFont) {
    resolvedFont = loadFont();
  }
  const font = resolvedFont;

  const tierName = getTier(amount);
  const tier = TIERS[tierName];
  const formatted = formatNumber(amount);

  console.log(`[Image] Generating: amount=${formatted} tier=${tierName} font=${font}`);

  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;
  const tintedRobux = tintImage(robuxImg, tier.accent);

  const W = 900;
  const H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ── TRANSPARENT background ───────────────────────────────────────────────
  ctx.clearRect(0, 0, W, H);

  // ── Soft colored gradient at bottom half only ────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
  bgGrad.addColorStop(0, 'rgba(255,255,255,0)');
  bgGrad.addColorStop(1, tier.glowColor);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── Layout constants ──────────────────────────────────────────────────────
  const avatarR = 70;
  const avatarCY = H / 2 - 10; // avatar center Y
  const leftX   = 120;
  const rightX  = W - 120;
  const nameY   = avatarCY + avatarR + 24;

  // ── Draw avatar: image clipped, THEN ring on top ──────────────────────────
  function drawAvatar(img, cx) {
    // 1. Clipped image
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, avatarCY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, cx - avatarR, avatarCY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    }

    // 2. Ring ON TOP — drawn AFTER restore so clip is gone
    ctx.save();
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth = 7;
    ctx.shadowColor = tier.accent;
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.arc(cx, avatarCY, avatarR + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAvatar(donatorImg, leftX);
  drawAvatar(receiverImg, rightX);

  // ── Usernames ─────────────────────────────────────────────────────────────
  function truncate(name) {
    return name.length > 16 ? name.slice(0, 14) + '…' : name;
  }

  // Test: draw a simple filled rect to confirm canvas is working
  // ctx.fillStyle = 'red'; ctx.fillRect(W/2 - 50, 10, 100, 10); // uncomment to debug

  ctx.font = `bold 20px "${font}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  drawOutlined(ctx, '@' + truncate(donatorName),  leftX,  nameY, '#ffffff', 5);
  drawOutlined(ctx, '@' + truncate(receiverName), rightX, nameY, '#ffffff', 5);

  // ── Amount row: icon + number centered together ───────────────────────────
  let fontSize = 74;
  if (formatted.length >= 10) fontSize = 54;
  else if (formatted.length >= 8) fontSize = 62;

  const iconSize = fontSize; // icon same height as font
  const iconTextGap = 10;

  // IMPORTANT: set font BEFORE measuring
  ctx.font = `bold ${fontSize}px "${font}"`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const textW = ctx.measureText(formatted).width;
  const groupW = iconSize + iconTextGap + textW;
  const groupX = W / 2 - groupW / 2;

  const rowY = avatarCY - 14; // vertical center of amount row

  // Draw robux icon
  ctx.drawImage(tintedRobux, groupX, rowY - iconSize / 2, iconSize, iconSize);

  // Draw amount text — font already set above
  drawOutlined(ctx, formatted, groupX + iconSize + iconTextGap, rowY, tier.accent, 14);

  // ── "donated to" ──────────────────────────────────────────────────────────
  const subFontSize = 30;
  ctx.font = `bold ${subFontSize}px "${font}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const donatedY = rowY + fontSize / 2 + subFontSize + 2;
  drawOutlined(ctx, 'donated to', W / 2, donatedY, '#ffffff', 6);

  console.log(`[Image] Done. textW=${Math.round(textW)} groupW=${Math.round(groupW)} rowY=${rowY}`);

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

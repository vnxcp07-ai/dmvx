const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const TIERS = {
  starfall: { accent: '#ff0000', glowColor: 'rgba(255,0,0,0.35)' },
  smite:    { accent: '#ff0099', glowColor: 'rgba(255,0,153,0.35)' },
  nuke:     { accent: '#ff0099', glowColor: 'rgba(255,0,153,0.25)' }
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

let fontLoaded = false;
function ensureFont() {
  if (fontLoaded) return;
  try {
    const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
    GlobalFonts.register(fs.readFileSync(fontPath), 'Poppins');
    fontLoaded = true;
    console.log('[Font] Poppins loaded OK');
  } catch (e) {
    console.error('[Font] Failed:', e.message);
  }
}

function tintImage(image, color) {
  const c = createCanvas(image.width, image.height);
  const cx = c.getContext('2d');
  cx.drawImage(image, 0, 0);
  cx.globalCompositeOperation = 'source-in';
  cx.fillStyle = color;
  cx.fillRect(0, 0, image.width, image.height);
  return c;
}

// Draw text with thick black outline + colored/white fill
function drawOutlinedText(ctx, text, x, y, fillColor, lineWidth = 10) {
  ctx.save();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth   = lineWidth;
  ctx.lineJoin    = 'round';
  ctx.miterLimit  = 2;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  ensureFont();

  const tierName = getTier(amount);
  const tier     = TIERS[tierName];
  const font     = fontLoaded ? 'Poppins' : 'Arial Black';

  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg  = donatorBuf  ? await loadImage(donatorBuf)  : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  const tintedRobux = tintImage(robuxImg, tier.accent);

  // Canvas dimensions - wide banner like the reference images
  const W = 900;
  const H = 220;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext('2d');

  // ── BACKGROUND: white with colored gradient at bottom ──────────────────────
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Bottom gradient
  const bgGrad = ctx.createLinearGradient(0, H * 0.4, 0, H);
  bgGrad.addColorStop(0, 'rgba(255,255,255,0)');
  bgGrad.addColorStop(1, tier.glowColor);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // ── LAYOUT CONSTANTS ────────────────────────────────────────────────────────
  const avatarR   = 72;          // avatar circle radius
  const avatarY   = H / 2 - 14; // avatar vertical center
  const leftAvatX = 130;         // left avatar X
  const rightAvatX = W - 130;   // right avatar X
  const nameY     = avatarY + avatarR + 22; // username Y

  // ── DRAW AVATAR HELPER ───────────────────────────────────────────────────────
  function drawAvatar(img, x) {
    // Clipped image
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarR, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - avatarR, avatarY - avatarR, avatarR * 2, avatarR * 2);
      ctx.restore();
    }

    // Ring drawn ON TOP
    ctx.save();
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = 6;
    ctx.beginPath();
    ctx.arc(x, avatarY, avatarR + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAvatar(donatorImg,  leftAvatX);
  drawAvatar(receiverImg, rightAvatX);

  // ── CENTER CONTENT ───────────────────────────────────────────────────────────
  // The center zone sits between the two avatars
  const centerX   = W / 2;
  const formatted = formatNumber(amount);

  // Pick font size based on how many characters in the number
  // 100,000 = 7 chars → 72px
  // 1,000,000 = 9 chars → 62px
  // 10,000,000 = 10 chars → 52px
  let amountFontSize = 72;
  if (formatted.length >= 10) amountFontSize = 52;
  else if (formatted.length >= 8) amountFontSize = 62;

  const iconSize = Math.round(amountFontSize * 0.95);

  // Measure amount text width to align icon + text as a group
  ctx.font = `bold ${amountFontSize}px ${font}`;
  const textW    = ctx.measureText(formatted).width;
  const gapIconText = 8;
  const groupW   = iconSize + gapIconText + textW;
  const groupX   = centerX - groupW / 2; // left edge of group

  const amountY  = avatarY + amountFontSize * 0.35; // vertical center for amount row

  // Draw robux icon (colored, no background needed - white bg shows through)
  const iconY = amountY - iconSize * 0.82;
  ctx.drawImage(tintedRobux, groupX, iconY, iconSize, iconSize);

  // Draw amount text
  ctx.font         = `bold ${amountFontSize}px ${font}`;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'alphabetic';
  drawOutlinedText(ctx, formatted, groupX + iconSize + gapIconText, amountY, tier.accent, 12);

  // "donated to" below amount
  const donatedFontSize = 36;
  ctx.font         = `bold ${donatedFontSize}px ${font}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  drawOutlinedText(
    ctx,
    'donated to',
    centerX,
    amountY + donatedFontSize + 4,
    '#ffffff',   // white fill
    8
  );

  // ── USERNAMES ────────────────────────────────────────────────────────────────
  function truncate(name) {
    return name.length > 16 ? name.slice(0, 14) + '…' : name;
  }

  ctx.font         = `bold 22px ${font}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';

  // Black fill with white outline for usernames
  drawOutlinedText(ctx, '@' + truncate(donatorName),  leftAvatX,  nameY, '#000000', 6);
  drawOutlinedText(ctx, '@' + truncate(receiverName), rightAvatX, nameY, '#000000', 6);

  console.log(`[Image] tier=${tierName} amount=${formatted} fontSize=${amountFontSize}`);

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

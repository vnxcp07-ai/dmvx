const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const TIERS = {
  starfall: { accent: '#ff0000', avatarGlow: true },
  smite:    { accent: '#ff0099', avatarGlow: true },
  nuke:     { accent: '#a100ff', avatarGlow: false }
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
    console.log('[Font] Poppins loaded successfully');
  } catch (e) {
    console.error('[Font] Failed to load Poppins:', e.message);
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

async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  ensureFont();

  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg  = donatorBuf  ? await loadImage(donatorBuf)  : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  const tintedRobuxImg = tintImage(robuxImg, tier.accent);

  const W = 620;
  const H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  // ---- BACKGROUND: dark solid so text is always visible ----
  ctx.fillStyle = '#1e1f22';
  ctx.roundRect(0, 0, W, H, 16);
  ctx.fill();

  // ---- BOTTOM GRADIENT BAR ----
  const barH = 4;
  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, 'transparent');
  grad.addColorStop(0.3, tier.accent);
  grad.addColorStop(0.7, tier.accent);
  grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad;
  ctx.fillRect(0, H - barH, W, barH);

  const avatarRadius = 52;
  const avatarY = H / 2 - 10;
  const leftX  = 100;
  const rightX = W - 100;

  // ---- DRAW AVATAR ----
  function drawAvatar(image, x) {
    // 1. Avatar image clipped to circle
    if (image) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
    }

    // 2. Ring ON TOP of avatar
    ctx.save();
    if (tier.avatarGlow) {
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur  = 20;
    }
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(x, avatarY, avatarRadius + 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  drawAvatar(donatorImg,  leftX);
  drawAvatar(receiverImg, rightX);

  // ---- CENTER CONTENT ----
  const centerX = W / 2;

  // Robux icon
  const iconSize = 32;
  ctx.drawImage(tintedRobuxImg, centerX - iconSize / 2, avatarY - 52, iconSize, iconSize);

  // Amount text
  const formattedAmount = formatNumber(amount);
  const fontFamily = fontLoaded ? 'Poppins' : 'Arial';

  ctx.save();
  ctx.font         = `bold 38px ${fontFamily}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  // White outline
  ctx.strokeStyle  = '#000000';
  ctx.lineWidth    = 6;
  ctx.lineJoin     = 'round';
  ctx.strokeText(formattedAmount, centerX, avatarY - 10);
  // Colored fill
  ctx.fillStyle    = tier.accent;
  ctx.fillText(formattedAmount, centerX, avatarY - 10);
  ctx.restore();

  // "donated to" text
  ctx.save();
  ctx.font         = `bold 18px ${fontFamily}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#cccccc';
  ctx.fillText('donated to', centerX, avatarY + 26);
  ctx.restore();

  // ---- USERNAMES ----
  const nameY = avatarY + avatarRadius + 18;

  function truncate(name) {
    return name.length > 14 ? name.slice(0, 12) + '…' : name;
  }

  ctx.save();
  ctx.font         = `bold 15px ${fontFamily}`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle    = '#ffffff';
  ctx.fillText('@' + truncate(donatorName),  leftX,  nameY);
  ctx.fillText('@' + truncate(receiverName), rightX, nameY);
  ctx.restore();

  // ---- DEBUG: log what we're drawing so we know font/text is reached ----
  console.log(`[Image] Drawing: ${formattedAmount} | font: ${fontFamily} | tier: ${tierName}`);

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

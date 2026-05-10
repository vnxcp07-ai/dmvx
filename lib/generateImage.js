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
  const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
  GlobalFonts.register(fs.readFileSync(fontPath), 'Poppins');
  fontLoaded = true;
}

// Draw text with a clean, thin black stroke - no bleed through
function drawStrokedText(ctx, text, x, y) {
  const prevComposite = ctx.globalCompositeOperation;
  
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.9)';
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
  ctx.restore();
}

// Tint an image a flat color
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
  const blackRobuxImg  = tintImage(robuxImg, '#000000');

  const canvas = createCanvas(600, 220);
  const ctx = canvas.getContext('2d');

  const avatarRadius = 50;
  const avatarY = canvas.height / 2;

  // ---- FIX: Draw avatar image FIRST, then ring ON TOP ----
  function drawAvatar(image, x) {
    if (!image) return;

    // 1. Draw clipped avatar image
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(
      image,
      x - avatarRadius,
      avatarY - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2
    );
    ctx.restore();

    // 2. Draw ring ON TOP of the avatar
    ctx.save();
    if (tier.avatarGlow) {
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur  = 20;
    }
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = 4;
    ctx.beginPath();
    ctx.arc(x, avatarY, avatarRadius + 2, 0, Math.PI * 2); // +2 so ring sits outside image edge
    ctx.stroke();
    ctx.restore();
  }

  // ---- 1. Draw Avatars ----
  drawAvatar(donatorImg,  100);
  drawAvatar(receiverImg, canvas.width - 100);

  // ---- 2. Center group: Icon + Amount ----
  const iconSize = 40;
  const gap = 10;

  ctx.font = 'bold 40px Poppins';
  const formattedAmount = formatNumber(amount);
  const amountWidth     = ctx.measureText(formattedAmount).width;
  const totalGroupWidth = iconSize + gap + amountWidth;
  const groupStartX     = (canvas.width - totalGroupWidth) / 2;

  const iconX  = groupStartX;
  const iconY  = avatarY - iconSize / 2 - 8; // vertically centered slightly above middle
  const amountX = groupStartX + iconSize + gap;
  const amountY  = avatarY - 8;

  // Draw black stroke for icon (offset trick)
  const s = 2;
  [[-s,-s],[s,-s],[-s,s],[s,s]].forEach(([ox, oy]) => {
    ctx.drawImage(blackRobuxImg, iconX + ox, iconY + oy, iconSize, iconSize);
  });
  // Draw colored icon on top
  ctx.drawImage(tintedRobuxImg, iconX, iconY, iconSize, iconSize);

  // Draw amount with stroke
  ctx.font      = 'bold 40px Poppins';
  ctx.fillStyle = tier.accent;
  ctx.textAlign    = 'left';
  ctx.textBaseline = 'middle';
  drawStrokedText(ctx, formattedAmount, amountX, amountY);

  // ---- 3. "donated to" text ----
  ctx.font      = 'bold 20px Poppins';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';
  drawStrokedText(ctx, 'donated to', canvas.width / 2, avatarY + 28);

  // ---- 4. Usernames ----
  ctx.font      = 'bold 16px Poppins';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  const nameY = avatarY + avatarRadius + 22;

  const dName = donatorName.length  > 14 ? donatorName.slice(0, 12)  + '…' : donatorName;
  const rName = receiverName.length > 14 ? receiverName.slice(0, 12) + '…' : receiverName;

  drawStrokedText(ctx, '@' + dName, 100,                nameY);
  drawStrokedText(ctx, '@' + rName, canvas.width - 100, nameY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');

// --- TIER CONFIGURATION ---
const TIERS = {
  starfall: { accent: '#ff0000' },
  smite:    { accent: '#ff0099' },
  nuke:     { accent: '#a100ff' }
};

function getTier(amount) {
  if (amount >= 10000000) return 'starfall';
  if (amount >= 1000000)  return 'smite';
  return 'nuke';
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// --- ASSET FETCHING ---
async function fetchAvatar(userId) {
  try {
    const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`, { timeout: 5000 });
    const url = res.data.data[0].imageUrl;
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return img.data;
  } catch {
    return null;
  }
}

// --- FONT LOADER ---
let fontLoaded = false;
async function ensureFont() {
    if (fontLoaded) return;
    // UPDATED PATH: Points to the root directory now
    const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
    GlobalFonts.register(fontPath, 'Poppins');
    console.log('✅ Font loaded from root directory.');
    fontLoaded = true;
}

// --- CANVAS DRAWING HELPERS ---
function drawStrokedText(ctx, text, x, y, strokeWidth) {
    ctx.font = 'bold 24px Poppins';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

function drawRoundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + width, y, x + width, y + height, radius);
    ctx.arcTo(x + width, y + height, x, y + height, radius);
    ctx.arcTo(x, y + height, x, y, radius);
    ctx.arcTo(x, y, x + width, y, radius);
    ctx.closePath();
    ctx.fill();
}

// --- MAIN IMAGE GENERATOR ---
async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  const [donatorBuf, receiverBuf, robuxImg, _] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    // UPDATED PATH: Points to the root directory now
    loadImage(path.join(process.cwd(), 'robux.png')),
    ensureFont()
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  const cardWidth = 600;
  const cardHeight = 220;
  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');
  
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  drawRoundRect(ctx, 0, 0, cardWidth, cardHeight, 20);

  const avatarRadius = 50;
  const avatarY = cardHeight / 2 - 10;
  
  function drawAvatar(image, x) {
      if (!image) return;
      ctx.save();
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.strokeStyle = tier.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
  }
  
  drawAvatar(donatorImg, 105);
  drawAvatar(receiverImg, cardWidth - 105);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  ctx.font = 'bold 48px Poppins';
  ctx.fillStyle = tier.accent;
  drawStrokedText(ctx, formatNumber(amount), cardWidth / 2 + 30, cardHeight / 2 - 10, 8);

  ctx.drawImage(robuxImg, 180, cardHeight / 2 - 35, 45, 45);

  ctx.font = 'bold 24px Poppins';
  ctx.fillStyle = '#ffffff';
  drawStrokedText(ctx, 'donated to', cardWidth / 2, cardHeight / 2 + 30, 5);

  ctx.font = 'bold 18px Poppins';
  const nameY = avatarY + avatarRadius + 22;
  const trim = (s) => (s.length > 14 ? s.slice(0, 12) + '...' : s);
  drawStrokedText(ctx, '@' + trim(donatorName), 105, nameY, 4);
  drawStrokedText(ctx, '@' + trim(receiverName), cardWidth - 105, nameY, 4);
  
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

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
function ensureFont() {
    if (fontLoaded) return;
    const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    GlobalFonts.register(fontBuffer, 'Poppins');
    fontLoaded = true;
}

// --- CANVAS DRAWING HELPERS ---
function drawStrokedText(ctx, text, x, y, strokeWidth) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

// NEW: Helper to tint an image with a specific color
function tintImage(image, color) {
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillRect(0, 0, image.width, image.height);
    return canvas;
}

// --- MAIN IMAGE GENERATOR ---
async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  ensureFont(); 

  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  // NEW: Tint the Robux icon with the tier color
  const tintedRobuxImg = tintImage(robuxImg, tier.accent);

  const cardWidth = 600;
  const cardHeight = 220;
  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');
  
  // REMOVED: No more background card. The canvas is transparent by default.

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

  ctx.textBaseline = 'middle';
  const formattedAmount = formatNumber(amount);
  const iconSize = 45;
  const gap = 12;

  ctx.font = 'bold 48px Poppins';
  const amountWidth = ctx.measureText(formattedAmount).width;
  
  const totalGroupWidth = iconSize + gap + amountWidth;
  const groupStartX = (cardWidth - totalGroupWidth) / 2;

  // Draw the NEW tinted Robux icon
  ctx.drawImage(tintedRobuxImg, groupStartX, cardHeight / 2 - 35, iconSize, iconSize);

  ctx.textAlign = 'left';
  // NEW: Set text color to almost black for the amount, as per your screenshot
  ctx.fillStyle = '#111'; 
  drawStrokedText(ctx, formattedAmount, groupStartX + iconSize + gap, cardHeight / 2 - 10, 8);
  
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Poppins';
  // NEW: Set text color to almost black for "donated to"
  ctx.fillStyle = '#111';
  drawStrokedText(ctx, 'donated to', cardWidth / 2, cardHeight / 2 + 30, 5);

  ctx.font = 'bold 18px Poppins';
  // Usernames are still white
  ctx.fillStyle = '#FFFFFF';
  const nameY = avatarY + avatarRadius + 22;
  const trim = (s) => (s.length > 14 ? s.slice(0, 12) + '...' : s);
  drawStrokedText(ctx, '@' + trim(donatorName), 105, nameY, 4);
  drawStrokedText(ctx, '@' + trim(receiverName), cardWidth - 105, nameY, 4);
  
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

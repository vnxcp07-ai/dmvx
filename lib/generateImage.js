const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Tier config controls color and glow
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
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function fetchAvatar(userId) {
  try {
    const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`, { timeout: 5000 });
    const url = res.data.data[0].imageUrl;
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout: 5000 });
    return img.data;
  } catch { return null; }
}

let fontLoaded = false;
function ensureFont() {
    if (fontLoaded) return;
    const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    GlobalFonts.register(fontBuffer, 'Poppins');
    fontLoaded = true;
}

// Helper to draw text with a black outline
function drawStrokedText(ctx, text, x, y) {
    // This function assumes font and fillStyle are set before it's called
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 6; // A good, thick stroke
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

// Helper to tint an image (for the Robux icon)
function tintImage(image, color) {
    const canvas = createCanvas(image.width, image.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = color;
    ctx.drawImage(image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillRect(0, 0, image.width, image.height);
    return canvas;
}

// --- MAIN FUNCTION TO CREATE THE IMAGE ---
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

  // --- FIX: Create both black and colored versions of the icon for the stroke effect ---
  const tintedRobuxImg = tintImage(robuxImg, tier.accent);
  const blackRobuxImg = tintImage(robuxImg, '#000');

  const canvas = createCanvas(600, 220);
  const ctx = canvas.getContext('2d');
  
  // --- The canvas is transparent by default. NO background is drawn. ---

  const avatarRadius = 50;
  const avatarY = canvas.height / 2;
  
  function drawAvatar(image, x) {
      if (!image) return;
      ctx.save();
      // Set up glow ONLY for smite/starfall tiers
      if (tier.avatarGlow) {
        ctx.shadowColor = tier.accent;
        ctx.shadowBlur = 20;
      }
      // Always draw the colored ring
      ctx.strokeStyle = tier.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      
      // Draw the avatar image itself
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
  }
  
  // --- Drawing all elements in a clean order ---
  
  // 1. Avatars
  drawAvatar(donatorImg, 100);
  drawAvatar(receiverImg, canvas.width - 100);

  // 2. Center Content (Amount, Icon, "donated to")
  const formattedAmount = formatNumber(amount);
  const iconSize = 45;
  const gap = 12;

  // --- FIX: Use smaller font size ---
  ctx.font = 'bold 42px Poppins';
  const amountWidth = ctx.measureText(formattedAmount).width;
  const totalGroupWidth = iconSize + gap + amountWidth;
  const groupStartX = (canvas.width - totalGroupWidth) / 2;

  const iconX = groupStartX;
  const iconY = avatarY - 25;
  const amountX = groupStartX + iconSize + gap;
  const amountY = avatarY - 2;

  // --- FIX: Draw black stroke for the icon by drawing it offset ---
  const stroke = 2;
  ctx.drawImage(blackRobuxImg, iconX - stroke, iconY - stroke, iconSize, iconSize);
  ctx.drawImage(blackRobuxImg, iconX + stroke, iconY - stroke, iconSize, iconSize);
  ctx.drawImage(blackRobuxImg, iconX - stroke, iconY + stroke, iconSize, iconSize);
  ctx.drawImage(blackRobuxImg, iconX + stroke, iconY + stroke, iconSize, iconSize);
  
  // Draw the main colored icon on top
  ctx.drawImage(tintedRobuxImg, iconX, iconY, iconSize, iconSize);

  // Draw the amount text
  ctx.fillStyle = tier.accent;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  drawStrokedText(ctx, formattedAmount, amountX, amountY);
  
  // Draw the "donated to" text
  ctx.font = 'bold 24px Poppins';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  drawStrokedText(ctx, 'donated to', canvas.width / 2, avatarY + 30);

  // 3. User Names
  ctx.font = 'bold 18px Poppins';
  const nameY = avatarY + avatarRadius + 25;
  drawStrokedText(ctx, '@' + (donatorName.length > 14 ? donatorName.slice(0, 12)+'...' : donatorName), 100, nameY);
  drawStrokedText(ctx, '@' + (receiverName.length > 14 ? receiverName.slice(0, 12)+'...' : receiverName), canvas.width - 100, nameY);
  
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

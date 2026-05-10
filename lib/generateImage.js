const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// --- TIER CONFIGURATION ---
const TIERS = {
  starfall: { accent: '#ff0000', avatarGlow: true },
  smite:    { accent: '#ff0099', avatarGlow: true },
  nuke:     { accent: '#a100ff', avatarGlow: false } // Nuke tier will have a ring, but NO glow.
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

function drawStrokedText(ctx, text, x, y, strokeWidth) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

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

  const tintedRobuxImg = tintImage(robuxImg, tier.accent);

  const canvas = createCanvas(600, 220);
  const ctx = canvas.getContext('2d');
  
  // --- FIX: NO BACKGROUND IS DRAWN. The canvas is now transparent. ---

  // --- Avatar Drawing ---
  const avatarRadius = 50;
  const avatarY = canvas.height / 2;
  
  function drawAvatar(image, x) {
      if (!image) return;
      ctx.save();
      
      // --- FIX: Set up glow ONLY for smite/starfall tiers ---
      if (tier.avatarGlow) {
        ctx.shadowColor = tier.accent;
        ctx.shadowBlur = 20;
      }

      // --- FIX: Always draw the colored ring ---
      ctx.strokeStyle = tier.accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.stroke(); // This will draw a glowing ring if shadow is set, or a plain ring if not.
      
      ctx.restore(); // Restore context to remove shadow for next drawings
      
      // Draw the avatar image itself
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
  }
  
  drawAvatar(donatorImg, 100);
  drawAvatar(receiverImg, canvas.width - 100);

  // --- User Names ---
  ctx.font = 'bold 18px Poppins';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const nameY = avatarY + avatarRadius + 25;
  const trim = (s) => (s.length > 14 ? s.slice(0, 12) + '...' : s);
  drawStrokedText(ctx, '@' + trim(donatorName), 100, nameY, 4);
  drawStrokedText(ctx, '@' + trim(receiverName), canvas.width - 100, nameY, 4);

  // --- Center Content ---
  ctx.textBaseline = 'middle';
  const formattedAmount = formatNumber(amount);
  const iconSize = 45;
  const gap = 12;

  // --- FIX: Reduced font size for the amount ---
  ctx.font = 'bold 42px Poppins'; 
  const amountWidth = ctx.measureText(formattedAmount).width;
  const totalGroupWidth = iconSize + gap + amountWidth;
  const groupStartX = (canvas.width - totalGroupWidth) / 2;

  ctx.drawImage(tintedRobuxImg, groupStartX, avatarY - 25, iconSize, iconSize);

  ctx.textAlign = 'left';
  ctx.fillStyle = tier.accent;
  drawStrokedText(ctx, formattedAmount, groupStartX + iconSize + gap, avatarY - 2, 8);
  
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Poppins';
  ctx.fillStyle = '#FFFFFF';
  drawStrokedText(ctx, 'donated to', canvas.width / 2, avatarY + 30, 5);
  
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

// Tier config for colors
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

// Fetch a user's avatar from Roblox
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

// Load the font file reliably
let fontLoaded = false;
function ensureFont() {
    if (fontLoaded) return;
    const fontPath = path.join(process.cwd(), 'Poppins-Bold.ttf');
    const fontBuffer = fs.readFileSync(fontPath);
    GlobalFonts.register(fontBuffer, 'Poppins');
    fontLoaded = true;
}

// Helper to draw text with a black outline
function drawStrokedText(ctx, text, x, y, strokeWidth) {
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth;
    ctx.lineJoin = 'round';
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

// Helper to draw the dark background card
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

// MAIN FUNCTION TO CREATE THE IMAGE
async function generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount) {
  ensureFont(); // Make sure the font is ready

  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  // Load all images at the same time
  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  // Setup the canvas
  const canvas = createCanvas(600, 220);
  const ctx = canvas.getContext('2d');
  
  // 1. Draw the dark, semi-transparent background
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  drawRoundRect(ctx, 0, 0, canvas.width, canvas.height, 20);

  // 2. Draw the glowing avatars
  const avatarRadius = 50;
  const avatarY = canvas.height / 2 - 10;
  
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
  drawAvatar(receiverImg, canvas.width - 105);

  // 3. Draw the user names
  ctx.font = 'bold 18px Poppins';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  const nameY = avatarY + avatarRadius + 22;
  const trim = (s) => (s.length > 14 ? s.slice(0, 12) + '...' : s);
  drawStrokedText(ctx, '@' + trim(donatorName), 105, nameY, 4);
  drawStrokedText(ctx, '@' + trim(receiverName), canvas.width - 105, nameY, 4);

  // 4. Draw the donation amount and icon
  ctx.textBaseline = 'middle';
  const formattedAmount = formatNumber(amount);
  const iconSize = 45;
  const gap = 12;

  ctx.font = 'bold 48px Poppins';
  const amountWidth = ctx.measureText(formattedAmount).width;
  const totalGroupWidth = iconSize + gap + amountWidth;
  const groupStartX = (canvas.width - totalGroupWidth) / 2;

  ctx.drawImage(robuxImg, groupStartX, canvas.height / 2 - 35, iconSize, iconSize);

  ctx.textAlign = 'left';
  ctx.fillStyle = tier.accent; // Amount is colored
  drawStrokedText(ctx, formattedAmount, groupStartX + iconSize + gap, canvas.height / 2 - 10, 8);
  
  // 5. Draw the "donated to" text
  ctx.textAlign = 'center';
  ctx.font = 'bold 24px Poppins';
  ctx.fillStyle = '#FFFFFF'; // "donated to" is white
  drawStrokedText(ctx, 'donated to', canvas.width / 2, canvas.height / 2 + 30, 5);
  
  // Return the final image
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

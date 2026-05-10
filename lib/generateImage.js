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
async function ensureFont() {
    if (fontLoaded) return;
    try {
        // Vercel requires absolute paths for included files
        const fontPath = path.join(process.cwd(), 'public', 'Poppins-Bold.ttf');
        if (fs.existsSync(fontPath)) {
            GlobalFonts.register(fs.readFileSync(fontPath), 'Poppins');
            console.log('✅ Font loaded from disk.');
        } else {
            throw new Error('Font not found on disk.');
        }
    } catch (e) {
        // Fallback for local testing or if file is missing
        console.warn('Font from disk failed, falling back to web:', e.message);
        const fontBuffer = await axios.get('https://fonts.gstatic.com/s/poppins/v20/pxiByp8kv8JHgFVrLCz7Z1xlFQ.ttf', { responseType: 'arraybuffer' });
        GlobalFonts.register(fontBuffer.data, 'Poppins');
        console.log('✅ Font loaded from web.');
    }
    fontLoaded = true;
}

// --- CANVAS DRAWING HELPERS ---

// Draws text with a thick black stroke for readability
function drawStrokedText(ctx, text, x, y, strokeWidth) {
    ctx.font = 'bold 24px Poppins'; // Default font, can be overridden before calling
    ctx.strokeStyle = '#000';
    ctx.lineWidth = strokeWidth;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
}

// Draws a rounded rectangle, as canvas doesn't have a built-in one
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

  // --- 1. Fetch all assets concurrently ---
  const [donatorBuf, receiverBuf, robuxImg, _] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
    ensureFont() // Ensure the font is ready before drawing
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  // --- 2. Setup Canvas ---
  const cardWidth = 600;
  const cardHeight = 220;
  const canvas = createCanvas(cardWidth, cardHeight);
  const ctx = canvas.getContext('2d');
  
  // --- 3. Draw Background Card ---
  // A semi-transparent dark card that will show through the transparent background
  ctx.fillStyle = 'rgba(20, 20, 20, 0.85)';
  drawRoundRect(ctx, 0, 0, cardWidth, cardHeight, 20);

  // --- 4. Draw Avatars with Glows ---
  const avatarRadius = 50;
  const avatarY = cardHeight / 2 - 10;
  
  function drawAvatar(image, x) {
      if (!image) return;
      ctx.save();
      // Draw the glow
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur = 20;
      // Draw the border
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.strokeStyle = tier.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      
      // Clip and draw the avatar image
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, avatarY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, avatarY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
  }
  
  drawAvatar(donatorImg, 105);
  drawAvatar(receiverImg, cardWidth - 105);

  // --- 5. Draw Text and Robux Icon ---
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  
  // Amount
  ctx.font = 'bold 48px Poppins';
  ctx.fillStyle = tier.accent;
  drawStrokedText(ctx, formatNumber(amount), cardWidth / 2 + 30, cardHeight / 2 - 10, 8);

  // Robux Icon
  ctx.drawImage(robuxImg, 180, cardHeight / 2 - 35, 45, 45);

  // "donated to"
  ctx.font = 'bold 24px Poppins';
  ctx.fillStyle = '#ffffff';
  drawStrokedText(ctx, 'donated to', cardWidth / 2, cardHeight / 2 + 30, 5);

  // Usernames
  ctx.font = 'bold 18px Poppins';
  const nameY = avatarY + avatarRadius + 22;
  const trim = (s) => (s.length > 14 ? s.slice(0, 12) + '...' : s);
  drawStrokedText(ctx, '@' + trim(donatorName), 105, nameY, 4);
  drawStrokedText(ctx, '@' + trim(receiverName), cardWidth - 105, nameY, 4);
  
  // --- 6. Return final image buffer ---
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

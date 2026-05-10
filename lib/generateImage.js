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

// --- ASSET FETCHING (Unchanged) ---
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

// --- HELPER to tint an image ---
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
async function generateDonationImage(donatorId, receiverId, amount) {
  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  // Fetch all assets
  const [donatorBuf, receiverBuf, robuxImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(receiverId),
    loadImage(path.join(process.cwd(), 'robux.png')),
  ]);

  const donatorImg = donatorBuf ? await loadImage(donatorBuf) : null;
  const receiverImg = receiverBuf ? await loadImage(receiverBuf) : null;

  // Tint the robux icon with the tier color
  const tintedRobuxImg = tintImage(robuxImg, tier.accent);

  // Setup canvas
  const canvas = createCanvas(600, 220);
  const ctx = canvas.getContext('2d');
  
  // The canvas is transparent by default. We will not draw any background.

  // --- Layout Positions ---
  const centerY = canvas.height / 2;
  const avatarRadius = 50;
  const leftAvatarX = 105;
  const rightAvatarX = canvas.width - 105;
  const iconSize = 45;
  
  // --- Reusable Drawing Functions ---
  
  // Draws the glowing avatar
  function drawGlowingAvatar(image, x) {
      if (!image) return;
      ctx.save();
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur = 20;
      ctx.beginPath();
      ctx.arc(x, centerY, avatarRadius, 0, Math.PI * 2);
      ctx.strokeStyle = tier.accent;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.restore();
      
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, centerY, avatarRadius, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(image, x - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
      ctx.restore();
  }

  // Draws the glowing Robux icon
  function drawGlowingIcon(image) {
      ctx.save();
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur = 15;
      ctx.drawImage(image, canvas.width / 2 - iconSize / 2, centerY - iconSize / 2, iconSize, iconSize);
      ctx.restore();
  }

  // --- Draw the final elements ---
  drawGlowingAvatar(donatorImg, leftAvatarX);
  drawGlowingAvatar(receiverImg, rightAvatarX);
  drawGlowingIcon(tintedRobuxImg);

  // NO TEXT IS DRAWN ON THE IMAGE

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

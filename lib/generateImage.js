const { createCanvas, loadImage } = require('@napi-rs/canvas');
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

// --- Helper to tint an image ---
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
async function generateDonationImage(amount) {
  const tierName = getTier(amount);
  const tier = TIERS[tierName];

  // Load the single asset we need
  const robuxImg = await loadImage(path.join(process.cwd(), 'robux.png'));

  // Tint the Robux icon with the tier color
  const tintedRobuxImg = tintImage(robuxImg, tier.accent);

  // Create a small, square, transparent canvas
  const canvas = createCanvas(200, 200);
  const ctx = canvas.getContext('2d');
  
  const iconSize = 45;
  
  // Draw the glowing icon in the exact center
  ctx.save();
  ctx.shadowColor = tier.accent;
  ctx.shadowBlur = 15;
  ctx.drawImage(
    tintedRobuxImg, 
    canvas.width / 2 - iconSize / 2, 
    canvas.height / 2 - iconSize / 2, 
    iconSize, 
    iconSize
  );
  ctx.restore();
  
  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

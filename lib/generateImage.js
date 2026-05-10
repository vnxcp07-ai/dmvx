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

  // Make canvas wider to ensure nothing clips off
  const canvas = createCanvas(620, 240);
  const ctx = canvas.getContext('2d');

  const avatarRadius = 50;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;

  // Draw avatar: image first, ring on top
  function drawAvatar(image, x) {
    if (!image) return;

    // 1. Clipped avatar image
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, centerY, avatarRadius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(image, x - avatarRadius, centerY - avatarRadius, avatarRadius * 2, avatarRadius * 2);
    ctx.restore();

    // 2. Ring drawn ON TOP
    ctx.save();
    if (tier.avatarGlow) {
      ctx.shadowColor = tier.accent;
      ctx.shadowBlur  = 25;
    }
    ctx.strokeStyle = tier.accent;
    ctx.lineWidth   = 5;
    ctx.beginPath();
    ctx.arc(x, centerY, avatarRadius + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // ---- Draw Avatars ----
  drawAvatar(donatorImg,  100);
  drawAvatar(receiverImg, canvas.width - 100);

  // ---- Center: Robux icon + Amount stacked ----
  // Draw icon centered
  const iconSize = 36;
  const iconX = centerX - iconSize / 2;
  const iconY = centerY - 38;

  // Black stroke offset for icon
  const s = 2;
  [[-s,-s],[s,-s],[-s,s],[s,s]].forEach(([ox, oy]) => {
    ctx.drawImage(blackRobuxImg, iconX + ox, iconY + oy, iconSize, iconSize);
  });
  ctx.drawImage(tintedRobuxImg, iconX, iconY, iconSize, iconSize);

  // Amount text - centered, below icon
  const formattedAmount = formatNumber(amount);
  ctx.font         = 'bold 36px Poppins';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'middle';

  // Black stroke for text
  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.lineWidth   = 5;
  ctx.lineJoin    = 'round';
  ctx.strokeText(formattedAmount, centerX, centerY + 5);

  // Colored fill
  ctx.fillStyle = tier.accent;
  ctx.fillText(formattedAmount, centerX, centerY + 5);

  // "donated to" text
  ctx.font      = 'bold 18px Poppins';
  ctx.fillStyle = '#FFFFFF';

  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.lineWidth   = 4;
  ctx.strokeText('donated to', centerX, centerY + 42);
  ctx.fillText('donated to', centerX, centerY + 42);

  // ---- Usernames ----
  ctx.font      = 'bold 16px Poppins';
  ctx.fillStyle = '#FFFFFF';

  const nameY = centerY + avatarRadius + 22;

  const dName = donatorName.length  > 14 ? donatorName.slice(0, 12) + '…' : donatorName;
  const rName = receiverName.length > 14 ? receiverName.slice(0, 12) + '…' : receiverName;

  ctx.strokeStyle = 'rgba(0,0,0,0.95)';
  ctx.lineWidth   = 4;

  ctx.strokeText('@' + dName, 100, nameY);
  ctx.fillText('@' + dName, 100, nameY);

  ctx.strokeText('@' + rName, canvas.width - 100, nameY);
  ctx.fillText('@' + rName, canvas.width - 100, nameY);

  return canvas.toBuffer('image/png');
}

module.exports = { generateDonationImage };

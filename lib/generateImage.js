const { createCanvas, loadImage } = require("canvas");
const axios = require("axios");
const path = require("path");

const TIERS = {
  nuke: {
    accentColor: "#9933ff",
    borderColor: "#cc66ff",
    glowColor:   "#9933ff",
    amountColor: "#cc66ff",
    bgColor:     "rgba(30, 10, 50, 0.9)",
  },
  smite: {
    accentColor: "#ff0099",
    borderColor: "#ff66cc",
    glowColor:   "#ff0099",
    amountColor: "#ff66cc",
    bgColor:     "rgba(40, 0, 25, 0.9)",
  },
  starfall: {
    accentColor: "#ff2200",
    borderColor: "#ff4444",
    glowColor:   "#ff2200",
    amountColor: "#ff4444",
    bgColor:     "rgba(40, 0, 0, 0.9)",
  },
};

function getTier(amount) {
  if (amount >= 10000000) return "starfall";
  if (amount >= 1000000)  return "smite";
  return "nuke";
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "..." : str;
}

function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

async function fetchAvatar(userId) {
  try {
    const json = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { timeout: 5000 }
    );
    const url = json.data?.data?.[0]?.imageUrl;
    if (!url) throw new Error("no url");
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 5000 });
    return await loadImage(Buffer.from(res.data));
  } catch (e) {
    console.log("Avatar fetch failed for", userId, e.message);
    return null;
  }
}

function drawAvatar(ctx, img, cx, cy, radius, borderColor, glowColor) {
  ctx.save();

  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 22;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 5;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    ctx.fillStyle = "#222222";
    ctx.fill();
    ctx.fillStyle    = "#666666";
    ctx.font         = "bold 28px Arial";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
  }

  ctx.restore();
}

async function generateDonationImage(donatorName, raisedName, donatorId, raiserId, amount) {
  const tier   = getTier(amount);
  const config = TIERS[tier];

  const W = 700;
  const H = 220;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // transparent base
  ctx.clearRect(0, 0, W, H);

  // background panel
  roundedRect(ctx, 0, 0, W, H, 16);
  ctx.fillStyle = config.bgColor;
  ctx.fill();

  // gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(255,255,255,0.05)");
  grad.addColorStop(1, "rgba(0,0,0,0.25)");
  roundedRect(ctx, 0, 0, W, H, 16);
  ctx.fillStyle = grad;
  ctx.fill();

  // left accent bar
  ctx.fillStyle = config.accentColor;
  ctx.fillRect(0, 0, 8, H);

  // border
  roundedRect(ctx, 2, 2, W - 4, H - 4, 14);
  ctx.strokeStyle = config.borderColor + "44";
  ctx.lineWidth   = 2;
  ctx.stroke();

  // load images
  const robuxPath = path.join(process.cwd(), "robux.png");
  const [donatorImg, raiserImg, robuxIcon] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(raiserId),
    loadImage(robuxPath).catch(() => null),
  ]);

  // avatars
  const AV_RADIUS = 55;
  const AV_Y      = H / 2 - 14;
  const DON_X     = 105;
  const RAIS_X    = W - 105;

  drawAvatar(ctx, donatorImg, DON_X,  AV_Y, AV_RADIUS, config.borderColor, config.glowColor);
  drawAvatar(ctx, raiserImg,  RAIS_X, AV_Y, AV_RADIUS, config.borderColor, config.glowColor);

  // center: robux icon + amount
  const formatted = formatNumber(amount);
  ctx.font = "bold 42px Arial";
  const textWidth  = ctx.measureText(formatted).width;
  const iconSize   = 40;
  const gap        = 10;
  const totalWidth = iconSize + gap + textWidth;
  const startX     = (W - totalWidth) / 2;
  const centerY    = H / 2 - 20;

  if (robuxIcon) {
    ctx.save();
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur  = 16;
    ctx.drawImage(robuxIcon, startX, centerY - iconSize / 2, iconSize, iconSize);
    ctx.restore();
  }

  ctx.save();
  ctx.shadowColor  = config.glowColor;
  ctx.shadowBlur   = 20;
  ctx.fillStyle    = config.amountColor;
  ctx.font         = "bold 42px Arial";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatted, startX + iconSize + gap, centerY);
  ctx.restore();

  // donated to
  ctx.fillStyle    = "#dddddd";
  ctx.font         = "22px Arial";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("donated to", W / 2, H / 2 + 24);

  // usernames
  const LABEL_Y = AV_Y + AV_RADIUS + 24;
  ctx.fillStyle    = "#eeeeee";
  ctx.font         = "bold 15px Arial";
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(truncate(donatorName, 16), DON_X,  LABEL_Y);
  ctx.fillText(truncate(raisedName,  16), RAIS_X, LABEL_Y);

  return canvas.toBuffer("image/png");
}

module.exports = { generateDonationImage, getTier };

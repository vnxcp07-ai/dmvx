const { createCanvas, loadImage } = require("@napi-rs/canvas");
const axios = require("axios");
const path = require("path");

// ── Tier configs ──────────────────────────────────────────────────────────────
const TIERS = {
  nuke: {
    accentColor: "#9933ff",
    borderColor: "#cc66ff",
    glowColor:   "#9933ff",
    amountColor: "#cc66ff",
    bgColor:     "rgba(30, 10, 50, 0.85)",
  },
  smite: {
    accentColor: "#ff0099",
    borderColor: "#ff66cc",
    glowColor:   "#ff0099",
    amountColor: "#ff66cc",
    bgColor:     "rgba(40, 0, 25, 0.85)",
  },
  starfall: {
    accentColor: "#ff2200",
    borderColor: "#ff4444",
    glowColor:   "#ff2200",
    amountColor: "#ff4444",
    bgColor:     "rgba(40, 0, 0, 0.85)",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function getTier(amount) {
  if (amount >= 10_000_000) return "starfall";
  if (amount >= 1_000_000)  return "smite";
  return "nuke";
}

function formatNumber(n) {
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function truncate(str, max) {
  return str.length > max ? str.slice(0, max - 1) + "…" : str;
}

// ── Draw rounded rect path ────────────────────────────────────────────────────
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y,         x + r, y);
  ctx.closePath();
}

// ── Fetch Roblox avatar ───────────────────────────────────────────────────────
async function fetchAvatar(userId) {
  try {
    const res = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { timeout: 6000, responseType: "arraybuffer" }
    );
    // get redirect url from json first
    const json = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { timeout: 6000 }
    );
    const url = json.data?.data?.[0]?.imageUrl;
    if (!url) throw new Error("no url");
    const imgRes = await axios.get(url, {
      timeout: 6000,
      responseType: "arraybuffer"
    });
    return await loadImage(Buffer.from(imgRes.data));
  } catch {
    return null;
  }
}

// ── Draw circular avatar with glow border ─────────────────────────────────────
function drawAvatar(ctx, img, cx, cy, radius, borderColor, glowColor) {
  ctx.save();

  // Glow
  ctx.shadowColor = glowColor;
  ctx.shadowBlur  = 20;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 4;
  ctx.stroke();
  ctx.shadowBlur  = 0;

  // Clip circle for avatar
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    // Placeholder grey circle
    ctx.fillStyle = "#2a2a2a";
    ctx.fill();
    ctx.fillStyle    = "#888";
    ctx.font         = "bold 30px Arial";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
  }

  ctx.restore();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function generateDonationImage(
  donatorName,
  raisedName,
  donatorId,
  raiserId,
  amount
) {
  const tier   = getTier(amount);
  const config = TIERS[tier];

  const W = 700;
  const H = 210;

  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // ── Clear to fully transparent ─────────────────────────────────────────────
  ctx.clearRect(0, 0, W, H);

  // ── Semi-transparent dark background panel ─────────────────────────────────
  roundedRect(ctx, 0, 0, W, H, 16);
  ctx.fillStyle = config.bgColor;
  ctx.fill();

  // Subtle gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(255,255,255,0.04)");
  grad.addColorStop(1, "rgba(0,0,0,0.20)");
  roundedRect(ctx, 0, 0, W, H, 16);
  ctx.fillStyle = grad;
  ctx.fill();

  // ── Left accent bar ────────────────────────────────────────────────────────
  // Rounded only on left corners
  ctx.beginPath();
  ctx.moveTo(6, 0);
  ctx.lineTo(6, H);
  ctx.lineTo(0, H);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = config.accentColor;
  ctx.fill();

  // ── Subtle border ──────────────────────────────────────────────────────────
  roundedRect(ctx, 1, 1, W - 2, H - 2, 15);
  ctx.strokeStyle = config.borderColor + "55";
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Load avatars + robux icon in parallel ──────────────────────────────────
  const robuxIconPath = path.join(process.cwd(), "robux.png");
  const [donatorImg, raiserImg, robuxIcon] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(raiserId),
    loadImage(robuxIconPath).catch(() => null),
  ]);

  // ── Avatars ────────────────────────────────────────────────────────────────
  const AV_RADIUS = 55;
  const AV_Y      = H / 2 - 16;
  const DON_X     = 105;
  const RAIS_X    = W - 105;

  drawAvatar(ctx, donatorImg, DON_X,  AV_Y, AV_RADIUS, config.borderColor, config.glowColor);
  drawAvatar(ctx, raiserImg,  RAIS_X, AV_Y, AV_RADIUS, config.borderColor, config.glowColor);

  // ── Centre block ───────────────────────────────────────────────────────────
  const formatted  = formatNumber(amount);
  const ICON_SIZE  = 38;

  // Measure text so we can center icon+text together
  ctx.font = "bold 42px Arial";
  const textWidth  = ctx.measureText(formatted).width;
  const totalWidth = ICON_SIZE + 8 + textWidth;
  const startX     = (W - totalWidth) / 2;
  const CENTER_Y   = H / 2 - 20;

  // Robux icon
  if (robuxIcon) {
    ctx.save();
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur  = 14;
    ctx.drawImage(robuxIcon, startX, CENTER_Y - ICON_SIZE / 2, ICON_SIZE, ICON_SIZE);
    ctx.restore();
  } else {
    // Fallback circle with R$
    ctx.save();
    ctx.shadowColor = config.glowColor;
    ctx.shadowBlur  = 14;
    ctx.beginPath();
    ctx.arc(startX + ICON_SIZE / 2, CENTER_Y, ICON_SIZE / 2, 0, Math.PI * 2);
    ctx.fillStyle = config.amountColor;
    ctx.fill();
    ctx.restore();
    ctx.fillStyle    = "#fff";
    ctx.font         = "bold 16px Arial";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("R$", startX + ICON_SIZE / 2, CENTER_Y);
  }

  // Amount text
  ctx.save();
  ctx.shadowColor  = config.glowColor;
  ctx.shadowBlur   = 20;
  ctx.fillStyle    = config.amountColor;
  ctx.font         = "bold 42px Arial";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatted, startX + ICON_SIZE + 8, CENTER_Y);
  ctx.restore();

  // "donated to"
  ctx.fillStyle    = "#cccccc";
  ctx.font         = "22px Arial";
  ctx.textAlign    = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("donated to", W / 2, H / 2 + 22);

  // ── Username labels ────────────────────────────────────────────────────────
  const LABEL_Y = AV_Y + AV_RADIUS + 20;

  ctx.fillStyle    = "#eeeeee";
  ctx.font         = "bold 14px Arial";
  ctx.textAlign    = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillText(truncate(donatorName, 16), DON_X,  LABEL_Y);
  ctx.fillText(truncate(raisedName,  16), RAIS_X, LABEL_Y);

  // Output as PNG (supports transparency)
  return canvas.toBuffer("image/png");
}

module.exports = { generateDonationImage, getTier };

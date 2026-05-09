const { createCanvas, loadImage } = require("@napi-rs/canvas");
const axios = require("axios");

// ── Tier configs ─────────────────────────────────────────────────────────────
const TIERS = {
  nuke: {
    bgColor:      "#120820",
    accentColor:  "#9933ff",
    borderColor:  "#cc66ff",
    glowColor:    "#9933ff",
    amountColor:  "#cc66ff",
    label:        "NUKE",
  },
  smite: {
    bgColor:      "#160010",
    accentColor:  "#ff0099",
    borderColor:  "#ff66cc",
    glowColor:    "#ff0099",
    amountColor:  "#ff66cc",
    label:        "SMITE",
  },
  starfall: {
    bgColor:      "#160000",
    accentColor:  "#ff2200",
    borderColor:  "#ff4444",
    glowColor:    "#ff2200",
    amountColor:  "#ff4444",
    label:        "STARFALL",
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────
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

// ── Drawing helpers ───────────────────────────────────────────────────────────
function drawRoundedRect(ctx, x, y, w, h, r) {
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

async function fetchAvatar(userId) {
  try {
    const res = await axios.get(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot` +
      `?userIds=${userId}&size=150x150&format=Png&isCircular=false`,
      { timeout: 6000 }
    );
    const url = res.data?.data?.[0]?.imageUrl;
    if (!url) throw new Error("no url");
    return await loadImage(url);
  } catch {
    return null;
  }
}

function drawAvatar(ctx, img, cx, cy, radius, borderColor, glowColor) {
  ctx.save();

  // Outer glow ring
  ctx.shadowColor  = glowColor;
  ctx.shadowBlur   = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle  = borderColor;
  ctx.lineWidth    = 4;
  ctx.stroke();
  ctx.shadowBlur   = 0;

  // Clip to circle
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (img) {
    ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  } else {
    // Fallback placeholder
    ctx.fillStyle = "#2a2a2a";
    ctx.fill();
    ctx.fillStyle   = "#888";
    ctx.font        = "bold 28px Arial";
    ctx.textAlign   = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("?", cx, cy);
  }

  ctx.restore();
}

// ── Main export ───────────────────────────────────────────────────────────────
async function generateDonationImage(
  donatorName,
  raisedName,
  donatorId,
  raiserId,
  amount
) {
  const tier   = getTier(amount);
  const config = TIERS[tier];

  const W = 720;
  const H = 230;
  const canvas = createCanvas(W, H);
  const ctx    = canvas.getContext("2d");

  // ── Background ──────────────────────────────────────────────────────────────
  drawRoundedRect(ctx, 0, 0, W, H, 18);
  ctx.fillStyle = config.bgColor;
  ctx.fill();

  // Subtle diagonal gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, "rgba(255,255,255,0.04)");
  grad.addColorStop(1, "rgba(0,0,0,0.15)");
  drawRoundedRect(ctx, 0, 0, W, H, 18);
  ctx.fillStyle = grad;
  ctx.fill();

  // Left accent bar
  ctx.fillStyle = config.accentColor;
  ctx.fillRect(0, 0, 6, H);

  // Border
  drawRoundedRect(ctx, 1, 1, W - 2, H - 2, 17);
  ctx.strokeStyle = config.borderColor + "66";
  ctx.lineWidth   = 1.5;
  ctx.stroke();

  // ── Avatars ─────────────────────────────────────────────────────────────────
  const [donatorImg, raiserImg] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(raiserId),
  ]);

  const AV_RADIUS = 58;
  const AV_Y      = H / 2 - 14;
  const DON_X     = 100;
  const RAIS_X    = W - 100;

  drawAvatar(ctx, donatorImg, DON_X,  AV_Y, AV_RADIUS, config.borderColor, config.glowColor);
  drawAvatar(ctx, raiserImg,  RAIS_X, AV_Y, AV_RADIUS, config.borderColor, config.glowColor);

  // ── Centre: robux icon + amount ─────────────────────────────────────────────
  const MID_X   = W / 2;
  const ICON_R  = 22;
  const ICON_X  = MID_X - 80;
  const ICON_Y  = H / 2 - 36;

  // Icon circle
  ctx.save();
  ctx.shadowColor = config.glowColor;
  ctx.shadowBlur  = 18;
  ctx.beginPath();
  ctx.arc(ICON_X, ICON_Y, ICON_R, 0, Math.PI * 2);
  ctx.fillStyle = config.amountColor;
  ctx.fill();
  ctx.restore();

  ctx.fillStyle       = "#ffffff";
  ctx.font            = "bold 18px Arial";
  ctx.textAlign       = "center";
  ctx.textBaseline    = "middle";
  ctx.fillText("R$", ICON_X, ICON_Y);

  // Amount number
  const formatted = formatNumber(amount);
  ctx.save();
  ctx.shadowColor  = config.glowColor;
  ctx.shadowBlur   = 22;
  ctx.fillStyle    = config.amountColor;
  ctx.font         = "bold 44px Arial";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(formatted, ICON_X + ICON_R + 8, ICON_Y);
  ctx.restore();

  // "donated to" sub-label
  ctx.fillStyle       = "#bbbbbb";
  ctx.font            = "22px Arial";
  ctx.textAlign       = "center";
  ctx.textBaseline    = "middle";
  ctx.fillText("donated to", MID_X, H / 2 + 20);

  // ── Username labels ──────────────────────────────────────────────────────────
  const LABEL_Y = AV_Y + AV_RADIUS + 22;

  ctx.fillStyle       = "#eeeeee";
  ctx.font            = "bold 15px Arial";
  ctx.textAlign       = "center";
  ctx.textBaseline    = "alphabetic";

  ctx.fillText(truncate(donatorName, 16), DON_X,  LABEL_Y);
  ctx.fillText(truncate(raisedName,  16), RAIS_X, LABEL_Y);

  return canvas.toBuffer("image/png");
}

module.exports = { generateDonationImage, getTier };

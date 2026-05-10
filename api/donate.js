const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');
const axios = require('axios');
const FormData = require('form-data');
const path = require('path');
const fs = require('fs');

function formatNumber(n) {
  return parseInt(n).toLocaleString('en-US');
}

function hexToDec(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

async function fetchBuffer(url) {
  try {
    var res = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0' },
      maxRedirects: 5,
    });
    return Buffer.from(res.data);
  } catch (e) {
    console.warn('fetchBuffer failed:', url, e.message);
    return null;
  }
}

// Font loading — tries local paths first, then GitHub raw URL
var fontName = 'sans-serif';
var fontLoaded = false;

async function ensureFont() {
  if (fontLoaded) return;

  // Try local paths
  var localPaths = [
    path.join(__dirname, '..', 'Poppins-Bold.ttf'),
    path.join(__dirname, 'Poppins-Bold.ttf'),
    '/var/task/Poppins-Bold.ttf',
  ];

  for (var i = 0; i < localPaths.length; i++) {
    var p = localPaths[i];
    try {
      var buf = fs.readFileSync(p);
      GlobalFonts.register(buf, 'DonationFont');
      fontName = 'DonationFont';
      fontLoaded = true;
      console.log('[Font] Loaded from local path:', p);
      return;
    } catch (e) {
      console.log('[Font] Not found at:', p);
    }
  }

  // Fallback: fetch from GitHub raw (font is in the repo)
  console.log('[Font] Trying GitHub raw URL...');
  var urls = [
    'https://raw.githubusercontent.com/vnxcp07-ai/dmvx/main/Poppins-Bold.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/poppins/Poppins-Bold.ttf',
  ];

  for (var j = 0; j < urls.length; j++) {
    var buf2 = await fetchBuffer(urls[j]);
    if (!buf2) continue;
    try {
      GlobalFonts.register(buf2, 'DonationFont');
      fontName = 'DonationFont';
      fontLoaded = true;
      console.log('[Font] Loaded from URL:', urls[j]);
      return;
    } catch (e) {
      console.warn('[Font] Register failed from URL:', e.message);
    }
  }

  console.error('[Font] ALL font sources failed — text will not render');
}

// Robux icon
var robuxIconCache = null;

async function getRobuxIcon() {
  if (robuxIconCache) return robuxIconCache;

  var localPath = path.join(__dirname, '..', 'robux.png');
  try {
    var buf = fs.readFileSync(localPath);
    robuxIconCache = await loadImage(buf);
    console.log('[Robux] Loaded from local file');
    return robuxIconCache;
  } catch (e) {
    console.warn('[Robux] Local load failed:', e.message);
  }

  var buf2 = await fetchBuffer('https://raw.githubusercontent.com/vnxcp07-ai/dmvx/main/robux.png');
  if (buf2) {
    try {
      robuxIconCache = await loadImage(buf2);
      console.log('[Robux] Loaded from URL');
    } catch (e) {
      console.warn('[Robux] URL load failed:', e.message);
    }
  }
  return robuxIconCache;
}

function tintIcon(img, size, hexColor) {
  var off = createCanvas(size, size);
  var ctx = off.getContext('2d');
  ctx.drawImage(img, 0, 0, size, size);
  ctx.globalCompositeOperation = 'source-in';
  ctx.fillStyle = hexColor;
  ctx.fillRect(0, 0, size, size);
  return off;
}

function drawRobuxWithStroke(ctx, img, cx, cy, iconSize, color, strokeWidth) {
  var strokeSize = iconSize + strokeWidth * 2;
  var blackOff = createCanvas(strokeSize, strokeSize);
  var blackCtx = blackOff.getContext('2d');
  blackCtx.drawImage(img, 0, 0, strokeSize, strokeSize);
  blackCtx.globalCompositeOperation = 'source-in';
  blackCtx.fillStyle = 'rgba(0,0,0,0.9)';
  blackCtx.fillRect(0, 0, strokeSize, strokeSize);

  var offsets = [
    [-strokeWidth, -strokeWidth], [0, -strokeWidth], [strokeWidth, -strokeWidth],
    [-strokeWidth, 0],                               [strokeWidth, 0],
    [-strokeWidth,  strokeWidth], [0,  strokeWidth], [strokeWidth,  strokeWidth],
  ];
  for (var k = 0; k < offsets.length; k++) {
    var ox = offsets[k][0];
    var oy = offsets[k][1];
    ctx.drawImage(blackOff,
      cx - iconSize / 2 + ox - strokeWidth,
      cy - iconSize / 2 + oy - strokeWidth,
      strokeSize, strokeSize
    );
  }
  var tinted = tintIcon(img, iconSize, color);
  ctx.drawImage(tinted, cx - iconSize / 2, cy - iconSize / 2, iconSize, iconSize);
}

function drawStrokedText(ctx, text, x, y, font, fillColor, strokeWidth, align, baseline) {
  align    = align    || 'center';
  baseline = baseline || 'alphabetic';
  ctx.save();
  ctx.font         = font;
  ctx.textAlign    = align;
  ctx.textBaseline = baseline;
  ctx.lineJoin     = 'round';
  ctx.miterLimit   = 2;
  ctx.strokeStyle  = 'rgba(0,0,0,0.9)';
  ctx.lineWidth    = strokeWidth;
  ctx.strokeText(text, x, y);
  ctx.fillStyle    = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function drawAvatar(ctx, img, cx, cy, radius, borderColor) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, cx - radius, cy - radius, radius * 2, radius * 2);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth   = 6;
  ctx.shadowColor = borderColor;
  ctx.shadowBlur  = 25;
  ctx.stroke();
  ctx.restore();
}

function drawBackground(ctx, W, H, themeHex, glow) {
  ctx.clearRect(0, 0, W, H);
  if (glow === 'none') return;

  var r = parseInt(themeHex.slice(1, 3), 16);
  var g = parseInt(themeHex.slice(3, 5), 16);
  var b = parseInt(themeHex.slice(5, 7), 16);

  if (glow === 'high') {
    var grad = ctx.createRadialGradient(W / 2, H + 30, 20, W / 2, H * 0.65, W * 0.78);
    grad.addColorStop(0,    'rgba(' + r + ',0,0,1)');
    grad.addColorStop(0.30, 'rgba(' + Math.floor(r * 0.65) + ',0,0,0.88)');
    grad.addColorStop(0.60, 'rgba(' + Math.floor(r * 0.35) + ',0,0,0.55)');
    grad.addColorStop(1,    'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else if (glow === 'medium') {
    var grad2 = ctx.createRadialGradient(W / 2, H + 10, 0, W / 2, H * 0.85, W * 0.62);
    grad2.addColorStop(0,   'rgba(' + r + ',' + Math.floor(g * 0.08) + ',' + Math.floor(b * 0.28) + ',0.55)');
    grad2.addColorStop(0.5, 'rgba(' + Math.floor(r * 0.45) + ',0,' + Math.floor(b * 0.1) + ',0.28)');
    grad2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = grad2;
    ctx.fillRect(0, 0, W, H);
  }
}

async function fetchAvatarUrl(userId) {
  try {
    var url = 'https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=' + userId + '&size=150x150&format=Png';
    var res = await axios.get(url, { timeout: 5000 });
    return res.data.data[0].imageUrl;
  } catch (e) {
    console.warn('[Avatar] Failed for userId', userId, e.message);
    return null;
  }
}

function getTier(amount) {
  if (amount >= 10000000) return { hex: '#ff0000', emoji: '<:starfall:1490655938506395829>', glow: 'high' };
  if (amount >= 1000000)  return { hex: '#FF0099', emoji: '<:smitebro:1490655992025841804>', glow: 'medium' };
  return                         { hex: '#FF00B5', emoji: '<:nukeig:1490656026603683940>',  glow: 'none' };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    var body         = req.body;
    var donatorName  = body.donatorName;
    var receiverName = body.receiverName;
    var donatorId    = body.donatorId;
    var receiverId   = body.receiverId;
    var amount       = body.amount;

    if (!donatorId || !receiverId || amount == null) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    var WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
    if (!WEBHOOK) return res.status(500).json({ error: 'No webhook URL configured' });

    var numAmount = parseInt(typeof amount === 'string' ? amount.replace(/,/g, '') : amount);
    var tier      = getTier(numAmount);
    var themeHex  = tier.hex;
    var emoji     = tier.emoji;
    var glow      = tier.glow;

    await ensureFont();
    await getRobuxIcon();
    console.log('[Font] Active:', fontName, '| fontLoaded:', fontLoaded);

    var donatorAvatarUrl  = await fetchAvatarUrl(donatorId);
    var receiverAvatarUrl = await fetchAvatarUrl(receiverId);

    var dBuf = donatorAvatarUrl  ? await fetchBuffer(donatorAvatarUrl)  : null;
    var rBuf = receiverAvatarUrl ? await fetchBuffer(receiverAvatarUrl) : null;

    if (!dBuf || !rBuf) {
      return res.status(500).json({ error: 'Avatar image fetch failed' });
    }

    var dImg = await loadImage(dBuf);
    var rImg = await loadImage(rBuf);

    var W = 1000, H = 260;
    var canvas = createCanvas(W, H);
    var ctx    = canvas.getContext('2d');

    drawBackground(ctx, W, H, themeHex, glow);

    var avatarRadius = 80;
    var avatarCY     = H / 2 - 16;
    var leftCX       = 130;
    var rightCX      = W - 130;
    var centerX      = W / 2;

    drawAvatar(ctx, dImg, leftCX,  avatarCY, avatarRadius, themeHex);
    drawAvatar(ctx, rImg, rightCX, avatarCY, avatarRadius, themeHex);

    var iconSize = 56;
    var amtText  = formatNumber(numAmount);
    var amtFont  = 'bold 68px ' + fontName;
    var gap      = 14;
    var amtRowY  = H / 2 - 20;

    ctx.font = amtFont;
    var amtWidth  = ctx.measureText(amtText).width;
    console.log('[Text] "' + amtText + '" width=' + amtWidth + ' font=' + amtFont);

    var groupW    = iconSize + gap + amtWidth;
    var groupLeft = centerX - groupW / 2;

    if (robuxIconCache) {
      drawRobuxWithStroke(ctx, robuxIconCache,
        groupLeft + iconSize / 2, amtRowY,
        iconSize, themeHex, 3
      );
    }

    drawStrokedText(ctx, amtText,
      groupLeft + iconSize + gap, amtRowY,
      amtFont, themeHex, 6, 'left', 'middle'
    );

    drawStrokedText(ctx, 'donated to',
      centerX, H / 2 + 42,
      'bold 30px ' + fontName, '#FFFFFF', 5
    );

    var nameY = avatarCY + avatarRadius + 26;

    function trim(s, max) {
      max = max || 16;
      return s.length > max ? s.slice(0, max) + '..' : s;
    }

    drawStrokedText(ctx, '@' + trim(donatorName  || 'Unknown'), leftCX,  nameY, 'bold 16px ' + fontName, '#FFFFFF', 4);
    drawStrokedText(ctx, '@' + trim(receiverName || 'Unknown'), rightCX, nameY, 'bold 16px ' + fontName, '#FFFFFF', 4);

    var imgBuf = canvas.toBuffer('image/png');
    var form   = new FormData();

    var now = new Date();
    var hh  = now.getHours();
    var mm  = now.getMinutes().toString().padStart(2, '0');
    var ap  = hh >= 12 ? 'PM' : 'AM';
    var dh  = hh % 12 || 12;

    var payload = {
      content: emoji + ' `@' + donatorName + '` donated <:robux:1451215082640900146> **' + formatNumber(numAmount) + ' Robux** to `@' + receiverName + '`',
      embeds: [{
        color:  hexToDec(themeHex),
        image:  { url: 'attachment://donation.png' },
        footer: { text: 'Donated on \u2022 Today at ' + dh + ':' + mm + ' ' + ap },
      }],
    };

    form.append('payload_json', JSON.stringify(payload));
    form.append('files[0]', imgBuf, { filename: 'donation.png', contentType: 'image/png' });

    await axios.post(WEBHOOK, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return res.status(200).json({ success: true });

  } catch (err) {
    console.error('[Handler] Error:', err.message, err.stack);
    return res.status(500).json({ error: err.message });
  }
};

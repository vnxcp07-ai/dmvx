const sharp = require('sharp');
const axios = require('axios');
const path = require('path');

const TIERS = {
  nuke:     { accent: '#9933ff', border: '#cc66ff', glow: '#9933ff', text: '#cc66ff', bg: '1e0a32' },
  smite:    { accent: '#ff0099', border: '#ff66cc', glow: '#ff0099', text: '#ff66cc', bg: '280019' },
  starfall: { accent: '#ff2200', border: '#ff4444', glow: '#ff2200', text: '#ff4444', bg: '280000' }
};

function getTier(amount) {
  if (amount >= 10000000) return 'starfall'
  if (amount >= 1000000)  return 'smite'
  return 'nuke'
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

async function fetchAvatar(userId) {
  try {
    const res = await axios.get(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=150x150&format=Png`, { timeout: 5000 })
    const url = res.data.data[0].imageUrl
    const img = await axios.get(url, { responseType: 'arraybuffer', timeout:5000 })
    return img.data
  } catch { return null }
}

async function generateDonationImage(donatorName, raisedName, donatorId, raiserId, amount) {
  const tier = getTier(amount)
  const c = TIERS[tier]

  const [donatorBuf, raiserBuf, robuxBuf] = await Promise.all([
    fetchAvatar(donatorId),
    fetchAvatar(raiserId),
    sharp(path.join(process.cwd(), 'robux.png')).resize(40,40).toBuffer()
  ])

  // Base card
  let composite = sharp(Buffer.from(`<svg width="700" height="220" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <filter id="glow">
        <feGaussianBlur stdDeviation="7" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <rect x="0" y="0" width="700" height="220" rx="16" fill="#${c.bg}" opacity="0.9"/>
    <rect x="0" y="0" width="8" height="220" fill="${c.accent}"/>
    <text x="370" y="100" font-family="Arial" font-size="42" font-weight="bold" fill="${c.text}" text-anchor="middle" filter="url(#glow)">${formatNumber(amount)}</text>
    <text x="350" y="145" font-family="Arial" font-size="22" fill="#dddddd" text-anchor="middle">donated to</text>
    <text x="105" y="190" font-family="Arial" font-size="15" font-weight="bold" fill="#eeeeee" text-anchor="middle">${donatorName.length > 16 ? donatorName.slice(0,13)+'...' : donatorName}</text>
    <text x="595" y="190" font-family="Arial" font-size="15" font-weight="bold" fill="#eeeeee" text-anchor="middle">${raisedName.length > 16 ? raisedName.slice(0,13)+'...' : raisedName}</text>
  </svg>`)).png()

  // Draw donator avatar + glowing border
  if(donatorBuf) {
    const circled = await sharp(donatorBuf).resize(110,110)
      .composite([{input: Buffer.from(`<svg><circle cx="55" cy="55" r="55"/></svg>`), blend: 'dest-in'}])
      .toBuffer()

    composite = composite.composite([
      { input: circled, left: 50, top:35 },
      { input: Buffer.from(`<svg width="120" height="120"><circle cx="60" cy="60" r="59" stroke="${c.border}" stroke-width="5" fill="none" filter="url(#glow)"/></svg>`), left:45, top:30 }
    ])
  }

  // Draw raiser avatar + glowing border
  if(raiserBuf) {
    const circled = await sharp(raiserBuf).resize(110,110)
      .composite([{input: Buffer.from(`<svg><circle cx="55" cy="55" r="55"/></svg>`), blend: 'dest-in'}])
      .toBuffer()

    composite = composite.composite([
      { input: circled, left: 540, top:35 },
      { input: Buffer.from(`<svg width="120" height="120"><circle cx="60" cy="60" r="59" stroke="${c.border}" stroke-width="5" fill="none" filter="url(#glow)"/></svg>`), left:535, top:30 }
    ])
  }

  // Draw your robux icon
  composite = composite.composite([{ input: robuxBuf, left: 280, top:80 }])

  return await composite.toBuffer()
}

module.exports = { generateDonationImage }

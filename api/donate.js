const FormData = require('form-data');
const axios = require('axios');
const { generateDonationImage } = require('../lib/generateImage.js');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

const TIERS = {
  starfall: { accent: '#ff0000', emoji: '<:starfall:1490655938506395829>' },
  smite:    { accent: '#ff0099', emoji: '<:smitebro:1490655992025841804>' },
  nuke:     { accent: '#a100ff', emoji: '<:nukeig:1490656026603683940>' }
};

function getTier(amount) {
  if (amount >= 10000000) return 'starfall';
  if (amount >= 1000000)  return 'smite';
  return 'nuke';
}

function hexToDec(hex) {
  return parseInt(hex.replace('#', ''), 16);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!WEBHOOK_URL) {
    return res.status(500).json({ error: 'Webhook URL not configured on server.' });
  }

  try {
    const { donatorName, receiverName, donatorId, receiverId, amount } = req.body;

    if (!donatorName || !receiverName || !donatorId || !receiverId || amount == null) {
      return res.status(400).json({ error: 'Missing required fields.' });
    }

    const numAmount = Number(amount);
    const tierName  = getTier(numAmount);
    const tier      = TIERS[tierName];

    const timestamp = new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    // Generate the image
    const imageBuffer = await generateDonationImage(
      donatorName,
      receiverName,
      donatorId,
      receiverId,
      numAmount
    );

    const form = new FormData();

    const payload = {
      content: `${tier.emoji} \`@${donatorName}\` donated <:robux:1451215082640900146> **${numAmount.toLocaleString()} Robux** to \`@${receiverName}\``,
      embeds: [{
        color: hexToDec(tier.accent),
        image: { url: 'attachment://donation.png' },
        footer: { text: `Donated on • Today at ${timestamp}` }
      }]
    };

    form.append('payload_json', JSON.stringify(payload));
    form.append('file', imageBuffer, {
      filename:    'donation.png',
      contentType: 'image/png',
    });

    await axios.post(WEBHOOK_URL, form, {
      headers: form.getHeaders(),
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Donation error:', error.message);
    console.error(error.stack);
    return res.status(500).json({ error: 'Failed to generate or send donation image.' });
  }
};

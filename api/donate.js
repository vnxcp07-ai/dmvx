const FormData = require('form-data');
const axios = require('axios');
const { generateDonationImage } = require('../lib/generateImage.js');

const WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// --- FIX: Add tier logic here to get the color for the embed ---
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

function hexToDec(hex) {
    return parseInt(hex.replace('#', ''), 16);
}
// --- END FIX ---

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
            return res.status(400).json({ error: 'Missing required fields in request body.' });
        }
        
        // --- FIX: Determine the tier color ---
        const tierName = getTier(amount);
        const tierColor = TIERS[tierName].accent;

        const imageBuffer = await generateDonationImage(donatorName, receiverName, donatorId, receiverId, amount);
        
        const form = new FormData();
        form.append('payload_json', JSON.stringify({
            content: `**@${donatorName}** donated **${Number(amount).toLocaleString()}** Robux to **@${receiverName}**`,
            embeds: [{
                // --- FIX: Use the calculated tier color ---
                color: hexToDec(tierColor), 
                image: { url: 'attachment://donation.png' },
                footer: { text: `Donated on • Vxid Utilities` }
            }]
        }));
        
        form.append('files[0]', imageBuffer, {
            filename: 'donation.png',
            contentType: 'image/png',
        });

        await axios.post(WEBHOOK_URL, form, {
            headers: form.getHeaders()
        });

        res.status(200).json({ success: true, message: 'Donation image sent to Discord.' });

    } catch (error) {
        console.error('Error processing donation:', error.message, error.stack);
        res.status(500).json({ error: 'Failed to generate or send donation image.' });
    }
};

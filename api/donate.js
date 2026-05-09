const { generateDonationImage, getTier } = require("../lib/generateImage");
const FormData = require("form-data");
const axios = require("axios");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

function getTierMeta(amount) {
  if (amount >= 10_000_000) {
    return {
      emoji: "<:starfall:1490655938506395829>",
      tier: "Starfall",
      color: 0xff0000
    };
  } else if (amount >= 1_000_000) {
    return {
      emoji: "<:smitebro:1490655992025841804>",
      tier: "Smite",
      color: 0xff66cc
    };
  } else {
    return {
      emoji: "<:nukeig:1490656026603683940>",
      tier: "Nuke",
      color: 0x9966ff
    };
  }
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).send("Method not allowed");

  const { donatorName, raisedName, donatorId, raiserId, amount } = req.body || {};

  if (!donatorName || !raisedName || typeof amount !== "number") {
    return res.status(400).json({ error: "Invalid data" });
  }

  try {
    const imageBuffer = await generateDonationImage(
      donatorName,
      raisedName,
      Number(donatorId),
      Number(raiserId),
      Number(amount)
    );

    const meta = getTierMeta(amount);
    const formatted = formatNumber(amount);
    const robuxEmoji = "<:robux:1451215082640900146>";

    const payload = {
      content: `${meta.emoji} **${donatorName} just dropped a ${robuxEmoji} ${formatted} ${meta.tier} to ${raisedName}!**\n${donatorName} donated ${robuxEmoji} ${formatted} to ${raisedName}!`,
      embeds: [{
        color: meta.color,
        image: { url: "attachment://donation.png" },
        footer: { text: "DONATE MODDED VX • Vxid Utilities" },
        timestamp: new Date().toISOString()
      }]
    };

    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", imageBuffer, {
      filename: "donation.png",
      contentType: "image/png"
    });

    await axios.post(WEBHOOK, form, { headers: form.getHeaders() });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
};

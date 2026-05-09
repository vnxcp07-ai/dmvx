const { generateDonationImage } = require("../lib/generateImage");
const FormData = require("form-data");
const axios    = require("axios");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

function getTierMeta(amount) {
  if (amount >= 10000000) return { emoji: "<:starfall:1490655938506395829>", tier: "Starfall", color: 0xff0000 };
  if (amount >= 1000000)  return { emoji: "<:smitebro:1490655992025841804>",  tier: "Smite",    color: 0xff66cc };
  return                         { emoji: "<:nukeig:1490656026603683940>",    tier: "Nuke",     color: 0x9966ff };
}

function formatNumber(n) {
  return Math.floor(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

module.exports = async function handler(req, res) {
  // log every request so we can debug
  console.log("Method:", req.method);
  console.log("Body:", JSON.stringify(req.body));

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!WEBHOOK) {
    console.error("DISCORD_WEBHOOK_URL not set");
    return res.status(500).json({ error: "Webhook not configured" });
  }

  const { donatorName, raisedName, donatorId, raiserId, amount } = req.body || {};

  if (!donatorName || !raisedName || amount == null) {
    console.error("Missing fields", req.body);
    return res.status(400).json({ error: "Missing fields" });
  }

  const numAmount = Number(amount);

  try {
    console.log("Generating image...");
    const imageBuffer = await generateDonationImage(
      String(donatorName),
      String(raisedName),
      Number(donatorId) || 1,
      Number(raiserId)  || 1,
      numAmount
    );
    console.log("Image generated, size:", imageBuffer.length);

    const meta      = getTierMeta(numAmount);
    const formatted = formatNumber(numAmount);
    const robux     = "<:robux:1451215082640900146>";

    const payload = {
      content: `${meta.emoji} **${donatorName} just dropped a ${robux} ${formatted} ${meta.tier} to ${raisedName}!**\n${donatorName} donated ${robux} ${formatted} to ${raisedName}!`,
      embeds: [{
        color: meta.color,
        image: { url: "attachment://donation.png" },
        footer: { text: "DONATE MODDED VX • Vxid Utilities" },
        timestamp: new Date().toISOString(),
      }],
    };

    const form = new FormData();
    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", imageBuffer, {
      filename:    "donation.png",
      contentType: "image/png",
    });

    console.log("Sending to Discord...");
    const discordRes = await axios.post(WEBHOOK, form, {
      headers: form.getHeaders(),
      timeout: 15000,
    });
    console.log("Discord response:", discordRes.status);

    return res.status(200).json({ success: true, tier: meta.tier });

  } catch (err) {
    console.error("Error:", err?.response?.data || err.message);
    return res.status(500).json({ error: err.message });
  }
};

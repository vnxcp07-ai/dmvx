const { generateDonationImage } = require("../lib/generateImage");
const FormData = require("form-data");
const axios = require("axios");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

function formatNumber(n) {
  return Math.floor(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function getTierMeta(amount) {
  if (amount >= 10_000_000) {
    return {
      label: "Starfall",
      emoji: "🌠",
      color: 0xff2200,
    };
  }

  if (amount >= 1_000_000) {
    return {
      label: "Smite",
      emoji: "⚡",
      color: 0xff0099,
    };
  }

  return {
    label: "Nuke",
    emoji: "💥",
    color: 0x9933ff,
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!WEBHOOK) {
    return res.status(500).json({ error: "DISCORD_WEBHOOK_URL not set" });
  }

  const body = req.body || {};

  const donatorName = body.donatorName;
  const raisedName = body.raisedName;
  const donatorId = Number(body.donatorId);
  const raiserId = Number(body.raiserId);
  const amount = Number(body.amount);

  if (
    typeof donatorName !== "string" ||
    typeof raisedName !== "string" ||
    !Number.isFinite(donatorId) ||
    !Number.isFinite(raiserId) ||
    !Number.isFinite(amount) ||
    amount < 100_000
  ) {
    return res.status(400).json({ error: "Invalid payload" });
  }

  try {
    const imageBuffer = await generateDonationImage(
      donatorName,
      raisedName,
      donatorId,
      raiserId,
      amount
    );

    const meta = getTierMeta(amount);
    const formatted = formatNumber(amount);

    const form = new FormData();

    const payload = {
      content: `${meta.emoji} **${donatorName}** donated **${formatted} Robux** to **${raisedName}**`,
      embeds: [
        {
          color: meta.color,
          image: {
            url: "attachment://donation.png",
          },
          footer: {
            text: `DONATE MODDED VX • ${meta.label}`,
          },
          timestamp: new Date().toISOString(),
        },
      ],
    };

    form.append("payload_json", JSON.stringify(payload));
    form.append("files[0]", imageBuffer, {
      filename: "donation.png",
      contentType: "image/png",
    });

    await axios.post(WEBHOOK, form, {
      headers: form.getHeaders(),
      timeout: 15000,
    });

    return res.status(200).json({
      success: true,
      tier: meta.label,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      error: "Failed to send donation image",
    });
  }
};

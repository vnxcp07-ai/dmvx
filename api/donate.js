const { generateDonationImage } = require("../lib/generateImage");
const FormData = require("form-data");
const axios = require("axios");

const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;

function getTierMeta(amount) {
  if (amount >= 10000000) return { emoji: "<:starfall:1490655938506395829>", tier: "Starfall", color: 0xff0000 };
  if (amount >= 1000000)  return { emoji: "<:smitebro:1490655992025841804>", tier: "Smite", color: 0xff66cc };
  return { emoji: "<:nukeig:1490656026603683940>", tier: "Nuke", color: 0x9966ff };
}

module.exports = async function handler(req, res) {
  console.log("🔥 New donation received", req.body)

  if (req.method !== "POST") return res.status(405).end()

  const amount = Number(req.body.amount)
  const meta = getTierMeta(amount)
  const formatted = amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const robux = "<:robux:1451215082640900146>";

  // Generate card
  const imageBuffer = await generateDonationImage(
    req.body.donatorName,
    req.body.raisedName,
    req.body.donatorId,
    req.body.raiserId,
    amount
  )

  // Send to discord
  const form = new FormData();
  form.append("payload_json", JSON.stringify({
    content: `${meta.emoji} **${req.body.donatorName} just dropped a ${robux} ${formatted} ${meta.tier} to ${req.body.raisedName}!**\n${req.body.donatorName} donated ${robux} ${formatted} to ${req.body.raisedName}!`,
    embeds: [{
      color: meta.color,
      image: { url: "attachment://card.png" },
      footer: { text: "DONATE MODDED VX • Vxid Utilities" },
      timestamp: new Date().toISOString()
    }]
  }))
  form.append("files[0]", imageBuffer, { filename: "card.png" })

  await axios.post(WEBHOOK, form, { headers: form.getHeaders() })
  console.log("✅ Sent successfully to Discord!")

  return res.json({ success: true })
}

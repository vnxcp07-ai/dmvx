const payload = {
  embeds: [
    {
      color: meta.color,
      image: { url: "attachment://donation.png" },
      footer: { text: `DONATE MODDED VX • ${meta.label} Tier` },
      timestamp: new Date().toISOString()
    }
  ]
};

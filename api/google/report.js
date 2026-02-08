export default async function handler(req, res) {
  try {
    // endpoint de relatório (ainda sem Google Ads real)
    return res.status(200).json({
      ok: true,
      message: "report endpoint pronto (ainda sem dados reais)",
      data: {
        spend: 0,
        clicks: 0,
        conversions: 0,
        currency: "BRL",
        period: "LAST_30_DAYS",
      },
    });
  } catch (err) {
    return res.status(500).json({ ok: false, error: String(err) });
  }
}

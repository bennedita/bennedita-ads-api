export default async function handler(req, res) {
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const customerId = req.query.customerId || "000-000-0000";
  const period = req.query.period || "last_30_days";

  const response = {
    source: "mock",
    customerId,
    clientName: "Empresa Exemplo Ltda",
    platform: "Google Ads",
    period,
    periodLabel: period === "last_30_days" ? "Últimos 30 dias" : String(period),
    generatedAt: new Date().toISOString(),
    kpis: {
      investment: 7200,
      leads: 104,
      cpa: 69.23,
      clicks: 2450,
      ctr: 3.85,
      cpc: 2.94
    },
    timeseries: [
      { date: "2026-01-01", investment: 180, leads: 3 },
      { date: "2026-01-02", investment: 220, leads: 4 },
      { date: "2026-01-03", investment: 190, leads: 2 },
      { date: "2026-01-04", investment: 260, leads: 5 },
      { date: "2026-01-05", investment: 240, leads: 4 },
      { date: "2026-01-06", investment: 310, leads: 6 }
    ],
    campaigns: [
      { name: "Busca Genérica", investment: 2850, leads: 32, cpa: 89.06 },
      { name: "Marca", investment: 1200, leads: 28, cpa: 42.86 },
      { name: "Remarketing", investment: 1850, leads: 24, cpa: 77.08 },
      { name: "PMax", investment: 1300, leads: 20, cpa: 65.0 }
    ]
  };

  return res.status(200).json(response);
}

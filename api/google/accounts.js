import { GoogleAdsApi } from "google-ads-api";

const client = new GoogleAdsApi({
  client_id: process.env.GOOGLE_CLIENT_ID,
  client_secret: process.env.GOOGLE_CLIENT_SECRET,
  developer_token: process.env.GOOGLE_DEVELOPER_TOKEN,
});

export default async function handler(req, res) {
  try {
    const refresh_token = process.env.GOOGLE_REFRESH_TOKEN;
    const login_customer_id = process.env.GOOGLE_LOGIN_CUSTOMER_ID;

    if (!refresh_token) {
      return res.status(500).json({
        ok: false,
        message: "GOOGLE_REFRESH_TOKEN ausente",
      });
    }

    if (!login_customer_id) {
      return res.status(500).json({
        ok: false,
        message: "GOOGLE_LOGIN_CUSTOMER_ID ausente",
      });
    }

    const customer = client.Customer({
      customer_id: login_customer_id,
      refresh_token,
      login_customer_id,
    });

    const query = `
      SELECT
        customer_client.client_customer,
        customer_client.descriptive_name,
        customer_client.manager
      FROM customer_client
      WHERE customer_client.manager = false
    `;

    const rows = await customer.query(query);

    const accounts = rows.map((r) => ({
    id: r.customer_client.client_customer
  .replace("customers/", "")
  .replaceAll("-", ""),
      name: r.customer_client.descriptive_name,
    }));

    return res.status(200).json({
      ok: true,
      accounts,
    });
  } catch (err) {
    console.error("ERRO ACCOUNTS:", err);

    return res.status(500).json({
      ok: false,
      message: err.message || "Erro ao listar contas",
      details: err?.response?.data || err,
    });
  }
}

import { sql } from "./_lib/db.js";

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const reports = await sql`
        SELECT 
          id,
          client_id,
          period,
          summary,
          next_actions,
          snapshot_json,
          status,
          created_at
        FROM reports
        ORDER BY created_at DESC
        LIMIT 50
      `;

      return res.status(200).json({
        success: true,
        data: reports
      });
    }

    if (req.method === "POST") {
      return res.status(405).json({
        success: false,
        error: "Use /api/reports/save for POST"
      });
    }

    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });

  } catch (error) {
    console.error("Reports error:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}

import { sql } from "../_lib/db.js";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      success: false,
      error: "Method not allowed"
    });
  }

  try {
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

  } catch (error) {
    console.error("Error fetching reports:", error);

    return res.status(500).json({
      success: false,
      error: "Internal server error"
    });
  }
}

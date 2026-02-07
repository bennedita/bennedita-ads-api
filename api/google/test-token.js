import { getAccessToken } from "./auth.js";

export default async function handler(req, res) {
  try {
    const accessToken = await getAccessToken();

    res.status(200).json({
      success: true,
      access_token_exists: !!accessToken,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}

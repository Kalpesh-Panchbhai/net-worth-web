const { onRequest } = require("firebase-functions/v2/https");

exports.yahooSearch = onRequest(
  { region: "asia-south1", maxInstances: 5 },
  async (req, res) => {
    if (req.method !== "GET") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const query = req.query.q;
    if (!query || !query.trim()) {
      res.status(400).json({ error: "Query parameter 'q' is required" });
      return;
    }

    const encoded = encodeURIComponent(query.trim());
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encoded}&quotesCount=20&newsCount=0`;

    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });

      if (!response.ok) {
        res.status(502).json({ error: "Yahoo Finance search unavailable" });
        return;
      }

      const data = await response.json();
      res.set("Cache-Control", "public, max-age=300");
      res.json(data);
    } catch (err) {
      res.status(502).json({ error: "Yahoo Finance search unavailable" });
    }
  }
);

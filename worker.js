export default {
  async fetch(request, env) {

    const url = new URL(request.url);
    const path = url.pathname;

    // CORS対応
    const headers = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers });
    }

    // ===== メニュー取得 =====
    if (path === "/api/menu") {

      const result = await env.DB.prepare(
        "SELECT id, name, price, category FROM menu ORDER BY id ASC"
      ).all();

      const grouped = {
        vehicle: [],
        assist: [],
        stairs: [],
        round: []
      };

      (result.results || []).forEach(r => {
        const key = String(r.category || "").trim();
        if (grouped[key]) {
          grouped[key].push(r);
        }
      });

      return new Response(JSON.stringify(grouped), { headers });
    }

    // ===== 404 =====
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers
    });
  }
};

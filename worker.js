export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      // =========================
      // 登録
      // =========================
      if (url.pathname === "/api/createReservation") {

        await env.DB.prepare(`
          CREATE TABLE IF NOT EXISTS reservations (
            id TEXT PRIMARY KEY,
            name TEXT
          )
        `).run();

        const id = Date.now().toString();

        await env.DB.prepare(`
          INSERT INTO reservations (id, name)
          VALUES (?, ?)
        `).bind(id, "テスト").run();

        return new Response(JSON.stringify({
          success: true,
          id: id
        }), {
          headers: { "Content-Type": "application/json" }
        });
      }

      // =========================
      // 一覧
      // =========================
      if (url.pathname === "/api/getReservations") {

        const data = await env.DB.prepare(`
          SELECT * FROM reservations ORDER BY id DESC
        `).all();

        return new Response(JSON.stringify(data.results), {
          headers: { "Content-Type": "application/json" }
        });
      }

      return new Response("OK");

    } catch (e) {
      return new Response(`ERROR: ${e.message}`, { status: 500 });
    }
  }
};

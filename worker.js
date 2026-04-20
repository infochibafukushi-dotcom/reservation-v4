export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/menu") {
      const result = await env.DB.prepare(
        "SELECT id, name, price, category FROM menu"
      ).all();

      const grouped = {
        vehicle: [],
        assist: [],
        stairs: [],
        round: []
      };

      (result.results || []).forEach(r => {
        if (grouped[r.category]) {
          grouped[r.category].push(r);
        }
      });

      return new Response(JSON.stringify(grouped), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response("Not Found", { status: 404 });
  }
};

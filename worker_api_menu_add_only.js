// 既存worker.jsに追加するブロック（削除なし・追記のみ）
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

  (result.results || []).forEach(row => {
    const key = String(row.category || "").trim();
    if (grouped[key]) grouped[key].push(row);
  });

  return new Response(JSON.stringify(grouped), { headers });
}

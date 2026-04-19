if (url.pathname === "/create") {
  const body = await request.json();

  await env.DB.prepare(`
    INSERT INTO reservations (
      reservation_id,
      reservation_datetime,
      customer_name
    ) VALUES (?, ?, ?)
  `)
  .bind(
    body.reservation_id,
    body.reservation_datetime,
    body.customer_name
  )
  .run();

  return new Response(JSON.stringify({ success: true }));
}

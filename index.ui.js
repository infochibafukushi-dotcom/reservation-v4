document.addEventListener("DOMContentLoaded", () => {
  let tapCount = 0;
  let tapTimer = null;

  // 配信先がサブパスでも動くよう、絶対パス(/admin.html)ではなく相対遷移にする
  // 例: https://example.com/reservation-v4/ なら https://example.com/reservation-v4/admin.html へ遷移
  const ADMIN_URL = new URL("admin.html", window.location.href).toString();
  const logoButton = document.getElementById("logoAdminTrigger");

  if (!logoButton) return;

  logoButton.addEventListener("click", () => {
    tapCount += 1;

    // 1秒以内の連続タップのみ有効
    clearTimeout(tapTimer);
    tapTimer = setTimeout(() => {
      tapCount = 0;
    }, 1000);

    if (tapCount >= 5) {
      tapCount = 0;
      clearTimeout(tapTimer);

      if (navigator.vibrate) navigator.vibrate(50);

      window.location.href = ADMIN_URL;
    }
  });
});

document.addEventListener("DOMContentLoaded", () => {
  let tapCount = 0;
  let tapTimer = null;

  // 公開ページと同一オリジン上の管理画面へ遷移させる
  // (/admin は環境によって 404 / API Not Found になり得るため、着地点を admin.html に統一)
  const ADMIN_URL = new URL("/admin.html", window.location.origin).toString();
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

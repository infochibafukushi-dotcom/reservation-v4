document.addEventListener("DOMContentLoaded", () => {
  let tapCount = 0;
  let tapTimer = null;

  const ADMIN_URL = "https://throbbing-bush-8f59.info-chibafukushi.workers.dev/admin";
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

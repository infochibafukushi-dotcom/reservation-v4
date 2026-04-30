document.addEventListener("DOMContentLoaded", () => {
  let tapCount = 0;
  let tapTimer = null;

  const configuredAdminUrl = window.APP_CONFIG?.ADMIN_ENTRY_URL || "";
  // Access前段を必ず通すため、設定があればそちらを優先。未設定時のみ同一配信パスのadmin.htmlへ。
  const ADMIN_URL = configuredAdminUrl || new URL("admin.html", window.location.href).toString();
  const logoButton = document.getElementById("logoAdminTrigger");

  if (!logoButton) return;

  logoButton.addEventListener("click", () => {
    tapCount += 1;

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

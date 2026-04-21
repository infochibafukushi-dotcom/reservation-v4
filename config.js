(function () {
  const defaultBase = window.location.origin;
  const savedBase = localStorage.getItem("api_base_url") || "";

  window.APP_CONFIG = {
    API_BASE: savedBase || defaultBase,
    ENDPOINTS: {
      getBlocks: "/api/getBlocks",
      getMenu: "/api/menu",
      createReservation: "/api/createReservation",
      getUITexts: "/api/getUITexts",
      baseFees: "/api/baseFees",
      cancelReservation: "/api/cancelReservation"
    }
  };
})();

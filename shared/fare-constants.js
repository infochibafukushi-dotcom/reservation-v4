(function(global){
  const FARE_AREA = "千葉地区";
  const FARE_VEHICLE_CLASS = "大型車";
  const FARE_PLAN = "B運賃";
  const FARE_NOTICE = "令和8年2月13日付け 関自旅二第4314号";
  const INITIAL_DISTANCE_KM = 1.06;
  const INITIAL_FARE_YEN = 520;
  const ADDITIONAL_DISTANCE_M = 212;
  const ADDITIONAL_DISTANCE_KM = ADDITIONAL_DISTANCE_M / 1000;
  const ADDITIONAL_FARE_YEN = 100;
  const TIME_DISTANCE_SECONDS = 80;
  const TIME_DISTANCE_FARE_YEN = 100;
  const CHARTER_UNIT_MINUTES = 30;
  const CHARTER_UNIT_FARE_YEN = 4180;

  const FARE_LABEL = FARE_AREA + " " + FARE_VEHICLE_CLASS + FARE_PLAN;
  const FARE_LABEL_WITH_NOTICE = FARE_NOTICE + " " + FARE_LABEL;

  function getDistancePricingPatternA(){
    return {
      initialDistanceKm: INITIAL_DISTANCE_KM,
      initialFare: INITIAL_FARE_YEN,
      incrementDistanceKm: ADDITIONAL_DISTANCE_KM,
      incrementFare: ADDITIONAL_FARE_YEN
    };
  }

  function getCharterTimeBlockParams(){
    return {
      baseMinutes: CHARTER_UNIT_MINUTES,
      baseAmount: CHARTER_UNIT_FARE_YEN,
      perBlockMinutes: CHARTER_UNIT_MINUTES,
      perBlockAmount: CHARTER_UNIT_FARE_YEN
    };
  }

  global.FareConstants = {
    FARE_AREA: FARE_AREA,
    FARE_VEHICLE_CLASS: FARE_VEHICLE_CLASS,
    FARE_PLAN: FARE_PLAN,
    FARE_NOTICE: FARE_NOTICE,
    FARE_LABEL: FARE_LABEL,
    FARE_LABEL_WITH_NOTICE: FARE_LABEL_WITH_NOTICE,
    INITIAL_DISTANCE_KM: INITIAL_DISTANCE_KM,
    INITIAL_FARE_YEN: INITIAL_FARE_YEN,
    ADDITIONAL_DISTANCE_M: ADDITIONAL_DISTANCE_M,
    ADDITIONAL_DISTANCE_KM: ADDITIONAL_DISTANCE_KM,
    ADDITIONAL_FARE_YEN: ADDITIONAL_FARE_YEN,
    TIME_DISTANCE_SECONDS: TIME_DISTANCE_SECONDS,
    TIME_DISTANCE_FARE_YEN: TIME_DISTANCE_FARE_YEN,
    CHARTER_UNIT_MINUTES: CHARTER_UNIT_MINUTES,
    CHARTER_UNIT_FARE_YEN: CHARTER_UNIT_FARE_YEN,
    getDistancePricingPatternA: getDistancePricingPatternA,
    getCharterTimeBlockParams: getCharterTimeBlockParams
  };
})(typeof window !== "undefined" ? window : globalThis);

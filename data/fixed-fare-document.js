window.FIXED_FARE_DOCUMENT = {
  title: "事前確定運賃システム 説明書",
  subtitle: "介護タクシー予約システム",
  menuNote: "運輸局・行政書士・加盟店説明用の資料です。予約詳細のQuote監査情報と合わせてご確認ください。",
  sections: [
    {
      heading: "1. システム概要",
      paragraphs: [
        "事前確定運賃システムは、見積時に算出された運賃を予約時に固定し、利用者同意の上で予約へ連携する仕組みです。"
      ]
    },
    {
      heading: "2. システムフロー",
      orderedList: [
        "見積作成",
        "Quote登録",
        "利用者同意",
        "予約作成",
        "運賃確定",
        "Quote消費（consumed）",
        "再利用防止"
      ]
    },
    {
      heading: "3. 保存情報",
      table: {
        headers: ["項目", "内容"],
        rows: [
          ["estimate_no", "見積番号"],
          ["quote_snapshot", "見積スナップショット"],
          ["route_plan", "ルート情報"],
          ["estimate_consent", "利用者同意情報"],
          ["confirmed_fare", "確定運賃"],
          ["fare_locked_at", "運賃確定日時"],
          ["snapshot_hash", "整合性確認用ハッシュ"]
        ]
      }
    },
    {
      heading: "4. 利用者同意",
      paragraphs: ["以下の内容を保存します。"],
      list: ["同意日時", "見積番号", "同意時運賃", "UserAgent"]
    },
    {
      heading: "5. 二重利用防止",
      html: "<p>Quote状態は <strong>active</strong> から <strong>consumed</strong> へ遷移し、同一見積の再予約を防止します。</p>"
    },
    {
      heading: "6. 監査機能",
      paragraphs: ["管理画面から以下を確認できます。"],
      list: ["Quote状態", "consumed日時", "reservation_id", "Hash照合"]
    },
    {
      heading: "7. Hash照合",
      paragraphs: [
        "保存時に snapshot_hash を生成し、予約時に quote_snapshot_hash を保存します。管理画面で照合が可能です。"
      ]
    },
    {
      heading: "8. 運賃固定",
      paragraphs: ["予約時に confirmed_fare を保存し、以後変更されません。"]
    }
  ]
};

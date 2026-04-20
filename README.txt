追加のみパッチ内容

1. form-step1.html
- D1のmenuを/api/menuから取得
- プルダウン4種を自動生成
- 概算金額を自動計算
- 次へでform-step2.htmlへ遷移

2. form-step2.html
- 個人情報同意チェック
- 利用区分、名前、電話、出発地、行き先、備考
- 必須バリデーション
- 概算金額を保持表示

3. worker_api_menu_add_only.js
- 既存worker.jsに追記する/api/menuエンドポイント
- 既存コードは削除しない

4. app_click_patch.txt
- 既存カレンダーの◎クリックでform-step1.htmlへ遷移する追記だけ

重要
- 既存のindex.html / style.css / カレンダーUIは消さない
- 追加のみで使う

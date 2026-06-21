# CLAUDE.md

このファイルはClaude Code (claude.ai/code) がこのリポジトリで作業する際のガイドです。

## プロジェクト概要

小学生向けの漢字練習PWA「漢字マスター」。書き取り・読み・四字熟語の3形式の問題に対応。ビルドステップ・バンドラー・パッケージマネージャーなしで、完全にクライアントサイドで動作する。

## 実行方法

`index.html` をブラウザで直接開く（`file://`、オフライン可）か、任意の静的ファイルサーバーで配信する：

```
npx serve .
```

テスト・リンター・ビルドコマンドは存在しない。データは `<script>` で読み込むため `fetch` は使わず、`file://` 直接開きでもGitHub Pages配信でも同一に動作する。

## アーキテクチャ

- **index.html** — 4つの画面（ホーム、クイズ、一覧、結果）を `.hidden` クラスで切り替えるシングルページアプリ。ホームに問題集選択の `<select id="quizSelect">` を持つ
- **app.js** — クイズフロー、進捗のlocalStorage保存、問題集の選択・切り替え、動的生成ボタンのイベント委譲など全アプリロジック。データ文字列のパーサ `parseKanjiData(text)` もここに持つ
- **kanji-data.js** — 全問題集を1つの文字列 `KANJI_DATA`（バッククオートで囲む）として保持し `window.KANJI_DATA` に公開する**データだけのファイル（ロジックなし）**。書式は `## タイトル` の行で問題集が始まり、以降の行は `問題,答え`（最初のカンマで分割。問題文中の読点は全角「、」を使う）。空行とカンマの無い行は無視。**問題集の追加・編集はこのファイルのみ**（クオート不要、囲みのバッククオートは触らない）。問題文の表記ルール: 書き取りは直す音を**カタカナ**・送り仮名はひらがな（例 `習い事をヤめる。,辞める`）、読みは問題文頭に `【読み】`・答えの読みを**カタカナ**（例 `【読み】店を構える,店をカマえる`）、四字熟語は問題文頭に `【四字熟語】`・意味を問題文／四字熟語を答えに置く（例 `【四字熟語】…が伝わる事,以心伝心`）
- **style.css** — モバイルファーストのレスポンシブスタイル。iPhone Safariのスタンドアロンモード向け
- **manifest.json** — ホーム画面追加用のPWAマニフェスト

スクリプト読込順は `kanji-data.js` → `app.js`（app.js が `window.KANJI_DATA` に依存）。app.js は起動時に `parseKanjiData(window.KANJI_DATA)` で `window.kanjiData = [{ id, title, items: [{question, answer}] }]` を生成する（`id` は `## タイトル` から導出）。

## 設計上の重要な判断

- フレームワーク不使用：素のJSで直接DOM操作
- **データは `<script>` 読み込み（fetch不使用）**。`file://` では fetch がCORSで失敗するため、問題集テキストを `kanji-data.js` の `KANJI_DATA` 文字列（バッククオート）に埋め込む方式とした。Service Workerは入れない（問題集更新が即反映される利点を優先）
- **データ入力の手間とミスを減らすため、クオート・バッククオートを手書きしない形式にした**。`kanji-data.js` は構造（`{id, title, csv}` のオブジェクト配列）を持たず1つの文字列だけにし、パースは `app.js` の `parseKanjiData` に集約（旧 `csv.js`/`parseQuiz` は廃止）。区切りは「最初のカンマで分割」のみで、RFC4180のクオート処理やタブ区切りには対応しない
- 状態はモジュールレベル変数（`currentQuizIndex`, `quizList`, `wrongList`, `currentKanjiId`, `currentKanjiData` など）で管理。クラスによるカプセル化なし
- 選択中の問題集データは `currentKanjiData`（`window.kanjiData` から選んだ1問題集の `items` 配列）。プルダウンの選択で `selectKanjiData(id)` が `meta.items` をコピーする
- **進捗は問題集ごとに分離**。`localStorage` のキー `kanjiProgress:<quizId>` に `{wrongList, lastQuizCorrectRate, session}` を保存。旧単一キー `kanjiProgress` は起動時 `migrateLegacyProgress()` で先頭問題集へ1回だけ移行。最後に選んだ問題集IDは `kanjiLastQuiz` に保存し次回復元
- **クイズ中断の途中状態を `session` として保存し「つづきから」を実現**。クイズ画面から離れるとき `saveSession()` が `{quizList, currentQuizIndex, userAnswers, correctCount}` を保存（通常モードのみ。復習モードは保存しない）。通常クイズの新規開始・完走で `clearSession()`／破棄。ホームに `session` があれば「つづきから／はじめからやる」を出し、左上の進捗・正解率もその途中状態を反映する（`updateStats()`）
- **答えは必ず見てから進む**（スキップ無し）。「答えを見る」を押すと答えと「✓正解／✗まちがえた」が出て、その判定で次へ進む。問題と答えは1つの白枠（`#card`）にまとめ、遷移で枠がズレないようにしている
- 動的生成ボタン（`.show-answer-btn`）は `document` へのイベント委譲で処理。クイズ画面のホームボタンは押し間違い防止で `⋮` メニュー（`#menuBtn`）内に格納
- **進捗のリセットは2種類**。ホームの「進捗をリセット」メニューで「学習の進捗・成績（`session`＋`lastQuizCorrectRate`を消す。まちがえた問題は残す）」と「まちがえた問題（`wrongList`を空にする）」を選ばせる
- 解答は問題ごとのスロット `userAnswers[currentQuizIndex]` に記録し、`correctCount` は毎回数え直す（前の問題に戻って解き直しても二重集計しない）
- 通常モードは配列順に出題（シャッフルなし）、復習モードは間違えた問題をシャッフルして出題。結果画面の「もう一度」は直前と同じモードで再開し、復習で全問正解なら非表示
- `showScreen()` は `#app > main` を全て隠して対象だけ表示（画面追加に強い）。ホーム遷移時に `updateStats()` を呼んで進捗表示を最新化する

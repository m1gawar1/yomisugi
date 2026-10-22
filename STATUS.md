# ヨミスギ

- フェーズ: MVP
- 状態: 作業中
- 概要: 予測変換しか押せないスマホで返信してエンディングを集めるブラウザゲーム（静的サイト）

## 完了
- [x] ゲーム本体（index.html）
- [x] ステージ1：お母さん（END 17個）
- [x] ステージ2：佐藤部長（END 20個）
- [x] データ自動チェック（scripts/check.mjs）
- [x] GitHub リポジトリ作成（m1gawar1/yomisugi）・GitHub Pages 公開
- [x] 結果シェアボタン（共有シート／クリップボード）

## 作業中
- [ ] スマホ実機での遊び心地チェック

## 次にやること
- [ ] index.html に doctype・charset・viewport の meta を追加（スマホ表示崩れ対策）
- [ ] OGP（リンクを貼ったときのカード表示）
- [ ] ステージを3〜5に増やす → 最終的に10問パック（タブの横スクロール対応も）
- [ ] 送った文をスマホが学習する仕組み（ステージ4〜5個になってから。設計案は ~/.claude/plans/staged-wiggling-cascade.md）

## メモ
- 公開URL: https://m1gawar1.github.io/yomisugi/
- 公開後はエンディングを末尾追加のみ（並べ替えると図鑑の記録がずれる）
- データを変えたら `node scripts/check.mjs` でエラー0を確認

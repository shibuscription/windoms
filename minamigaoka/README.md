# Windoms demo

役員向けの静的SPAデモです。バックエンド接続は行わず、画面遷移とUI操作を確認する用途です。

## 起動手順

```bash
cd demo
npm install
npm run dev
```

## ビルド

```bash
cd demo
npm run build
```

## 補足

- ルーティングは `HashRouter`（`/#/`）を使用しています。
- 保存操作はダミーで、画面内状態には反映されますが、リロードで初期化されます。
- データ形状は README 第19章の案に合わせています（`id` フィールドは持たない）。

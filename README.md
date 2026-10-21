# EPUB/PDF Maker

Markdownの原稿をEPUBとPDFへ変換するWindows向けアプリです。文字や見出しのスタイル、表紙画像、末尾に追加する画像を画面から設定できます。

## 準備と起動

Node.jsとnpmを用意し、このフォルダで次を実行します。

```powershell
npm ci
npx puppeteer browsers install chrome
npm start
```

別途 [Pandoc公式配布](https://github.com/jgm/pandoc/releases) からWindows用Pandoc 3.9を入手し、`vendor/pandoc.exe` に配置します。詳細は `vendor/README.md` にあります。PDF生成の開発起動では、上記のコマンドで取得したユーザー領域のChromeを使います。

起動後に `sample` フォルダを選ぶとサンプル原稿を読み込めます。サンプルの画像は公開用の単純な図形へ置き換えています。実際の原稿・完成書籍・個人の設定は含めていません。

## 配布物を作る場合

`npm run build` はWindows用の組み立てです。事前に `vendor/pandoc.exe` と `vendor/chrome/chrome.exe` を含むChrome一式を配置してください。Pandoc・Chromeは第三者製品で、このリポジトリには同梱しません。再配布する場合は、それぞれの配布条件と付属の許諾表示を確認してください。

## 完成度と制約

元環境でEPUB/PDF生成とWindows配布物作成を確認した段階です。この公開コピーの再組み立ては未確認です。日本語フォントが環境依存で変わる場合があり、縦書きEPUB、章の並べ替え画面、すべての異常時操作の確認は未完了です。

## 利用条件

アプリ側の新たな再利用ライセンスはこの公開時点では指定していません。依存部品の条件は各配布元に従います。Pandoc・Chrome・Electronを自作とは扱いません。

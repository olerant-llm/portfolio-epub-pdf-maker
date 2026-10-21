# vendor/

このフォルダに Pandoc の Windows バイナリを配置してください。

## 配置手順

1. https://github.com/jgm/pandoc/releases から **pandoc-3.9-windows-x86_64.zip** をダウンロード
2. ZIPを展開し、`pandoc.exe`（約100MB）をこのフォルダに配置
3. 最終的なパス: `vendor/pandoc.exe`

## 確認

```
vendor/pandoc.exe --version
```

## 注意事項

- `pandoc.exe` はサイズが大きいため Git 管理対象外です（`.gitignore` に設定済み）
- 開発時は手動で配置してください
- 配布時は electron-builder の `extraResources` 設定によりインストール先に自動コピーされます
- アプリ内では `process.resourcesPath/pandoc/pandoc.exe` のパスで参照されます

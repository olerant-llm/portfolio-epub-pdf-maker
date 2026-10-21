'use strict'

const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')
const { app } = require('electron')

/**
 * 同梱Pandocのパスを取得
 */
function getPandocPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'pandoc', 'pandoc.exe')
  }
  const vendorPath = path.join(__dirname, '..', 'vendor', 'pandoc.exe')
  if (fs.existsSync(vendorPath)) return vendorPath

  const { execSync } = require('child_process')
  try {
    const which = execSync('where pandoc', { encoding: 'utf8' }).trim().split('\n')[0].trim()
    if (which && fs.existsSync(which)) return which
  } catch (_) {}

  return vendorPath
}

/**
 * プロジェクトフォルダのYAMLファイルを探す
 * settings.yaml → metadata.yaml → *.yaml（辞書順最初）
 */
function findYamlFile(projectPath) {
  for (const name of ['settings.yaml', 'metadata.yaml']) {
    if (fs.existsSync(path.join(projectPath, name))) return name
  }
  try {
    const found = fs.readdirSync(projectPath)
      .filter(f => /\.(yaml|yml)$/i.test(f))
      .sort()
    if (found.length > 0) return found[0]
  } catch (_) {}
  return null
}

/**
 * 土台CSS（bpubcss.css ベース）
 * table/blockquote/img 等、UIで設定できない要素のスタイルを網羅。
 * ユーザー設定はこの後に出力されるため、必要な項目だけ上書きされる。
 */
const BASE_CSS = `/* ベースCSS（実用書向け標準スタイル） */
body {
  font-family: "Noto Sans JP", sans-serif;
  line-height: 1.7;
  margin: 0;
  padding: 0;
  text-align: justify;
  text-justify: inter-ideograph;
}
p {
  text-indent: 1em;
  margin: 0 0 1.0em 0;
}
h1 {
  font-size: 1.2em;
  font-weight: bold;
  line-height: 1.4;
  margin-top: 1em;
  margin-bottom: 2.5em;
  page-break-before: always;
  break-before: page;
}
h2 {
  font-size: 1.15em;
  font-weight: bold;
  line-height: 1.4;
  margin-top: 3em;
  margin-bottom: 0.5em;
  border-bottom: 1px solid #ccc;
  padding-bottom: 0.2em;
}
h3 {
  font-size: 1.0em;
  font-weight: bold;
  line-height: 1.4;
  margin-top: 2.5em;
  margin-bottom: 0.3em;
}
h1+p, h2+p, h3+p {
  text-indent: 0;
  margin-top: 0.2em;
}
ul, ol {
  margin: 0.5em 0 1.5em 1.5em;
  padding: 0;
}
li {
  margin-bottom: 0.6em;
  line-height: 1.6;
}
blockquote {
  margin: 2em 0;
  padding: 1.2em 1.5em;
  border-left: 6px solid #4a90e2;
  background: #f5f9ff;
  border-radius: 4px;
}
blockquote p {
  margin: 0 0 1em 0;
  text-indent: 0;
}
table {
  width: 100%;
  border-collapse: collapse;
  margin: 2em 0;
}
th, td {
  border: 1px solid #ccc;
  padding: 0.7em;
  line-height: 1.5;
  text-align: left;
  word-break: break-all;
}
th {
  background: #f0f0f0;
  font-weight: bold;
}
img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 2em auto;
}
hr {
  display: none;
}
a {
  text-decoration: none;
  color: gray;
}
.titlepage {
  text-align: center;
}
h1.title {
  text-align: center;
  margin-top: 35vh;
  margin-left: auto;
  margin-right: auto;
  margin-bottom: 2em;
  font-size: 1.6em;
  font-weight: bold;
  border-bottom: 2px solid #333;
  display: inline-block;
  padding-bottom: 0.2em;
  page-break-before: avoid;
}
.append-image-page {
  page-break-before: always;
  break-before: page;
  page-break-inside: avoid;
  break-inside: avoid;
  text-align: center;
  margin: 0;
  padding: 0;
  display: block;
}
.append-image-page img {
  max-width: 100%;
  max-height: 250mm;
  object-fit: contain;
  page-break-inside: avoid;
}
`

/**
 * デザインプリセット定義（builder.js 用 — CSS文字列）
 */
const BLOCKQUOTE_PRESETS = {
  leftbar: `blockquote {
  margin: 2em 0;
  padding: 1.2em 1.5em;
  border-left: 6px solid #4a90e2;
  background: #f5f9ff;
  border-radius: 4px;
}`,
  card: `blockquote {
  margin: 2em 0;
  padding: 1.2em 1.5em;
  border: 1px solid #ddd;
  border-radius: 8px;
  box-shadow: 0 2px 4px rgba(0,0,0,.08);
  background: #fafafa;
}`,
  note: `blockquote {
  margin: 2em 0;
  padding: 1.2em 1.5em;
  border-left: 6px solid #f0a500;
  background: #fffbe6;
  border-radius: 4px;
}`,
  minimal: `blockquote {
  margin: 2em 0 2em 0.5em;
  padding: 0.5em 1.2em;
  border-left: 3px solid #bbb;
  background: none;
}`,
  plain: `blockquote {
  margin: 2em 0;
  padding: 0 2em;
  border: none;
  background: none;
  font-style: italic;
  color: #666;
}`
}

const H1_PRESETS = {
  plain:     '',  // BASE_CSS のデフォルトをそのまま使う（装飾なし）
  underline: `h1 { border-bottom: 3px solid #333; display: inline-block; padding-bottom: 0.2em; }`,
  leftbar:   `h1 { border-left: 6px solid #4a90e2; padding-left: 12px; }`,
  box:       `h1 { border: 2px solid #333; padding: 0.2em 0.6em; display: inline-block; }`
}

const H2_PRESETS = {
  underline: '',  // BASE_CSS のデフォルト（border-bottom: 1px solid #ccc）をそのまま使う
  leftbar:   `h2 { border-bottom: none; border-left: 5px solid #4a90e2; padding-left: 12px; }`,
  badge:     `h2 { border-bottom: none; background: #4a90e2; color: #fff; padding: 0.2em 0.8em; border-radius: 4px; display: inline-block; }`,
  double:    `h2 { border-bottom: 3px double #555; }`,
  none:      `h2 { border-bottom: none; }`
}

const H3_PRESETS = {
  plain:     '',  // BASE_CSS のデフォルト
  dot:       `h3::before { content: "● "; color: #4a90e2; }`,
  underline: `h3 { border-bottom: 1px solid #aaa; padding-bottom: 0.15em; }`,
  leftbar:   `h3 { border-left: 3px solid #aaa; padding-left: 10px; }`
}

/**
 * CSSSettings JSON を CSS テキストにコンパイル
 * BASE_CSS を土台として先に出力し、ユーザー設定で上書きする。
 */
function compileCSS(settings) {
  const lines = []

  lines.push('/* Generated by EPUB/PDF Maker - do not edit manually */')
  lines.push('')
  lines.push(BASE_CSS)

  // ユーザー設定（上書き）
  const userLines = []

  if (settings.body) {
    const body = settings.body
    const bodyProps = []
    if (body['font-family']) bodyProps.push(`  font-family: ${body['font-family']};`)
    if (body['font-size']) bodyProps.push(`  font-size: ${body['font-size']};`)
    if (body['line-height'] !== undefined) bodyProps.push(`  line-height: ${body['line-height']};`)
    if (body['text-align']) bodyProps.push(`  text-align: ${body['text-align']};`)
    if (bodyProps.length > 0) {
      userLines.push('body {')
      userLines.push(...bodyProps)
      userLines.push('}')
      userLines.push('')
    }
  }

  if (settings.p) {
    const p = settings.p
    const pProps = []
    if (p['text-indent'] !== undefined) pProps.push(`  text-indent: ${p['text-indent']};`)
    if (p['margin-bottom'] !== undefined) pProps.push(`  margin-bottom: ${p['margin-bottom']};`)
    if (pProps.length > 0) {
      userLines.push('p {')
      userLines.push(...pProps)
      userLines.push('}')
      userLines.push('')
    }
  }

  for (const tag of ['h1', 'h2', 'h3']) {
    if (!settings[tag]) continue
    const h = settings[tag]
    const hProps = []
    if (h['font-size']) hProps.push(`  font-size: ${h['font-size']};`)
    if (h['font-weight']) hProps.push(`  font-weight: ${h['font-weight']};`)
    if (h['margin-top'] !== undefined) hProps.push(`  margin-top: ${h['margin-top']};`)
    if (h['margin-bottom'] !== undefined) hProps.push(`  margin-bottom: ${h['margin-bottom']};`)

    if (h['page-break-before'] === true) {
      hProps.push('  page-break-before: always;')
    } else if (h['page-break-before'] === false || h['page-break-before'] === 'false') {
      hProps.push('  page-break-before: auto;')
    } else if (h['page-break-before'] && h['page-break-before'] !== 'false') {
      hProps.push(`  page-break-before: ${h['page-break-before']};`)
    }

    if (h['border-bottom'] === true) {
      hProps.push('  border-bottom: 1px solid #ccc;')
    } else if (h['border-bottom'] === false) {
      hProps.push('  border-bottom: none;')
    } else if (typeof h['border-bottom'] === 'string' && h['border-bottom']) {
      hProps.push(`  border-bottom: ${h['border-bottom']};`)
    }

    if (hProps.length > 0) {
      userLines.push(`${tag} {`)
      userLines.push(...hProps)
      userLines.push('}')
      userLines.push('')
    }
  }

  if (userLines.length > 0) {
    lines.push('/* ユーザー設定（上書き） */')
    lines.push(...userLines)
  }

  // デザインプリセット（BASE_CSS のデフォルトを上書き）
  const presetLines = []

  const bqPreset = BLOCKQUOTE_PRESETS[settings.blockquote_preset]
  if (bqPreset) presetLines.push(bqPreset)

  const h1Preset = H1_PRESETS[settings.h1_preset]
  if (h1Preset) presetLines.push(h1Preset)

  const h2Preset = H2_PRESETS[settings.h2_preset]
  if (h2Preset) presetLines.push(h2Preset)

  const h3Preset = H3_PRESETS[settings.h3_preset]
  if (h3Preset) presetLines.push(h3Preset)

  if (presetLines.length > 0) {
    lines.push('/* デザインプリセット */')
    lines.push(...presetLines)
    lines.push('')
  }

  if (settings.custom_css && settings.custom_css.trim()) {
    lines.push('/* カスタムCSS */')
    lines.push(settings.custom_css.trim())
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * Markdownファイル一覧を辞書順で収集
 */
function collectMarkdownFiles(folderPath) {
  const files = fs.readdirSync(folderPath)
  return files
    .filter(f => f.toLowerCase().endsWith('.md'))
    .sort()
    .map(f => path.join(folderPath, f))
}

/**
 * ファイルをUTF-8として読み込む（非UTF-8は変換）
 */
function readFileAsUTF8(filePath, logCallback) {
  const buffer = fs.readFileSync(filePath)

  try {
    const chardet = require('chardet')
    const detected = chardet.detect(buffer)

    if (detected && detected !== 'UTF-8' && detected !== 'ascii') {
      logCallback('warn', `⚠ ${path.basename(filePath)} がUTF-8ではありません（検出: ${detected}）。変換して処理します。`)
      const iconv = require('iconv-lite')
      return iconv.decode(buffer, detected)
    }
  } catch (e) {}

  return buffer.toString('utf8')
}

/**
 * 出力先の書き込み権限チェック
 */
function checkWritePermission(folderPath) {
  const testFile = path.join(folderPath, `.write-test-${Date.now()}`)
  try {
    fs.writeFileSync(testFile, '')
    fs.unlinkSync(testFile)
    return true
  } catch {
    return false
  }
}

/**
 * Pandocを実行する
 */
function runPandoc(args, cwd, logCallback, currentBuild) {
  return new Promise((resolve, reject) => {
    const pandocPath = getPandocPath()

    if (!fs.existsSync(pandocPath)) {
      return reject(new Error(`Pandocが見つかりません: ${pandocPath}\nvendor/pandoc.exe を配置してください。`))
    }

    logCallback('info', `> pandoc ${args.join(' ')}`)

    const proc = spawn(pandocPath, args, { cwd })
    currentBuild.pandocProcess = proc

    let stderrBuffer = ''
    proc.stderr.on('data', (data) => {
      const text = data.toString()
      stderrBuffer += text
      text.split('\n').filter(Boolean).forEach(line => {
        const level = line.toLowerCase().includes('[warning]') ? 'warn' : 'info'
        logCallback(level, line)
      })
    })

    proc.on('close', (code) => {
      currentBuild.pandocProcess = null
      if (currentBuild.cancelled) return reject(new Error('CANCELLED'))
      if (code !== 0) return reject(new Error(`Pandoc終了コード: ${code}\n${stderrBuffer}`))
      resolve()
    })

    proc.on('error', (err) => reject(new Error(`Pandoc起動エラー: ${err.message}`)))
  })
}

/**
 * EPUB生成
 */
async function buildEPUB(options, progressCallback, logCallback, currentBuild) {
  const { projectPath, outputPath, settings, cssSettings, mdFiles } = options

  progressCallback({ step: 'EPUB生成', current: 1, total: 4, message: 'CSSを生成中...' })

  const cssText = compileCSS(cssSettings)
  const cssFilePath = path.join(projectPath, 'style.css')
  fs.writeFileSync(cssFilePath, cssText, 'utf8')
  logCallback('info', '> style.css を生成しました')

  progressCallback({ step: 'EPUB生成', current: 2, total: 4, message: 'Pandocを実行中...' })

  const relMdFiles = mdFiles.map(f => path.relative(projectPath, f))
  const yamlFile = findYamlFile(projectPath)

  const args = []

  if (yamlFile) {
    args.push('--metadata-file', yamlFile)
  }

  args.push(
    '--from', 'markdown',
    '--to', 'epub3',
    '--css', 'style.css',
    '--toc',
    '--toc-depth', String(settings.toc_depth || 2),
    '--resource-path', '.',
    '-o', outputPath
  )

  if (!yamlFile) {
    if (settings.title) args.push('--metadata', `title=${settings.title}`)
    if (settings.author) args.push('--metadata', `author=${settings.author}`)
    if (settings.language) args.push('--metadata', `lang=${settings.language}`)
  }

  if (settings.cover_image) {
    args.push('--epub-cover-image', settings.cover_image)
  }

  // 末尾添付用のMarkdownファイルを一時生成
  let appendMdPath = null
  if (settings.append_images && settings.append_images.length > 0) {
    const mdContent = settings.append_images.map(imgPath => `\n<div class="append-image-page"><img src="${imgPath}" /></div>\n`).join('')
    appendMdPath = path.join(projectPath, `.epub-pdf-maker-append-${Date.now()}.md`)
    fs.writeFileSync(appendMdPath, mdContent, 'utf8')
    relMdFiles.push(path.relative(projectPath, appendMdPath))
  }

  args.push(...relMdFiles)

  try {
    await runPandoc(args, projectPath, logCallback, currentBuild)
  } finally {
    if (appendMdPath) {
      try { fs.unlinkSync(appendMdPath) } catch (_) {}
    }
  }

  progressCallback({ step: 'EPUB生成', current: 4, total: 4, message: '完了' })
  logCallback('info', `✓ EPUB生成完了: ${path.basename(outputPath)}`)
}

/**
 * HTMLからpandocのタイトルブロックを除去する（表紙なし・本文のみ用）
 */
function removeTitleBlock(htmlPath) {
  try {
    let html = fs.readFileSync(htmlPath, 'utf8')
    html = html.replace(/<header\s+id="title-block-header"[\s\S]*?<\/header>/i, '')
    fs.writeFileSync(htmlPath, html, 'utf8')
  } catch (_) {}
}

/**
 * フル版のタイトルブロックに独立ページ化とposition適用
 * position: 'top'（デフォルト）または 'center'（縦中央揃え）
 */
function injectTitleBlockCSS(htmlPath, position) {
  try {
    let html = fs.readFileSync(htmlPath, 'utf8')
    const alignCSS = position === 'center'
      ? 'display:flex; flex-direction:column; justify-content:center; align-items:center;'
      : ''
    const css = `\n<style>\nheader#title-block-header {\n  ${alignCSS}\n  min-height:85vh;\n  page-break-after:always;\n}\n/* テンプレートのh1 page-break-before:always がタイトルブロック内に適用されると1p目が空白になるため上書き */\nheader#title-block-header h1 {\n  page-break-before: auto !important;\n}\n</style>`
    html = html.replace('</head>', `${css}\n</head>`)
    fs.writeFileSync(htmlPath, html, 'utf8')
  } catch (_) {}
}

/**
 * カバー画像をHTMLファイルの<body>先頭にbase64で埋め込む
 */
function injectCoverPage(htmlPath, coverImagePath) {
  if (!fs.existsSync(coverImagePath)) return
  try {
    const ext = path.extname(coverImagePath).slice(1).toLowerCase()
    const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg'
      : ext === 'png' ? 'image/png'
      : `image/${ext}`
    const data = fs.readFileSync(coverImagePath).toString('base64')
    const coverDiv = [
      '<div style="page-break-after:always;text-align:center;',
      'display:flex;align-items:center;justify-content:center;',
      'min-height:90vh;margin:0;padding:0;">',
      `<img src="data:${mime};base64,${data}" `,
      'style="max-width:100%;max-height:90vh;object-fit:contain;">',
      '</div>'
    ].join('')
    let html = fs.readFileSync(htmlPath, 'utf8')
    html = html.replace(/(<body[^>]*>)/, `$1\n${coverDiv}`)
    fs.writeFileSync(htmlPath, html, 'utf8')
  } catch (_) {}
}

/**
 * PDF生成（Pandoc→HTML→Puppeteer）
 * 3バリアントを同時生成:
 *   フル版: 表紙 + 目次 + 本文
 *   表紙なし: 目次 + 本文
 *   本文のみ: 本文のみ（表紙・目次なし）
 */
async function buildPDF(options, progressCallback, logCallback, currentBuild) {
  const { projectPath, outputPath, settings, cssSettings, mdFiles, coverPosition } = options

  progressCallback({ step: 'PDF生成', current: 1, total: 10, message: 'CSSを生成中...' })

  // CSS を一度だけ書き出し（3バリアント共通）
  const cssText = compileCSS(cssSettings)
  fs.writeFileSync(path.join(projectPath, 'style.css'), cssText, 'utf8')
  logCallback('info', '> style.css を生成しました')

  const ext = path.extname(outputPath)   // '.pdf'
  const base = outputPath.slice(0, -ext.length)
  const yamlFile = findYamlFile(projectPath)
  const relMdFiles = mdFiles.map(f => path.relative(projectPath, f))

  // 末尾添付用のMarkdownファイルを一時生成
  let appendMdPath = null
  if (settings.append_images && settings.append_images.length > 0) {
    const mdContent = settings.append_images.map(imgPath => `\n<div class="append-image-page"><img src="${imgPath}" /></div>\n`).join('')
    appendMdPath = path.join(projectPath, `.epub-pdf-maker-append-${Date.now()}.md`)
    fs.writeFileSync(appendMdPath, mdContent, 'utf8')
    relMdFiles.push(path.relative(projectPath, appendMdPath))
  }

  const hasCoverImage = !!(settings.cover_image &&
    fs.existsSync(path.join(projectPath, settings.cover_image)))

  // variants:
  //   removeTitleBlock=false → フル版はpandocタイトルブロックを表紙ページとして残す
  //   removeTitleBlock=true  → 表紙なし・本文のみはタイトルブロックを除去
  //   insertCoverImage=true  → 表紙イラスト付き版は表紙画像を先頭に挿入
  const variants = [
    { suffix: '_表紙イラスト付き', insertCoverImage: true, withToc: true, removeTitleBlock: false, label: '表紙イラスト付き' },
    { suffix: '',        insertCoverImage: false, withToc: true,  removeTitleBlock: false, label: 'フル版' },
    { suffix: '_表紙なし', insertCoverImage: false, withToc: true,  removeTitleBlock: true,  label: '表紙なし' },
    { suffix: '_本文のみ', insertCoverImage: false, withToc: false, removeTitleBlock: true,  label: '本文のみ' }
  ].filter(v => {
    // 表紙イラスト付きは表紙画像がある場合のみ生成
    if (v.insertCoverImage && !hasCoverImage) return false
    return true
  })

  // Puppeteer ブラウザを一度だけ起動
  let puppeteer
  try {
    puppeteer = require('puppeteer-core')
  } catch (e) {
    throw new Error(`puppeteer-coreの読み込みに失敗しました: ${e.message}`)
  }

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }

  // Chrome実行ファイルのパスを解決
  if (app.isPackaged) {
    // パッケージ版: resources/chrome/chrome.exe
    const chromePath = path.join(process.resourcesPath, 'chrome', 'chrome.exe')
    if (fs.existsSync(chromePath)) {
      launchOptions.executablePath = chromePath
    } else {
      throw new Error(`Chromeが見つかりません: ${chromePath}`)
    }
  } else {
    // 開発版: Puppeteerキャッシュから最新のChromeを探す
    const cacheDir = path.join(os.homedir(), '.cache', 'puppeteer', 'chrome')
    if (fs.existsSync(cacheDir)) {
      const versions = fs.readdirSync(cacheDir).filter(d => d.startsWith('win64-')).sort().reverse()
      if (versions.length > 0) {
        const chromeBin = path.join(cacheDir, versions[0], 'chrome-win64', 'chrome.exe')
        if (fs.existsSync(chromeBin)) {
          launchOptions.executablePath = chromeBin
        }
      }
    }
    if (!launchOptions.executablePath) {
      throw new Error('開発用Chromeが見つかりません。npx puppeteer browsers install chrome を実行してください。')
    }
  }

  logCallback('warn', '⚠ Webフォントが取得できない場合、PDF内のフォントがシステムデフォルトになります')

  const browser = await puppeteer.launch(launchOptions)
  currentBuild.puppeteerBrowser = browser

  try {
    // 全体進捗: CSS(1) + バリアントN個 × ステップ3(HTML/表紙/PDF)
    let step = 1
    const total = 1 + variants.length * 3

    for (const variant of variants) {
      if (currentBuild.cancelled) throw new Error('CANCELLED')

      const variantOutputPath = `${base}${variant.suffix}${ext}`
      logCallback('info', `> PDF（${variant.label}）を生成中...`)

      // ── Step 1: Pandoc で HTML 生成 ──
      step++
      progressCallback({ step: `PDF生成 (${variant.label})`, current: step, total, message: 'HTMLを生成中...' })

      const tempHtmlPath = path.join(os.tmpdir(), `epub-pdf-maker-${Date.now()}.html`)
      currentBuild.tempHtmlPath = tempHtmlPath

      const args = []
      if (yamlFile) args.push('--metadata-file', yamlFile)
      args.push('--from', 'markdown', '--to', 'html5')
      args.push('--css', 'style.css')
      if (variant.withToc) {
        args.push('--toc', '--toc-depth', String(settings.toc_depth || 2))
      }
      // --embed-resources: CSSや画像をHTMLにインライン化 → Puppeteerの一時ディレクトリ読み込みでも適用される
      args.push('--standalone', '--embed-resources', '--resource-path', '.', '-o', tempHtmlPath)
      if (!yamlFile) {
        if (settings.title) args.push('--metadata', `title=${settings.title}`)
        if (settings.author) args.push('--metadata', `author=${settings.author}`)
      }
      args.push(...relMdFiles)

      await runPandoc(args, projectPath, logCallback, currentBuild)

      // ── Step 2: タイトルブロック処理 ──
      step++
      if (variant.removeTitleBlock) {
        // 表紙なし・本文のみ: pandocタイトルブロック（表紙相当）を除去
        progressCallback({ step: `PDF生成 (${variant.label})`, current: step, total, message: 'タイトルページを除去中...' })
        removeTitleBlock(tempHtmlPath)
      } else {
        // フル版・表紙イラスト付き: タイトルブロックを独立ページ化 + 縦位置CSS適用
        progressCallback({ step: `PDF生成 (${variant.label})`, current: step, total, message: 'タイトルページを設定中...' })
        injectTitleBlockCSS(tempHtmlPath, coverPosition || 'top')

        // 表紙イラスト付き版: 表紙画像を先頭に挿入
        if (variant.insertCoverImage && hasCoverImage) {
          const coverAbsPath = path.join(projectPath, settings.cover_image)
          logCallback('info', `> PDF表紙画像を挿入: ${settings.cover_image}`)
          injectCoverPage(tempHtmlPath, coverAbsPath)
        }
      }

      // ── Step 3: Puppeteer で PDF 生成 ──
      step++
      progressCallback({ step: `PDF生成 (${variant.label})`, current: step, total, message: 'PDFを生成中...' })

      if (currentBuild.cancelled) throw new Error('CANCELLED')

      const page = await browser.newPage()
      page.setDefaultNavigationTimeout(5 * 60 * 1000)

      const fileUrl = `file:///${tempHtmlPath.replace(/\\/g, '/')}`
      await page.goto(fileUrl, { waitUntil: 'networkidle0' })

      if (currentBuild.cancelled) {
        await page.close()
        throw new Error('CANCELLED')
      }

      await page.pdf({
        path: variantOutputPath,
        format: 'A4',
        printBackground: true,
        margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
      })

      await page.close()

      try { fs.unlinkSync(tempHtmlPath) } catch (_) {}
      currentBuild.tempHtmlPath = null

      logCallback('info', `✓ PDF生成完了: ${path.basename(variantOutputPath)}`)
    }

  } catch (err) {
    await browser.close()
    currentBuild.puppeteerBrowser = null
    if (appendMdPath) {
      try { fs.unlinkSync(appendMdPath) } catch (_) {}
    }
    throw err
  }

  await browser.close()
  currentBuild.puppeteerBrowser = null
  if (appendMdPath) {
    try { fs.unlinkSync(appendMdPath) } catch (_) {}
  }
}

module.exports = {
  compileCSS,
  collectMarkdownFiles,
  readFileAsUTF8,
  checkWritePermission,
  buildEPUB,
  buildPDF,
  getPandocPath
}

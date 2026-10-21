'use strict'

// ────────────────────────────────
// アプリ状態
// ────────────────────────────────
const AppState = {
  projectPath: null,
  outputPath: null,
  projectInfo: null,
  cssSettings: null,
  templates: [],
  isBuilding: false,
  lastBuildResult: null
}

const DEFAULT_YAML_TEMPLATE = `# 必須項目
title: タイトルを入力してください
author: 著者名
language: ja-JP

# 任意項目
# cover_image: images/cover.png
# output_epub: output.epub
# output_pdf: output.pdf
toc_depth: 2
page_direction: ltr
`

// ────────────────────────────────
// DOM参照
// ────────────────────────────────
const $ = (id) => document.getElementById(id)

const elProjectPath = $('project-path')
const elFileList = $('file-list')
const elTemplateSelect = $('template-select')
const elFontSelect = $('font-select')
const elFontSizeRange = $('font-size-range')
const elFontSizeNum = $('font-size-num')
const elLineHeightRange = $('line-height-range')
const elLineHeightNum = $('line-height-num')
const elTextIndentRange = $('text-indent-range')
const elTextIndentNum = $('text-indent-num')
const elCoverImagePath = $('cover-image-path')
const elCoverPreviewContainer = $('cover-preview-container')
const elCoverPreviewImg = $('cover-preview-img')
const elCoverWarning = $('cover-warning')
const elBtnSelectCover = $('btn-select-cover')
const elBtnClearCover = $('btn-clear-cover')
const elBtnAddAppendImage = $('btn-add-append-image')
const elAppendImageList = $('append-image-list')
const elOutputPath = $('output-path')
const elGenEpub = $('gen-epub')
const elGenPdf = $('gen-pdf')
const elBtnGenerate = $('btn-generate')
const elBtnCancel = $('btn-cancel')
const elProgressContainer = $('progress-container')
const elProgressFill = $('progress-fill')
const elProgressLabel = $('progress-label')
const elLogArea = $('log-area')
const elLogActions = $('log-actions')
const elBtnOpenTempHtml = $('btn-open-temp-html')
const elBtnRetryBuild = $('btn-retry-build')
const elOutputWriteError = $('output-write-error')

// ────────────────────────────────
// 警告ルール（リアルタイムチェック用・renderer内）
// ────────────────────────────────
const WARNING_RULES = {
  'body.font-size': [
    { check: (v) => v < 10, msg: '※文字が小さすぎます' },
    { check: (v) => v > 22, msg: '※フォントサイズが大きすぎます' }
  ],
  'body.line-height': [
    { check: (v) => v < 1.2, msg: '※行間が狭すぎます' },
    { check: (v) => v > 3.0, msg: '※行間が大きすぎます' }
  ],
  'p.text-indent': [
    { check: (v) => v > 3, msg: '※字下げが大きすぎます' }
  ]
}

function getInlineWarning(key, value) {
  const rules = WARNING_RULES[key]
  if (!rules) return ''
  const numVal = parseFloat(value)
  if (isNaN(numVal)) return ''
  for (const rule of rules) {
    if (rule.check(numVal)) return rule.msg
  }
  return ''
}

// ────────────────────────────────
// 初期化
// ────────────────────────────────
async function init() {
  // テンプレート一覧取得
  AppState.templates = await window.electronAPI.listTemplates()
  populateTemplateSelect()

  // 前回のCSS設定を復元
  const saved = await window.electronAPI.loadSettings()
  if (saved) {
    AppState.cssSettings = saved
  }

  // sessionStorageから詳細設定の結果を復元
  const storedSettings = sessionStorage.getItem('cssSettings')
  if (storedSettings) {
    try {
      AppState.cssSettings = JSON.parse(storedSettings)
    } catch (_) {}
    sessionStorage.removeItem('cssSettings')
  }

  if (AppState.cssSettings) {
    populateStyleUI(AppState.cssSettings)
    updateTemplateSelect(AppState.cssSettings.template_name)
    updateStylePreview()
  }

  // プロジェクトパスをsessionStorageから復元
  const storedProject = sessionStorage.getItem('projectPath')
  if (storedProject) {
    await loadProject(storedProject)
    sessionStorage.removeItem('projectPath')
  }

  // イベントリスナー登録
  registerEventListeners()

  // ビルドイベント受信
  window.electronAPI.onBuildProgress(onBuildProgress)
  window.electronAPI.onBuildLog(onBuildLog)
}

// ────────────────────────────────
// テンプレートUI
// ────────────────────────────────
function populateTemplateSelect() {
  elTemplateSelect.innerHTML = ''
  for (const tmpl of AppState.templates) {
    const opt = document.createElement('option')
    opt.value = tmpl.template_name
    opt.textContent = tmpl.template_name + (tmpl.builtin ? '' : ' ★')
    elTemplateSelect.appendChild(opt)
  }
}

function updateTemplateSelect(name) {
  if (!name) return
  for (const opt of elTemplateSelect.options) {
    if (opt.value === name) {
      elTemplateSelect.value = name
      return
    }
  }
}

// ────────────────────────────────
// スタイルUI ← CSSSettings
// ────────────────────────────────
function populateStyleUI(settings) {
  if (!settings) return

  // フォント
  const fontFamily = settings.body?.['font-family'] || ''
  for (const opt of elFontSelect.options) {
    if (opt.value === fontFamily) {
      elFontSelect.value = fontFamily
      break
    }
  }

  // フォントサイズ
  const fontSize = parseFloat(settings.body?.['font-size']) || 16
  elFontSizeRange.value = fontSize
  elFontSizeNum.value = fontSize

  // 行間
  const lineHeight = parseFloat(settings.body?.['line-height']) || 1.7
  elLineHeightRange.value = lineHeight
  elLineHeightNum.value = lineHeight

  // 字下げ
  const textIndent = parseFloat(settings.p?.['text-indent']) || 0
  elTextIndentRange.value = textIndent
  elTextIndentNum.value = textIndent

  // テキスト揃え
  const textAlign = settings.body?.['text-align'] || 'justify'
  const radioEl = document.querySelector(`input[name="text-align"][value="${textAlign}"]`)
  if (radioEl) radioEl.checked = true

  // 警告更新
  updateInlineWarnings()
}

// ────────────────────────────────
// スタイルUI → CSSSettings
// ────────────────────────────────
function collectStyleFromUI() {
  const fontSize = elFontSizeNum.value
  const lineHeight = elLineHeightNum.value
  const textIndent = elTextIndentNum.value
  const textAlign = document.querySelector('input[name="text-align"]:checked')?.value || 'justify'
  const fontFamily = elFontSelect.value

  // 既存設定にマージ（詳細設定の値を保持）
  const base = AppState.cssSettings ? JSON.parse(JSON.stringify(AppState.cssSettings)) : {}

  if (!base.body) base.body = {}
  base.body['font-family'] = fontFamily
  base.body['font-size'] = `${fontSize}px`
  base.body['line-height'] = parseFloat(lineHeight)
  base.body['text-align'] = textAlign

  if (!base.p) base.p = {}
  base.p['text-indent'] = `${textIndent}em`

  return base
}

// ────────────────────────────────
// インライン警告更新
// ────────────────────────────────
function updateInlineWarnings() {
  $('warn-font-size').textContent = getInlineWarning('body.font-size', elFontSizeNum.value)
  $('warn-line-height').textContent = getInlineWarning('body.line-height', elLineHeightNum.value)
  $('warn-text-indent').textContent = getInlineWarning('p.text-indent', elTextIndentNum.value)
}

// ────────────────────────────────
// スタイルプレビュー更新
// ────────────────────────────────
function compileCSSForPreview(settings, ns) {
  const css = []
  if (settings.body) {
    const b = settings.body
    const rules = []
    if (b['font-family']) rules.push(`font-family: ${b['font-family']}`)
    if (b['font-size']) rules.push(`font-size: ${b['font-size']}`)
    if (b['line-height'] !== undefined) rules.push(`line-height: ${b['line-height']}`)
    if (b['text-align']) rules.push(`text-align: ${b['text-align']}`)
    if (rules.length) css.push(`${ns} { ${rules.join('; ')} }`)
  }
  if (settings.p) {
    const p = settings.p
    const rules = []
    if (p['text-indent']) rules.push(`text-indent: ${p['text-indent']}`)
    if (p['margin-bottom']) rules.push(`margin-bottom: ${p['margin-bottom']}`)
    if (rules.length) css.push(`${ns} p { ${rules.join('; ')} }`)
  }
  for (const tag of ['h1', 'h2', 'h3']) {
    if (!settings[tag]) continue
    const h = settings[tag]
    const rules = []
    if (h['font-size']) rules.push(`font-size: ${h['font-size']}`)
    if (h['font-weight']) rules.push(`font-weight: ${h['font-weight']}`)
    if (h['margin-top'] !== undefined) rules.push(`margin-top: ${h['margin-top']}`)
    if (h['margin-bottom'] !== undefined) rules.push(`margin-bottom: ${h['margin-bottom']}`)
    if (h['border-bottom']) rules.push(`border-bottom: ${h['border-bottom']}`)
    if (rules.length) css.push(`${ns} ${tag} { ${rules.join('; ')} }`)
  }
  return css.join('\n')
}

function updateStylePreview() {
  const settings = collectStyleFromUI()
  const css = compileCSSForPreview(settings, '#style-preview-content')
  let styleEl = document.getElementById('preview-dynamic-style')
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = 'preview-dynamic-style'
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}

// ────────────────────────────────
// プロジェクト読み込み
// ────────────────────────────────
async function loadProject(folderPath) {
  const info = await window.electronAPI.loadProject(folderPath)
  AppState.projectPath = folderPath
  AppState.projectInfo = info
  AppState.outputPath = folderPath

  if (!AppState.projectInfo.settings.append_images) {
    AppState.projectInfo.settings.append_images = []
  }

  elProjectPath.value = folderPath
  elOutputPath.value = folderPath

  $('section-files').style.display = ''
  $('section-metadata').style.display = ''
  $('section-style').style.display = ''
  $('section-output').style.display = ''
  $('section-generate').style.display = ''
  $('section-log').style.display = ''

  // メタデータ入力欄を現在のYAML設定で初期化
  $('meta-title').value = info.settings.title || ''
  $('meta-author').value = info.settings.author || ''
  const langSel = $('meta-language')
  const langVal = info.settings.language || 'ja-JP'
  for (const opt of langSel.options) {
    if (opt.value === langVal) { langSel.value = langVal; break }
  }

  // 表紙画像をYAML設定から復元
  restoreCoverImage(info.settings, folderPath)
  
  // 末尾追加画像を復元
  await restoreAppendImages(info.settings, folderPath)

  renderFileList(info)
  validateGenerateButton()
  appendLog('info', `> プロジェクトを読み込みました（章: ${info.mdFiles.length}、画像: ${info.imageCount}）`)

  for (const warn of info.warnings) {
    appendLog('warn', warn)
  }

  // YAMLが存在しない場合は編集モーダルを自動表示
  if (info.yamlContent === null) {
    const folderName = folderPath.split(/[\\/]/).pop()
    const defaultContent = DEFAULT_YAML_TEMPLATE.replace('タイトルを入力してください', folderName)
    const saved = await showYamlModal({
      title: '設定ファイルの新規作成',
      desc: 'YAMLファイルが見つかりませんでした。内容を確認・編集して「保存する」を押してください。',
      content: defaultContent,
      filename: 'settings.yaml'
    })
    if (saved) {
      await loadProject(folderPath)
    }
  }
}

// ────────────────────────────────
// ファイル一覧表示
// ────────────────────────────────
function renderFileList(info) {
  elFileList.innerHTML = ''

  const addItem = (status, label, cls) => {
    const div = document.createElement('div')
    div.className = `file-item ${cls}`
    div.innerHTML = `<span class="file-status">${status}</span><span>${label}</span>`
    elFileList.appendChild(div)
  }

  const yamlLabel = info.yamlFile || 'settings.yaml'
  const hasYaml = !!info.yamlFile
  const yamlDiv = document.createElement('div')
  yamlDiv.className = `file-item ${hasYaml ? 'ok' : 'warn'}`
  yamlDiv.innerHTML = `
    <span class="file-status">${hasYaml ? '✓' : '⚠'}</span>
    <span>${yamlLabel}</span>
    <button class="btn-yaml-edit" data-filename="${yamlLabel}">${hasYaml ? '編集' : '新規作成'}</button>
  `
  yamlDiv.querySelector('.btn-yaml-edit').addEventListener('click', async () => {
    const filename = hasYaml ? info.yamlFile : 'settings.yaml'
    const content = info.yamlContent || DEFAULT_YAML_TEMPLATE.replace(
      'タイトルを入力してください',
      (AppState.projectPath || '').split(/[\\/]/).pop()
    )
    const saved = await showYamlModal({
      title: `${filename} の編集`,
      desc: 'YAMLの内容を編集して保存してください。',
      content,
      filename
    })
    if (saved) await loadProject(AppState.projectPath)
  })
  elFileList.appendChild(yamlDiv)
  addItem('✓', 'style.css', 'ok')  // 生成されるため常にOK扱い

  if (info.mdFiles.length === 0) {
    const div = document.createElement('div')
    div.className = 'file-empty-warn'
    div.textContent = '⚠ .mdファイルが見つかりません'
    elFileList.appendChild(div)
  } else {
    for (const mdPath of info.mdFiles) {
      const name = mdPath.split(/[\\/]/).pop()
      addItem('✓', name, 'chapter')
    }
  }

  if (info.imageCount > 0) {
    addItem('📁', `images/ （${info.imageCount}ファイル）`, 'images')
  }
}

// ────────────────────────────────
// 生成ボタンの活性制御
// ────────────────────────────────
function validateGenerateButton() {
  const hasMd = AppState.projectInfo?.mdFiles?.length > 0
  const hasOutput = !!AppState.outputPath
  const hasTarget = elGenEpub.checked || elGenPdf.checked
  elBtnGenerate.disabled = !hasMd || !hasOutput || !hasTarget || AppState.isBuilding
}

// ────────────────────────────────
// ビルド実行
// ────────────────────────────────
async function handleGenerate() {
  // メタデータ入力をsettingsに反映（生成時のみ・YAMLは上書きしない）
  const metaTitle = $('meta-title')?.value.trim()
  const metaAuthor = $('meta-author')?.value.trim()
  const metaLang = $('meta-language')?.value
  if (metaTitle) AppState.projectInfo.settings.title = metaTitle
  if (metaAuthor) AppState.projectInfo.settings.author = metaAuthor
  if (metaLang) AppState.projectInfo.settings.language = metaLang

  AppState.cssSettings = collectStyleFromUI()

  // 出力先書き込み権限チェック
  const canWrite = await window.electronAPI.checkWritePermission(AppState.outputPath)
  if (!canWrite) {
    elOutputWriteError.style.display = ''
    elOutputPath.style.borderColor = 'var(--color-error)'
    appendLog('error', '✗ 出力先に書き込みできません。別のフォルダを選択してください。')
    return
  }

  // カスタムCSS構文チェック
  const customCss = AppState.cssSettings.custom_css || ''
  if (customCss.trim()) {
    const cssResult = await window.electronAPI.validateCSS(customCss)
    if (!cssResult.valid) {
      appendLog('error', cssResult.errors[0].message)
      return
    }
  }

  // PDF崩れ警告チェック
  const warnings = await window.electronAPI.checkPDFWarnings(AppState.cssSettings)
  if (warnings.length > 0) {
    const proceed = await showWarningsModal(warnings)
    if (!proceed) return
  }

  // 既存ファイル存在チェック
  const epubName = AppState.projectInfo.settings.output_epub || `${AppState.projectInfo.settings.title || 'output'}.epub`
  const pdfName = AppState.projectInfo.settings.output_pdf || `${AppState.projectInfo.settings.title || 'output'}.pdf`

  if (elGenEpub.checked) {
    const epubPath = `${AppState.outputPath}/${epubName}`
    const exists = await window.electronAPI.checkFileExists(epubPath)
    if (exists) {
      const action = await showOverwriteModal(epubName)
      if (action === 'cancel') return
    }
  }

  // 設定を保存
  await window.electronAPI.saveSettings(AppState.cssSettings)

  // ビルド開始
  setBuilding(true)
  elLogActions.style.display = 'none'
  elBtnOpenTempHtml.style.display = 'none'
  elBtnRetryBuild.style.display = 'none'

  const coverPosition = document.querySelector('input[name="cover-position"]:checked')?.value || 'top'

  // 表紙画像をsettingsに反映（生成直前に確定）
  const coverImageVal = elCoverImagePath.value.trim()
  if (coverImageVal) {
    AppState.projectInfo.settings.cover_image = coverImageVal
  }

  const result = await window.electronAPI.startBuild({
    projectPath: AppState.projectPath,
    outputDir: AppState.outputPath,
    outputEpubName: epubName,
    outputPdfName: pdfName,
    settings: AppState.projectInfo.settings,
    cssSettings: AppState.cssSettings,
    generateEpub: elGenEpub.checked,
    generatePdf: elGenPdf.checked,
    coverPosition
  })

  setBuilding(false)
  AppState.lastBuildResult = result

  if (!result.success) {
    if (result.error !== 'CANCELLED') {
      appendLog('error', `✗ 生成に失敗しました: ${result.error}`)
    }

    if (result.tempHtmlPath) {
      elLogActions.style.display = 'flex'
      elBtnOpenTempHtml.style.display = ''
      elBtnOpenTempHtml.onclick = () => window.electronAPI.openFile(result.tempHtmlPath)
      elBtnRetryBuild.style.display = ''
    }
  }
}

// ────────────────────────────────
// 上書き確認モーダル
// ────────────────────────────────
function showOverwriteModal(fileName) {
  return new Promise((resolve) => {
    $('modal-overwrite-msg').textContent = `${fileName} はすでに存在します。上書きしますか？`
    $('modal-overwrite').style.display = 'flex'

    const cleanup = () => { $('modal-overwrite').style.display = 'none' }
    $('modal-overwrite-cancel').onclick = () => { cleanup(); resolve('cancel') }
    $('modal-overwrite-rename').onclick = () => { cleanup(); resolve('rename') }
    $('modal-overwrite-ok').onclick = () => { cleanup(); resolve('overwrite') }
  })
}

// ────────────────────────────────
// PDF崩れ警告モーダル
// ────────────────────────────────
function showWarningsModal(warnings) {
  return new Promise((resolve) => {
    const list = $('modal-warning-list')
    list.innerHTML = ''
    for (const w of warnings) {
      const li = document.createElement('li')
      li.textContent = w.message
      list.appendChild(li)
    }
    $('modal-warnings').style.display = 'flex'

    const cleanup = () => { $('modal-warnings').style.display = 'none' }
    $('modal-warn-cancel').onclick = () => { cleanup(); resolve(false) }
    $('modal-warn-ok').onclick = () => { cleanup(); resolve(true) }
  })
}

// ────────────────────────────────
// YAML編集モーダル
// ────────────────────────────────
function showYamlModal({ title, desc, content, filename }) {
  return new Promise((resolve) => {
    $('modal-yaml-title').textContent = title
    $('modal-yaml-desc').textContent = desc
    $('modal-yaml-editor').value = content
    $('modal-yaml-error').textContent = ''
    $('modal-yaml').style.display = 'flex'

    const cleanup = () => { $('modal-yaml').style.display = 'none' }

    $('modal-yaml-cancel').onclick = () => { cleanup(); resolve(null) }

    $('modal-yaml-save').onclick = async () => {
      const yamlText = $('modal-yaml-editor').value.trim()
      if (!yamlText) {
        $('modal-yaml-error').textContent = '内容を入力してください'
        return
      }
      const result = await window.electronAPI.saveYaml(
        AppState.projectPath,
        filename,
        yamlText
      )
      if (result.success) {
        cleanup()
        resolve(result.filePath)
      } else {
        $('modal-yaml-error').textContent = `保存エラー: ${result.error}`
      }
    }
  })
}

// ────────────────────────────────
// ビルド中UI状態
// ────────────────────────────────
function setBuilding(building) {
  AppState.isBuilding = building
  elBtnGenerate.style.display = building ? 'none' : ''
  elBtnCancel.style.display = building ? '' : 'none'
  elProgressContainer.style.display = building ? '' : 'none'
  if (!building) {
    elProgressFill.style.width = '0%'
    elProgressLabel.textContent = ''
  }
}

// ────────────────────────────────
// ビルドイベント受信
// ────────────────────────────────
function onBuildProgress(data) {
  const pct = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0
  elProgressFill.style.width = `${pct}%`
  elProgressLabel.textContent = `${data.step}... (${data.current}/${data.total}: ${data.message})`
}

function onBuildLog(data) {
  appendLog(data.level, data.message)
}

// ────────────────────────────────
// ログ出力
// ────────────────────────────────
function appendLog(level, message) {
  $('section-log').style.display = ''
  const line = document.createElement('span')
  line.className = `log-line log-${level}`
  if (message.startsWith('✓')) line.className = 'log-line log-success'
  line.textContent = message
  elLogArea.appendChild(line)
  elLogArea.appendChild(document.createElement('br'))
  elLogArea.scrollTop = elLogArea.scrollHeight
}

// ────────────────────────────────
// 表紙画像
// ────────────────────────────────

/**
 * 絶対パスをプロジェクトフォルダからの相対パスに変換
 */
function toRelativeCoverPath(absPath, projectPath) {
  if (!absPath || !projectPath) return absPath
  // Windows: ドライブレターの大文字/小文字を統一して比較
  const normAbs = absPath.replace(/\\/g, '/').toLowerCase()
  const normProj = projectPath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase() + '/'
  if (normAbs.startsWith(normProj)) {
    // 元のパスから相対部分を切り出す（大文字小文字を保持）
    return absPath.replace(/\\/g, '/').slice(normProj.length)
  }
  return null // プロジェクト外
}

/**
 * 表紙画像の選択処理
 */
async function selectCoverImage() {
  const absPath = await window.electronAPI.openImage()
  if (!absPath) return

  const relPath = toRelativeCoverPath(absPath, AppState.projectPath)
  if (!relPath) {
    elCoverPreviewContainer.style.display = ''
    elCoverWarning.textContent = '⚠ プロジェクトフォルダ外の画像です。フォルダ内にコピーしてから選択してください。'
    elCoverWarning.style.color = 'var(--color-error)'
    return
  }

  setCoverImage(relPath, absPath)
}

/**
 * 表紙画像をUIにセットする
 */
function setCoverImage(relPath, absPath) {
  elCoverImagePath.value = relPath
  elBtnClearCover.style.display = ''

  // プレビュー表示
  const fileUrl = absPath
    ? `file:///${absPath.replace(/\\/g, '/')}`
    : `file:///${(AppState.projectPath + '/' + relPath).replace(/\\/g, '/')}`
  elCoverPreviewImg.src = fileUrl
  elCoverPreviewContainer.style.display = ''
  elCoverWarning.textContent = ''
  elCoverWarning.style.color = 'var(--color-warning)'

  // settings に反映
  if (AppState.projectInfo) {
    AppState.projectInfo.settings.cover_image = relPath
  }
}

/**
 * 表紙画像をクリアする
 */
function clearCoverImage() {
  elCoverImagePath.value = ''
  elBtnClearCover.style.display = 'none'
  elCoverPreviewContainer.style.display = 'none'
  elCoverPreviewImg.src = ''
  elCoverWarning.textContent = ''

  if (AppState.projectInfo) {
    AppState.projectInfo.settings.cover_image = ''
  }
}

/**
 * プロジェクト読み込み時にYAMLのcover_imageを復元
 */
async function restoreCoverImage(settings, projectPath) {
  if (settings.cover_image) {
    // パストラバーサル防止
    if (settings.cover_image.includes('..')) {
      elCoverWarning.textContent = '⚠ 不正なパスです: ' + settings.cover_image
      elCoverWarning.style.color = 'var(--color-error)'
      elCoverPreviewContainer.style.display = ''
      return
    }
    const absPath = projectPath.replace(/\\/g, '/') + '/' + settings.cover_image
    const exists = await window.electronAPI.checkFileExists(absPath)
    if (exists) {
      setCoverImage(settings.cover_image, absPath)
    } else {
      elCoverImagePath.value = settings.cover_image
      elBtnClearCover.style.display = ''
      elCoverPreviewContainer.style.display = ''
      elCoverWarning.textContent = '⚠ 画像ファイルが見つかりません: ' + settings.cover_image
      elCoverWarning.style.color = 'var(--color-error)'
    }
  } else {
    clearCoverImage()
  }
}

// ────────────────────────────────
// 末尾添付画像
// ────────────────────────────────

/**
 * リストを再描画する
 */
function renderAppendImages() {
  elAppendImageList.innerHTML = ''
  const images = AppState.projectInfo?.settings?.append_images || []
  
  if (images.length === 0) {
    return
  }

  images.forEach((relPath, index) => {
    const li = document.createElement('li')
    li.className = 'append-image-item'

    const span = document.createElement('span')
    span.className = 'filename'
    span.textContent = relPath.split(/[\\/]/).pop() // ファイル名のみ表示
    span.title = relPath

    const btnUp = document.createElement('button')
    btnUp.textContent = '↑'
    btnUp.disabled = index === 0
    btnUp.onclick = () => {
      [images[index - 1], images[index]] = [images[index], images[index - 1]]
      renderAppendImages()
    }

    const btnDown = document.createElement('button')
    btnDown.textContent = '↓'
    btnDown.disabled = index === images.length - 1
    btnDown.onclick = () => {
      [images[index + 1], images[index]] = [images[index], images[index + 1]]
      renderAppendImages()
    }

    const btnDel = document.createElement('button')
    btnDel.textContent = '✕'
    btnDel.className = 'danger'
    btnDel.onclick = () => {
      images.splice(index, 1)
      renderAppendImages()
    }

    li.appendChild(span)
    li.appendChild(btnUp)
    li.appendChild(btnDown)
    li.appendChild(btnDel)
    elAppendImageList.appendChild(li)
  })
}

/**
 * 画像を追加
 */
async function addAppendImages() {
  const absPaths = await window.electronAPI.openImages()
  if (!absPaths || absPaths.length === 0) return

  const images = AppState.projectInfo.settings.append_images || []
  let invalidCount = 0

  for (const absPath of absPaths) {
    const relPath = toRelativeCoverPath(absPath, AppState.projectPath)
    if (relPath) {
      if (!images.includes(relPath)) {
        images.push(relPath)
      }
    } else {
      invalidCount++
    }
  }

  if (invalidCount > 0) {
    alert(`プロジェクトフォルダ外の画像が ${invalidCount} 件ありました。\nプロジェクトフォルダ内にコピーしてから選択してください。`)
  }

  AppState.projectInfo.settings.append_images = images
  renderAppendImages()
}

/**
 * プロジェクト読み込み時にYAMLから復元
 */
async function restoreAppendImages(settings, projectPath) {
  if (!settings.append_images) {
    settings.append_images = []
  }
  
  // パストラバーサル防止と存在チェック
  const validImages = []
  for (const p of settings.append_images) {
    if (p.includes('..')) continue
    const absPath = projectPath.replace(/\\/g, '/') + '/' + p
    const exists = await window.electronAPI.checkFileExists(absPath)
    if (exists) {
      validImages.push(p)
    }
  }
  
  settings.append_images = validImages
  renderAppendImages()
}


// ────────────────────────────────
// イベントリスナー登録
// ────────────────────────────────
function registerEventListeners() {

  // フォルダ選択
  $('btn-select-folder').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.openFolder()
    if (folderPath) await loadProject(folderPath)
  })

  // 表紙画像選択
  elBtnSelectCover.addEventListener('click', selectCoverImage)
  elBtnClearCover.addEventListener('click', clearCoverImage)

  // 末尾添付画像追加
  if (elBtnAddAppendImage) {
    elBtnAddAppendImage.addEventListener('click', addAppendImages)
  }

  // テンプレート変更
  elTemplateSelect.addEventListener('change', async () => {
    const name = elTemplateSelect.value
    const tmpl = await window.electronAPI.loadTemplate(name)
    if (tmpl) {
      AppState.cssSettings = tmpl
      populateStyleUI(tmpl)
      updateStylePreview()
    }
  })

  // テンプレートプレビュー
  $('btn-template-preview').addEventListener('click', () => {
    AppState.cssSettings = collectStyleFromUI()
    sessionStorage.setItem('cssSettings', JSON.stringify(AppState.cssSettings))
    if (AppState.projectPath) sessionStorage.setItem('projectPath', AppState.projectPath)
    sessionStorage.setItem('cssFileName', 'style.css')
    window.location.href = 'template.html'
  })

  // フォントサイズ（range/number連動）
  elFontSizeRange.addEventListener('input', () => {
    elFontSizeNum.value = elFontSizeRange.value
    updateInlineWarnings()
  })
  elFontSizeNum.addEventListener('input', () => {
    elFontSizeRange.value = elFontSizeNum.value
    updateInlineWarnings()
  })

  // 行間（range/number連動）
  elLineHeightRange.addEventListener('input', () => {
    elLineHeightNum.value = elLineHeightRange.value
    updateInlineWarnings()
  })
  elLineHeightNum.addEventListener('input', () => {
    elLineHeightRange.value = elLineHeightNum.value
    updateInlineWarnings()
  })

  // 字下げ（range/number連動）
  elTextIndentRange.addEventListener('input', () => {
    elTextIndentNum.value = elTextIndentRange.value
    updateInlineWarnings()
  })
  elTextIndentNum.addEventListener('input', () => {
    elTextIndentRange.value = elTextIndentNum.value
    updateInlineWarnings()
  })

  // 詳細設定へ
  $('btn-advanced-settings').addEventListener('click', () => {
    AppState.cssSettings = collectStyleFromUI()
    sessionStorage.setItem('cssSettings', JSON.stringify(AppState.cssSettings))
    if (AppState.projectPath) sessionStorage.setItem('projectPath', AppState.projectPath)
    window.location.href = 'settings.html'
  })

  // スタイルリセット
  $('btn-reset-style').addEventListener('click', async () => {
    const defaultTmpl = await window.electronAPI.loadTemplate('実用書・教材')
    if (defaultTmpl) {
      AppState.cssSettings = defaultTmpl
      populateStyleUI(defaultTmpl)
      updateTemplateSelect('実用書・教材')
    }
  })

  // CSS保存
  $('btn-save-css').addEventListener('click', async () => {
    if (!AppState.projectPath) {
      appendLog('warn', '⚠ プロジェクトフォルダが選択されていません')
      return
    }
    AppState.cssSettings = collectStyleFromUI()
    const savedPath = await window.electronAPI.saveCSSFile(AppState.projectPath, AppState.cssSettings)
    appendLog('info', `> style.css を保存しました: ${savedPath}`)
  })

  // メタデータ → YAMLに保存
  $('btn-save-yaml-meta').addEventListener('click', async () => {
    if (!AppState.projectPath) {
      appendLog('warn', '⚠ プロジェクトフォルダが選択されていません')
      return
    }
    const fields = {}
    const t = $('meta-title').value.trim()
    const a = $('meta-author').value.trim()
    const l = $('meta-language').value
    if (t) fields.title = t
    if (a) fields.author = a
    if (l) fields.language = l
    // 表紙画像パスもYAMLに保存（クリア済みなら空文字でYAMLの値を上書き）
    fields.cover_image = elCoverImagePath.value.trim() || ''

    const filename = AppState.projectInfo?.yamlFile || 'settings.yaml'
    const result = await window.electronAPI.saveMetadata(AppState.projectPath, filename, fields)
    const msgEl = $('meta-save-msg')
    if (result.success) {
      msgEl.style.color = 'var(--color-success)'
      msgEl.textContent = `✓ ${filename} に保存しました`
      // settings を更新して再読み込み
      AppState.projectInfo.settings = { ...AppState.projectInfo.settings, ...fields }
    } else {
      msgEl.style.color = 'var(--color-error)'
      msgEl.textContent = `✗ ${result.error}`
    }
    setTimeout(() => { msgEl.textContent = '' }, 3000)
  })

  // プレビューの更新
  $('btn-update-preview').addEventListener('click', updateStylePreview)

  // 出力先選択
  $('btn-select-output').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.openFolder()
    if (folderPath) {
      AppState.outputPath = folderPath
      elOutputPath.value = folderPath
      elOutputWriteError.style.display = 'none'
      elOutputPath.style.borderColor = ''
      validateGenerateButton()
    }
  })

  // EPUB/PDF チェックボックス
  elGenEpub.addEventListener('change', validateGenerateButton)
  elGenPdf.addEventListener('change', validateGenerateButton)

  // 生成ボタン
  elBtnGenerate.addEventListener('click', handleGenerate)

  // キャンセルボタン
  elBtnCancel.addEventListener('click', async () => {
    await window.electronAPI.cancelBuild()
    setBuilding(false)
  })

  // 再試行
  $('btn-retry-build').addEventListener('click', handleGenerate)
}

// ────────────────────────────────
// 起動
// ────────────────────────────────
document.addEventListener('DOMContentLoaded', init)

window.addEventListener('beforeunload', () => {
  window.electronAPI.removeAllListeners('build:progress')
  window.electronAPI.removeAllListeners('build:log')
})

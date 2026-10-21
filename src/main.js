'use strict'

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')

const builder = require('./builder')
const validator = require('./validator')

let mainWindow = null

// 実行中ビルドの状態管理
const currentBuild = {
  pandocProcess: null,
  puppeteerBrowser: null,
  cancelled: false,
  tempHtmlPath: null
}

// ユーザー設定ディレクトリ
const USER_DATA_DIR = path.join(os.homedir(), '.epub-pdf-maker')
const USER_TEMPLATES_DIR = path.join(USER_DATA_DIR, 'templates')
const USER_SETTINGS_FILE = path.join(USER_DATA_DIR, 'settings.json')

// 組み込みテンプレートディレクトリ
const BUILTIN_TEMPLATES_DIR = app.isPackaged
  ? path.join(process.resourcesPath, 'templates')
  : path.join(__dirname, '..', 'templates')

function ensureUserDirs() {
  if (!fs.existsSync(USER_DATA_DIR)) fs.mkdirSync(USER_DATA_DIR, { recursive: true })
  if (!fs.existsSync(USER_TEMPLATES_DIR)) fs.mkdirSync(USER_TEMPLATES_DIR, { recursive: true })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 900,
    minWidth: 640,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    title: 'EPUB/PDF Maker'
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(() => {
  ensureUserDirs()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ────────────────────────────────────────────────
// IPC ハンドラー
// ────────────────────────────────────────────────

// フォルダ選択ダイアログ
ipcMain.handle('dialog:openFolder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  })
  return result.cancelled ? null : result.filePaths[0]
})

// 画像ファイル選択ダイアログ（表紙用）
ipcMain.handle('dialog:openImage', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [
      { name: '画像ファイル', extensions: ['jpg', 'jpeg', 'png'] }
    ]
  })
  return result.cancelled ? null : result.filePaths[0]
})

// 画像ファイル選択ダイアログ（末尾添付用・複数可）
ipcMain.handle('dialog:openImages', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '画像ファイル', extensions: ['jpg', 'jpeg', 'png'] }
    ]
  })
  return result.cancelled ? [] : result.filePaths
})

// ファイル保存ダイアログ
ipcMain.handle('dialog:saveFile', async (_, { defaultName, ext }) => {
  const filters = ext === 'epub'
    ? [{ name: 'EPUB', extensions: ['epub'] }]
    : [{ name: 'PDF', extensions: ['pdf'] }]

  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultName,
    filters
  })
  return result.cancelled ? null : result.filePath
})

// プロジェクト読み込み
ipcMain.handle('project:load', async (_, folderPath) => {
  const result = {
    folderPath,
    yamlValid: false,
    yamlError: null,
    settings: {},
    mdFiles: [],
    imageCount: 0,
    warnings: []
  }

  // YAML読み込み（settings.yaml → metadata.yaml → 直下の*.yaml）
  const yamlCandidates = ['settings.yaml', 'metadata.yaml']
  let yamlPath = null
  let yamlFile = null
  for (const name of yamlCandidates) {
    const p = path.join(folderPath, name)
    if (fs.existsSync(p)) { yamlPath = p; yamlFile = name; break }
  }
  if (!yamlPath) {
    try {
      const found = fs.readdirSync(folderPath)
        .filter(f => /\.(yaml|yml)$/i.test(f))
        .sort()
      if (found.length > 0) {
        yamlFile = found[0]
        yamlPath = path.join(folderPath, yamlFile)
      }
    } catch (_) {}
  }

  result.yamlFile = yamlFile

  if (yamlPath) {
    const yamlContent = fs.readFileSync(yamlPath, 'utf8')
    result.yamlContent = yamlContent
    const validated = validator.validateYaml(yamlContent, folderPath)
    result.yamlValid = validated.valid
    result.yamlError = validated.error
    result.settings = validated.settings
    result.warnings.push(...validated.warnings)
  } else {
    result.yamlContent = null
    result.warnings.push('⚠ YAMLファイルが見つかりません。')
    result.settings = {
      title: path.basename(folderPath),
      language: 'ja-JP',
      toc_depth: 2,
      page_direction: 'ltr'
    }
  }

  // Markdownファイル収集
  try {
    result.mdFiles = builder.collectMarkdownFiles(folderPath)
  } catch (e) {
    result.warnings.push(`⚠ ファイル一覧取得エラー: ${e.message}`)
  }

  // 画像カウント
  const imagesDir = path.join(folderPath, 'images')
  if (fs.existsSync(imagesDir)) {
    try {
      const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg']
      const imageFiles = fs.readdirSync(imagesDir)
        .filter(f => imageExts.includes(path.extname(f).toLowerCase()))
      result.imageCount = imageFiles.length
    } catch (_) {}
  }

  return result
})

// CSS設定の読み込み
ipcMain.handle('settings:load', async () => {
  if (fs.existsSync(USER_SETTINGS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(USER_SETTINGS_FILE, 'utf8'))
    } catch (_) {}
  }
  // デフォルト（実用書・教材テンプレートを返す）
  const defaultTemplatePath = path.join(BUILTIN_TEMPLATES_DIR, '実用書・教材.json')
  if (fs.existsSync(defaultTemplatePath)) {
    return JSON.parse(fs.readFileSync(defaultTemplatePath, 'utf8'))
  }
  return null
})

// CSS設定の保存
ipcMain.handle('settings:save', async (_, settings) => {
  ensureUserDirs()
  fs.writeFileSync(USER_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8')
})

// テンプレート一覧
ipcMain.handle('templates:list', async () => {
  const templates = []

  // 組み込みテンプレート
  if (fs.existsSync(BUILTIN_TEMPLATES_DIR)) {
    const files = fs.readdirSync(BUILTIN_TEMPLATES_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(BUILTIN_TEMPLATES_DIR, file), 'utf8'))
        templates.push({ ...data, builtin: true })
      } catch (_) {}
    }
  }

  // ユーザーテンプレート
  if (fs.existsSync(USER_TEMPLATES_DIR)) {
    const files = fs.readdirSync(USER_TEMPLATES_DIR).filter(f => f.endsWith('.json'))
    for (const file of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(USER_TEMPLATES_DIR, file), 'utf8'))
        templates.push({ ...data, builtin: false })
      } catch (_) {}
    }
  }

  return templates
})

// テンプレート読み込み
ipcMain.handle('template:load', async (_, name) => {
  // 組み込みから探す
  const builtinPath = path.join(BUILTIN_TEMPLATES_DIR, `${name}.json`)
  if (fs.existsSync(builtinPath)) {
    return JSON.parse(fs.readFileSync(builtinPath, 'utf8'))
  }

  // ユーザーテンプレートから探す
  const userPath = path.join(USER_TEMPLATES_DIR, `${name}.json`)
  if (fs.existsSync(userPath)) {
    return JSON.parse(fs.readFileSync(userPath, 'utf8'))
  }

  return null
})

// テンプレート保存（ユーザーのみ）
ipcMain.handle('template:save', async (_, { name, settings }) => {
  ensureUserDirs()
  const filePath = path.join(USER_TEMPLATES_DIR, `${name}.json`)
  fs.writeFileSync(filePath, JSON.stringify({ ...settings, template_name: name, builtin: false }, null, 2), 'utf8')
})

// テンプレート削除（ユーザーのみ）
ipcMain.handle('template:delete', async (_, name) => {
  const filePath = path.join(USER_TEMPLATES_DIR, `${name}.json`)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
})

// CSSコンパイル
ipcMain.handle('css:compile', async (_, settings) => {
  return builder.compileCSS(settings)
})

// CSS構文チェック
ipcMain.handle('css:validate', async (_, customCss) => {
  return await validator.validateCustomCSS(customCss)
})

// CSSファイルをプロジェクトフォルダに保存
ipcMain.handle('css:save-file', async (_, { folderPath, settings }) => {
  const cssText = builder.compileCSS(settings)
  const cssPath = path.join(folderPath, 'style.css')
  fs.writeFileSync(cssPath, cssText, 'utf8')
  return cssPath
})

// PDF崩れ警告チェック
ipcMain.handle('validate:pdf-warnings', async (_, settings) => {
  const warnings = validator.checkPDFWarnings(settings)
  const customWarnings = validator.checkCustomCSSWarnings(settings.custom_css || '')
  return [...warnings, ...customWarnings]
})

// メタデータフィールドをYAMLに保存
ipcMain.handle('metadata:save', async (_, { folderPath, filename, fields }) => {
  try {
    const jsYaml = require('js-yaml')
    const filePath = path.join(folderPath, filename || 'settings.yaml')
    let existing = {}
    if (fs.existsSync(filePath)) {
      try { existing = jsYaml.load(fs.readFileSync(filePath, 'utf8')) || {} } catch (_) {}
    }
    Object.assign(existing, fields)
    fs.writeFileSync(filePath, jsYaml.dump(existing, { allowUnicode: true }), 'utf8')
    return { success: true, filePath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

// ビルド開始
ipcMain.handle('build:start', async (_, opts) => {
  const {
    projectPath,
    outputDir,
    outputEpubName,
    outputPdfName,
    settings,
    cssSettings,
    generateEpub,
    generatePdf,
    coverPosition
  } = opts

  currentBuild.cancelled = false
  currentBuild.pandocProcess = null
  currentBuild.puppeteerBrowser = null
  currentBuild.tempHtmlPath = null

  const sendProgress = (data) => {
    if (mainWindow) mainWindow.webContents.send('build:progress', data)
  }
  const sendLog = (level, message) => {
    if (mainWindow) mainWindow.webContents.send('build:log', { level, message })
  }

  const mdFiles = builder.collectMarkdownFiles(projectPath)

  if (mdFiles.length === 0) {
    return { success: false, error: 'Markdownファイルが見つかりません' }
  }

  try {
    if (generateEpub) {
      const epubPath = path.join(outputDir, outputEpubName || `${settings.title || 'output'}.epub`)
      sendLog('info', '> EPUB生成を開始します...')
      await builder.buildEPUB(
        { projectPath, outputPath: epubPath, settings, cssSettings, mdFiles },
        sendProgress,
        sendLog,
        currentBuild
      )
    }

    if (currentBuild.cancelled) {
      return { success: false, error: 'CANCELLED' }
    }

    if (generatePdf) {
      const pdfPath = path.join(outputDir, outputPdfName || `${settings.title || 'output'}.pdf`)
      sendLog('info', '> PDF生成を開始します...')
      await builder.buildPDF(
        { projectPath, outputPath: pdfPath, settings, cssSettings, mdFiles, coverPosition },
        sendProgress,
        sendLog,
        currentBuild
      )
    }

    return { success: true }

  } catch (err) {
    if (err.message === 'CANCELLED') {
      sendLog('warn', '> 生成がキャンセルされました')
      return { success: false, error: 'CANCELLED', tempHtmlPath: currentBuild.tempHtmlPath }
    }

    const isPuppeteerTimeout = err.message.includes('timeout') || err.message.includes('Timeout')

    sendLog('error', `✗ エラー: ${err.message}`)

    if (isPuppeteerTimeout) {
      sendLog('error', '✗ PDF生成がタイムアウトしました')
      if (currentBuild.tempHtmlPath && fs.existsSync(currentBuild.tempHtmlPath)) {
        sendLog('info', `→ ${currentBuild.tempHtmlPath} をブラウザで開き、印刷（Ctrl+P）→「PDFに保存」で代替できます`)
      }
    }

    return {
      success: false,
      error: err.message,
      tempHtmlPath: currentBuild.tempHtmlPath,
      isPuppeteerTimeout
    }
  }
})

// ビルドキャンセル
ipcMain.handle('build:cancel', async () => {
  currentBuild.cancelled = true
  if (currentBuild.pandocProcess) {
    currentBuild.pandocProcess.kill()
    currentBuild.pandocProcess = null
  }
  if (currentBuild.puppeteerBrowser) {
    await currentBuild.puppeteerBrowser.close().catch(() => {})
    currentBuild.puppeteerBrowser = null
  }
})

// ファイルを開く
ipcMain.handle('file:open', async (_, filePath) => {
  await shell.openPath(filePath)
})

// ファイル存在チェック
ipcMain.handle('file:exists', async (_, filePath) => {
  return fs.existsSync(filePath)
})

// 書き込み権限チェック
ipcMain.handle('file:check-write', async (_, folderPath) => {
  return builder.checkWritePermission(folderPath)
})

// YAMLファイル保存
ipcMain.handle('yaml:save', async (_, { folderPath, filename, content }) => {
  try {
    const filePath = path.join(folderPath, filename || 'settings.yaml')
    fs.writeFileSync(filePath, content, 'utf8')
    return { success: true, filePath }
  } catch (e) {
    return { success: false, error: e.message }
  }
})

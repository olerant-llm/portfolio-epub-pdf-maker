'use strict'

// ────────────────────────────────
// デザインプリセット定義（プレビュー用 inline style）
// ────────────────────────────────
const BLOCKQUOTE_PREVIEW = {
  leftbar: 'margin:0; padding:1em 1.5em; border-left:6px solid #4a90e2; background:#f5f9ff; border-radius:4px;',
  card:    'margin:0; padding:1em 1.5em; border:1px solid #ddd; border-radius:8px; box-shadow:0 2px 4px rgba(0,0,0,.08); background:#fafafa;',
  note:    'margin:0; padding:1em 1.5em; border-left:6px solid #f0a500; background:#fffbe6; border-radius:4px;',
  minimal: 'margin:0 0 0 0.5em; padding:0.5em 1.2em; border-left:3px solid #bbb; background:none;',
  plain:   'margin:0; padding:0 2em; border:none; background:none; font-style:italic; color:#666;'
}

const H1_PREVIEW = {
  plain:     'font-size:1.2em; font-weight:bold; padding:6px 0;',
  underline: 'font-size:1.2em; font-weight:bold; padding:6px 0; border-bottom:3px solid #333; display:inline-block;',
  leftbar:   'font-size:1.2em; font-weight:bold; padding:6px 0 6px 12px; border-left:6px solid #4a90e2;',
  box:       'font-size:1.2em; font-weight:bold; padding:6px 12px; border:2px solid #333; display:inline-block;'
}

const H2_PREVIEW = {
  underline: 'font-size:1.15em; font-weight:bold; padding:4px 0; border-bottom:1px solid #ccc;',
  leftbar:   'font-size:1.15em; font-weight:bold; padding:4px 0 4px 12px; border-left:5px solid #4a90e2;',
  badge:     'font-size:1.15em; font-weight:bold; padding:4px 12px; background:#4a90e2; color:#fff; border-radius:4px; display:inline-block;',
  double:    'font-size:1.15em; font-weight:bold; padding:4px 0; border-bottom:3px double #555;',
  none:      'font-size:1.15em; font-weight:bold; padding:4px 0;'
}

const H3_PREVIEW = {
  plain:     'font-size:1.0em; font-weight:bold; padding:4px 0;',
  dot:       'font-size:1.0em; font-weight:bold; padding:4px 0;',
  underline: 'font-size:1.0em; font-weight:bold; padding:4px 0; border-bottom:1px solid #aaa;',
  leftbar:   'font-size:1.0em; font-weight:bold; padding:4px 0 4px 10px; border-left:3px solid #aaa;'
}

// ────────────────────────────────
// 状態
// ────────────────────────────────
let cssSettings = null

// ────────────────────────────────
// 警告ルール
// ────────────────────────────────
const WARN_RULES = {
  'body.font-size': [
    { check: v => v < 10, msg: '※小さすぎます' },
    { check: v => v > 22, msg: '※大きすぎます' }
  ],
  'body.line-height': [
    { check: v => v < 1.2, msg: '※行間が狭すぎます' },
    { check: v => v > 3.0, msg: '※行間が大きすぎます' }
  ],
  'p.text-indent': [
    { check: v => v > 3, msg: '※大きすぎます' }
  ],
  'h1.font-size': [{ check: v => v > 3, msg: '※大きすぎます' }],
  'h2.font-size': [{ check: v => v > 3, msg: '※大きすぎます' }],
  'h3.font-size': [{ check: v => v > 3, msg: '※大きすぎます' }],
  'h1.margin-top': [{ check: v => v > 6, msg: '※余白が大きすぎます' }],
  'h2.margin-top': [{ check: v => v > 6, msg: '※余白が大きすぎます' }],
  'h3.margin-top': [{ check: v => v > 6, msg: '※余白が大きすぎます' }]
}

function getWarn(key, value) {
  const rules = WARN_RULES[key]
  if (!rules) return ''
  const v = parseFloat(value)
  if (isNaN(v)) return ''
  for (const r of rules) {
    if (r.check(v)) return r.msg
  }
  return ''
}

function setWarn(id, value) {
  const el = document.getElementById(id)
  if (el) el.textContent = value
}

// ────────────────────────────────
// タブ切り替え
// ────────────────────────────────
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'))
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
      btn.classList.add('active')
      const panelId = `tab-${btn.dataset.tab}`
      const panel = document.getElementById(panelId)
      if (panel) panel.classList.add('active')
    })
  })
}

// ────────────────────────────────
// UIに設定値を反映
// ────────────────────────────────
function populateUI(s) {
  if (!s) return

  // 本文タブ
  setVal('s-body-font-family', s.body?.['font-family'] || '')
  setVal('s-body-font-size', parseFloat(s.body?.['font-size']) || 16)
  setVal('s-body-line-height', parseFloat(s.body?.['line-height']) || 1.7)
  const align = s.body?.['text-align'] || 'justify'
  const radioEl = document.querySelector(`input[name="s-text-align"][value="${align}"]`)
  if (radioEl) radioEl.checked = true

  setVal('s-p-text-indent', parseFloat(s.p?.['text-indent']) || 0)
  setVal('s-p-margin-bottom', parseFloat(s.p?.['margin-bottom']) || 1.0)

  // h1
  setVal('s-h1-font-size', parseFloat(s.h1?.['font-size']) || 1.2)
  setCheck('s-h1-bold', s.h1?.['font-weight'] === 'bold')
  setVal('s-h1-margin-top', parseFloat(s.h1?.['margin-top']) || 1.0)
  setVal('s-h1-margin-bottom', parseFloat(s.h1?.['margin-bottom']) || 2.5)
  const h1Border = !!s.h1?.['border-bottom'] && s.h1?.['border-bottom'] !== false
  setCheck('s-h1-border-bottom', h1Border)
  toggleBorderColor('h1', h1Border)
  if (h1Border && typeof s.h1?.['border-bottom'] === 'string') {
    const color = extractColor(s.h1['border-bottom'])
    if (color) setVal('s-h1-border-color', color)
  }
  setCheck('s-h1-page-break', s.h1?.['page-break-before'] === true || s.h1?.['page-break-before'] === 'always')

  // h2
  setVal('s-h2-font-size', parseFloat(s.h2?.['font-size']) || 1.15)
  setCheck('s-h2-bold', s.h2?.['font-weight'] === 'bold')
  setVal('s-h2-margin-top', parseFloat(s.h2?.['margin-top']) || 3.0)
  setVal('s-h2-margin-bottom', parseFloat(s.h2?.['margin-bottom']) || 0.5)
  const h2Border = !!s.h2?.['border-bottom'] && s.h2?.['border-bottom'] !== false
  setCheck('s-h2-border-bottom', h2Border)
  toggleBorderColor('h2', h2Border)
  if (h2Border && typeof s.h2?.['border-bottom'] === 'string') {
    const color = extractColor(s.h2['border-bottom'])
    if (color) setVal('s-h2-border-color', color)
  }
  setCheck('s-h2-page-break', s.h2?.['page-break-before'] === true || s.h2?.['page-break-before'] === 'always')

  // h3
  setVal('s-h3-font-size', parseFloat(s.h3?.['font-size']) || 1.0)
  setCheck('s-h3-bold', s.h3?.['font-weight'] === 'bold')
  setVal('s-h3-margin-top', parseFloat(s.h3?.['margin-top']) || 2.5)
  setVal('s-h3-margin-bottom', parseFloat(s.h3?.['margin-bottom']) || 0.3)
  const h3Border = !!s.h3?.['border-bottom'] && s.h3?.['border-bottom'] !== false
  setCheck('s-h3-border-bottom', h3Border)
  toggleBorderColor('h3', h3Border)
  setCheck('s-h3-page-break', s.h3?.['page-break-before'] === true || s.h3?.['page-break-before'] === 'always')

  // デザインプリセット
  const bqPreset = s.blockquote_preset || 'leftbar'
  setVal('s-blockquote-preset', bqPreset)
  updatePreview('blockquote', bqPreset)

  const h1Preset = s.h1_preset || 'plain'
  setVal('s-h1-preset', h1Preset)
  updatePreview('h1', h1Preset)

  const h2Preset = s.h2_preset || 'underline'
  setVal('s-h2-preset', h2Preset)
  updatePreview('h2', h2Preset)

  const h3Preset = s.h3_preset || 'plain'
  setVal('s-h3-preset', h3Preset)
  updatePreview('h3', h3Preset)

  // カスタムCSS
  const editor = document.getElementById('custom-css-editor')
  if (editor) editor.value = s.custom_css || ''

  updateAllWarnings()
}

function setVal(id, val) {
  const el = document.getElementById(id)
  if (!el) return
  if (el.tagName === 'SELECT') {
    for (const opt of el.options) {
      if (opt.value === String(val)) { el.value = String(val); return }
    }
  } else {
    el.value = val
  }
}

function setCheck(id, checked) {
  const el = document.getElementById(id)
  if (el) el.checked = !!checked
}

function toggleBorderColor(tag, show) {
  const row = document.getElementById(`row-${tag}-border-color`)
  if (row) row.style.display = show ? '' : 'none'
}

// ────────────────────────────────
// プリセットプレビュー更新
// ────────────────────────────────
function updatePreview(target, presetKey) {
  const previewMap = { blockquote: BLOCKQUOTE_PREVIEW, h1: H1_PREVIEW, h2: H2_PREVIEW, h3: H3_PREVIEW }
  const innerId = `preview-${target}-inner`
  const el = document.getElementById(innerId)
  if (!el) return
  const styles = previewMap[target]
  if (!styles) return
  const style = styles[presetKey] || styles[Object.keys(styles)[0]]

  if (target === 'h3' && presetKey === 'dot') {
    el.style.cssText = H3_PREVIEW.dot
    el.textContent = '● 見出し3（h3）のサンプルテキスト'
  } else {
    el.style.cssText = style
    if (target !== 'blockquote') {
      const labels = { h1: '見出し1（h1）のサンプルテキスト', h2: '見出し2（h2）のサンプルテキスト', h3: '見出し3（h3）のサンプルテキスト' }
      el.textContent = labels[target] || el.textContent
    }
  }
}

function extractColor(borderValue) {
  // "1px solid #ccc" → "#ccc"
  const match = borderValue.match(/#[0-9a-fA-F]{3,6}/)
  return match ? match[0] : null
}

// ────────────────────────────────
// UIから設定値を収集
// ────────────────────────────────
function collectFromUI() {
  const s = cssSettings ? JSON.parse(JSON.stringify(cssSettings)) : {}

  // 本文
  if (!s.body) s.body = {}
  s.body['font-family'] = getVal('s-body-font-family')
  s.body['font-size'] = `${getVal('s-body-font-size')}px`
  s.body['line-height'] = parseFloat(getVal('s-body-line-height'))
  s.body['text-align'] = document.querySelector('input[name="s-text-align"]:checked')?.value || 'justify'

  if (!s.p) s.p = {}
  s.p['text-indent'] = `${getVal('s-p-text-indent')}em`
  s.p['margin-bottom'] = `${getVal('s-p-margin-bottom')}em`

  // h1
  if (!s.h1) s.h1 = {}
  s.h1['font-size'] = `${getVal('s-h1-font-size')}em`
  s.h1['font-weight'] = getCheck('s-h1-bold') ? 'bold' : 'normal'
  s.h1['margin-top'] = `${getVal('s-h1-margin-top')}em`
  s.h1['margin-bottom'] = `${getVal('s-h1-margin-bottom')}em`
  s.h1['border-bottom'] = getCheck('s-h1-border-bottom') ? `1px solid ${getVal('s-h1-border-color')}` : false
  s.h1['page-break-before'] = getCheck('s-h1-page-break')

  // h2
  if (!s.h2) s.h2 = {}
  s.h2['font-size'] = `${getVal('s-h2-font-size')}em`
  s.h2['font-weight'] = getCheck('s-h2-bold') ? 'bold' : 'normal'
  s.h2['margin-top'] = `${getVal('s-h2-margin-top')}em`
  s.h2['margin-bottom'] = `${getVal('s-h2-margin-bottom')}em`
  s.h2['border-bottom'] = getCheck('s-h2-border-bottom') ? `1px solid ${getVal('s-h2-border-color')}` : false
  s.h2['page-break-before'] = getCheck('s-h2-page-break')

  // h3
  if (!s.h3) s.h3 = {}
  s.h3['font-size'] = `${getVal('s-h3-font-size')}em`
  s.h3['font-weight'] = getCheck('s-h3-bold') ? 'bold' : 'normal'
  s.h3['margin-top'] = `${getVal('s-h3-margin-top')}em`
  s.h3['margin-bottom'] = `${getVal('s-h3-margin-bottom')}em`
  s.h3['border-bottom'] = getCheck('s-h3-border-bottom') ? `1px solid ${getVal('s-h3-border-color')}` : false
  s.h3['page-break-before'] = getCheck('s-h3-page-break')

  // デザインプリセット
  s.blockquote_preset = getVal('s-blockquote-preset') || 'leftbar'
  s.h1_preset = getVal('s-h1-preset') || 'plain'
  s.h2_preset = getVal('s-h2-preset') || 'underline'
  s.h3_preset = getVal('s-h3-preset') || 'plain'

  // カスタムCSS
  s.custom_css = document.getElementById('custom-css-editor')?.value || ''

  return s
}

function getVal(id) {
  const el = document.getElementById(id)
  return el ? el.value : ''
}

function getCheck(id) {
  const el = document.getElementById(id)
  return el ? el.checked : false
}

// ────────────────────────────────
// 警告更新
// ────────────────────────────────
function updateAllWarnings() {
  setWarn('s-warn-body-font-size', getWarn('body.font-size', getVal('s-body-font-size')))
  setWarn('s-warn-body-line-height', getWarn('body.line-height', getVal('s-body-line-height')))
  setWarn('s-warn-p-text-indent', getWarn('p.text-indent', getVal('s-p-text-indent')))
  setWarn('s-warn-h1-font-size', getWarn('h1.font-size', getVal('s-h1-font-size')))
  setWarn('s-warn-h1-margin-top', getWarn('h1.margin-top', getVal('s-h1-margin-top')))
  setWarn('s-warn-h2-font-size', getWarn('h2.font-size', getVal('s-h2-font-size')))
  setWarn('s-warn-h2-margin-top', getWarn('h2.margin-top', getVal('s-h2-margin-top')))
  setWarn('s-warn-h3-font-size', getWarn('h3.font-size', getVal('s-h3-font-size')))
  setWarn('s-warn-h3-margin-top', getWarn('h3.margin-top', getVal('s-h3-margin-top')))
}

// ────────────────────────────────
// イベント登録
// ────────────────────────────────
function registerEvents() {
  // 数値入力で警告更新
  const warnTargets = [
    's-body-font-size', 's-body-line-height', 's-p-text-indent',
    's-h1-font-size', 's-h1-margin-top',
    's-h2-font-size', 's-h2-margin-top',
    's-h3-font-size', 's-h3-margin-top'
  ]
  warnTargets.forEach(id => {
    const el = document.getElementById(id)
    if (el) el.addEventListener('input', updateAllWarnings)
  })

  // デザインプリセット セレクト変更でプレビュー更新
  for (const target of ['blockquote', 'h1', 'h2', 'h3']) {
    const sel = document.getElementById(`s-${target}-preset`)
    if (sel) sel.addEventListener('change', () => updatePreview(target, sel.value))
  }

  // border-bottom トグル（h1/h2/h3 の下線チェックボックス — プリセットに置き換えたが念のため残す）
  for (const tag of ['h1', 'h2', 'h3']) {
    const cb = document.getElementById(`s-${tag}-border-bottom`)
    if (cb) cb.addEventListener('change', () => toggleBorderColor(tag, cb.checked))
  }

  // カスタムCSSのリアルタイム検証
  const editor = document.getElementById('custom-css-editor')
  const errorEl = document.getElementById('custom-css-error')
  if (editor && errorEl) {
    editor.addEventListener('input', async () => {
      const result = await window.electronAPI.validateCSS(editor.value)
      errorEl.textContent = result.valid ? '' : (result.errors[0]?.message || '')
    })
  }

  // デフォルトにリセット
  document.getElementById('btn-settings-reset').addEventListener('click', async () => {
    const defaultTmpl = await window.electronAPI.loadTemplate('実用書・教材')
    if (defaultTmpl) {
      cssSettings = defaultTmpl
      populateUI(defaultTmpl)
    }
  })

  // メイン画面に戻る（適用なし）
  document.getElementById('btn-settings-back').addEventListener('click', () => {
    const storedProject = sessionStorage.getItem('projectPath')
    // cssSettingsを保存せずに戻る（元の設定を保持）
    window.location.href = 'index.html'
  })

  // 適用して戻る
  document.getElementById('btn-settings-apply').addEventListener('click', async () => {
    // カスタムCSSバリデーション
    const customCss = document.getElementById('custom-css-editor')?.value || ''
    if (customCss.trim()) {
      const result = await window.electronAPI.validateCSS(customCss)
      if (!result.valid) {
        document.getElementById('custom-css-error').textContent = result.errors[0]?.message || 'CSS構文エラー'
        // カスタムCSSタブにフォーカス
        document.querySelector('[data-tab="custom"]')?.click()
        return
      }
    }

    const updated = collectFromUI()
    sessionStorage.setItem('cssSettings', JSON.stringify(updated))
    sessionStorage.setItem('settingsApplied', 'true')
    window.location.href = 'index.html'
  })
}

// ────────────────────────────────
// 初期化
// ────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initTabs()
  registerEvents()

  // sessionStorageからCSS設定を復元
  const stored = sessionStorage.getItem('cssSettings')
  if (stored) {
    try {
      cssSettings = JSON.parse(stored)
    } catch (_) {}
  }

  if (!cssSettings) {
    cssSettings = await window.electronAPI.loadSettings()
  }

  if (cssSettings) {
    populateUI(cssSettings)
  }
})

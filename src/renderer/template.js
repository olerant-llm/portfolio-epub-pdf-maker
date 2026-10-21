'use strict'

let allTemplates = []
let selectedTemplate = null
let currentCssSettings = null
let currentCssFileName = 'style.css'

function loadCurrentSettings() {
  const stored = sessionStorage.getItem('cssSettings')
  if (stored) {
    try { currentCssSettings = JSON.parse(stored) } catch (_) {}
  }
  const cssFile = sessionStorage.getItem('cssFileName')
  if (cssFile) currentCssFileName = cssFile
}

// テンプレートのCSS設定から #template-preview-content にスコープしたCSSを生成
function compileCSSForPreview(tmpl) {
  const ns = '#template-preview-content'
  const css = []

  if (tmpl.body) {
    const b = tmpl.body
    const rules = []
    if (b['font-family']) rules.push(`font-family: ${b['font-family']}`)
    if (b['font-size']) rules.push(`font-size: ${b['font-size']}`)
    if (b['line-height'] !== undefined) rules.push(`line-height: ${b['line-height']}`)
    if (b['text-align']) rules.push(`text-align: ${b['text-align']}`)
    if (rules.length) css.push(`${ns} { ${rules.join('; ')} }`)
  }

  if (tmpl.p) {
    const p = tmpl.p
    const rules = []
    if (p['text-indent']) rules.push(`text-indent: ${p['text-indent']}`)
    if (p['margin-bottom']) rules.push(`margin-bottom: ${p['margin-bottom']}`)
    if (rules.length) css.push(`${ns} p { ${rules.join('; ')} }`)
  }

  for (const tag of ['h1', 'h2', 'h3']) {
    if (!tmpl[tag]) continue
    const h = tmpl[tag]
    const rules = []
    if (h['font-size']) rules.push(`font-size: ${h['font-size']}`)
    if (h['font-weight']) rules.push(`font-weight: ${h['font-weight']}`)
    if (h['margin-top'] !== undefined) rules.push(`margin-top: ${h['margin-top']}`)
    if (h['margin-bottom'] !== undefined) rules.push(`margin-bottom: ${h['margin-bottom']}`)
    if (h['border-bottom']) rules.push(`border-bottom: ${h['border-bottom']}`)
    if (h['color']) rules.push(`color: ${h['color']}`)
    if (rules.length) css.push(`${ns} ${tag} { ${rules.join('; ')} }`)
  }

  return css.join('\n')
}

function getTemplateSummary(tmpl) {
  const font = tmpl.body?.['font-family'] || ''
  const fontShort = font.includes('Serif') ? 'Serif系'
    : (font.includes('sans') || font.includes('Gothic') || font.includes('Meiryo')) ? 'Gothic系'
    : font || '—'
  const lh = tmpl.body?.['line-height'] ?? '—'
  const indent = tmpl.p?.['text-indent'] || '—'
  return `${fontShort} / 行間 ${lh} / 字下げ ${indent}`
}

function renderTemplateList(templates) {
  const list = document.getElementById('template-list')
  list.innerHTML = ''

  for (const tmpl of templates) {
    const item = document.createElement('div')
    item.className = 'template-list-item'
    item.dataset.name = tmpl.template_name

    const badgeClass = tmpl.builtin ? 'template-badge' : 'template-badge user'
    const badgeText = tmpl.builtin ? '組み込み' : 'ユーザー'

    item.innerHTML = `
      <div class="template-item-name">
        ${escapeHtml(tmpl.template_name)}
        <span class="${badgeClass}">${badgeText}</span>
      </div>
      <div class="template-item-meta">${escapeHtml(getTemplateSummary(tmpl))}</div>
    `

    item.addEventListener('click', (e) => {
      if (e.target.classList.contains('del-btn')) return
      selectTemplate(tmpl)
    })

    if (!tmpl.builtin) {
      const delBtn = document.createElement('button')
      delBtn.textContent = '削除'
      delBtn.className = 'danger del-btn'
      delBtn.style.cssText = 'font-size: 11px; padding: 2px 6px; margin-top: 6px; display: block;'
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation()
        if (confirm(`「${tmpl.template_name}」を削除しますか？`)) {
          await window.electronAPI.deleteTemplate(tmpl.template_name)
          allTemplates = await window.electronAPI.listTemplates()
          renderTemplateList(allTemplates)
        }
      })
      item.appendChild(delBtn)
    }

    list.appendChild(item)
  }
}

function selectTemplate(tmpl) {
  selectedTemplate = tmpl

  // ハイライト更新
  document.querySelectorAll('.template-list-item').forEach(el => el.classList.remove('selected'))
  const item = document.querySelector(`.template-list-item[data-name="${CSS.escape(tmpl.template_name)}"]`)
  if (item) item.classList.add('selected')

  // プレビュー表示
  document.getElementById('template-preview-placeholder').style.display = 'none'
  document.getElementById('template-preview-content').style.display = ''

  // CSSをスコープして適用
  const css = compileCSSForPreview(tmpl)
  document.getElementById('template-preview-style').textContent = css

  document.getElementById('btn-apply-template').disabled = false
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function registerEvents() {
  document.getElementById('btn-save-template').addEventListener('click', async () => {
    const name = document.getElementById('new-template-name').value.trim()
    if (!name) { alert('テンプレート名を入力してください'); return }
    const settingsToSave = currentCssSettings || selectedTemplate
    if (!settingsToSave) { alert('保存する設定がありません'); return }
    await window.electronAPI.saveTemplate(name, settingsToSave)
    document.getElementById('save-template-msg').textContent = `✓ 「${name}」として保存しました`
    document.getElementById('new-template-name').value = ''
    allTemplates = await window.electronAPI.listTemplates()
    renderTemplateList(allTemplates)
    setTimeout(() => { document.getElementById('save-template-msg').textContent = '' }, 3000)
  })

  document.getElementById('btn-apply-template').addEventListener('click', () => {
    if (!selectedTemplate) return
    sessionStorage.setItem('cssSettings', JSON.stringify(selectedTemplate))
    sessionStorage.setItem('settingsApplied', 'true')
    window.location.href = 'index.html'
  })

  document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = 'index.html'
  })
}

document.addEventListener('DOMContentLoaded', async () => {
  loadCurrentSettings()

  const saveTitle = document.getElementById('template-save-title')
  if (saveTitle) saveTitle.textContent = `現在の「${currentCssFileName}」をテンプレートとして保存`

  allTemplates = await window.electronAPI.listTemplates()
  renderTemplateList(allTemplates)
  registerEvents()
})

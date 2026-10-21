'use strict'

const jsYaml = require('js-yaml')
const path = require('path')

/**
 * CSS設定のPDF崩れ警告チェック
 * @param {Object} settings - CSSSettings JSON
 * @returns {Array<{property: string, message: string, severity: string}>}
 */
function checkPDFWarnings(settings) {
  const warnings = []

  // body font-size
  const fontSize = parseFloat(settings.body?.['font-size'])
  if (!isNaN(fontSize)) {
    if (fontSize < 10)
      warnings.push({ property: 'body.font-size', message: '※文字が小さすぎます。PDF/EPUBで読みにくくなる可能性があります', severity: 'warn' })
    if (fontSize > 22)
      warnings.push({ property: 'body.font-size', message: '※フォントサイズが大きすぎます。PDF化時に大きく形が崩れる可能性があります', severity: 'warn' })
  }

  // body line-height
  const lineHeight = parseFloat(settings.body?.['line-height'])
  if (!isNaN(lineHeight)) {
    if (lineHeight < 1.2)
      warnings.push({ property: 'body.line-height', message: '※行間が狭すぎます。文字が重なる可能性があります', severity: 'warn' })
    if (lineHeight > 3.0)
      warnings.push({ property: 'body.line-height', message: '※行間が大きすぎます。PDF化時に大きく形が崩れる可能性があります', severity: 'warn' })
  }

  // h1〜h3 font-size, margin-top
  for (const tag of ['h1', 'h2', 'h3']) {
    const hFontSize = parseFloat(settings[tag]?.['font-size'])
    if (!isNaN(hFontSize) && hFontSize > 3)
      warnings.push({ property: `${tag}.font-size`, message: `※見出しサイズが大きすぎます。PDF化時に大きく形が崩れる可能性があります`, severity: 'warn' })

    const marginTop = parseFloat(settings[tag]?.['margin-top'])
    if (!isNaN(marginTop) && marginTop > 6)
      warnings.push({ property: `${tag}.margin-top`, message: `※上余白が大きすぎます。PDF化時に大きく形が崩れる可能性があります`, severity: 'warn' })
  }

  // p text-indent
  const textIndent = parseFloat(settings.p?.['text-indent'])
  if (!isNaN(textIndent) && textIndent > 3)
    warnings.push({ property: 'p.text-indent', message: '※字下げが大きすぎます。PDF化時に大きく形が崩れる可能性があります', severity: 'warn' })

  return warnings
}

/**
 * カスタムCSSの警告チェック（固定幅・大きい余白）
 * @param {string} customCss
 * @returns {Array<{property: string, message: string, severity: string}>}
 */
function checkCustomCSSWarnings(customCss) {
  const warnings = []
  if (!customCss || !customCss.trim()) return warnings

  // 固定pxのwidth
  if (/width\s*:\s*\d+px/.test(customCss))
    warnings.push({ property: 'width', message: '※固定幅はPDF出力時に内容が切れる場合があります', severity: 'warn' })

  // margin/padding > 60px
  const marginPattern = /(?:margin|padding)[^:]*:\s*(\d+)px/g
  let match
  while ((match = marginPattern.exec(customCss)) !== null) {
    if (parseInt(match[1]) > 60) {
      warnings.push({ property: 'margin/padding', message: '※余白が大きすぎます。PDF化時に大きく形が崩れる可能性があります', severity: 'warn' })
      break
    }
  }

  return warnings
}

/**
 * settings.yaml のバリデーション
 * @param {string} yamlContent - YAMLテキスト
 * @param {string} folderPath - プロジェクトフォルダパス
 * @returns {{ valid: boolean, error: string|null, settings: Object, warnings: string[] }}
 */
function validateYaml(yamlContent, folderPath) {
  const folderName = path.basename(folderPath)
  let parsed = null

  try {
    parsed = jsYaml.load(yamlContent)
  } catch (e) {
    const lineNum = e.mark ? e.mark.line + 1 : '?'
    return {
      valid: false,
      error: `settings.yaml の構文エラー（${lineNum}行目付近）`,
      settings: { title: folderName, language: 'ja-JP', toc_depth: 2, page_direction: 'ltr' },
      warnings: [`⚠ settings.yaml の構文エラー（${lineNum}行目付近）。タイトルはフォルダ名で代替します。`]
    }
  }

  if (!parsed || typeof parsed !== 'object') {
    parsed = {}
  }

  const warnings = []

  if (!parsed.title) {
    warnings.push(`⚠ settings.yaml に title が設定されていません。フォルダ名（${folderName}）で代替します。`)
    parsed.title = folderName
  }

  if (parsed.language && !/^[a-z]{2,3}(-[A-Z]{2,4})?$/.test(parsed.language)) {
    warnings.push(`⚠ language の値 "${parsed.language}" が不正です。IETF言語タグ形式（例: ja-JP）で指定してください。`)
  }

  // デフォルト値の補完
  if (!parsed.language) parsed.language = 'ja-JP'
  if (typeof parsed.toc_depth !== 'number') parsed.toc_depth = 2
  if (!parsed.page_direction) parsed.page_direction = 'ltr'

  return { valid: true, error: null, settings: parsed, warnings }
}

/**
 * カスタムCSS構文チェック（postcss使用）
 * @param {string} customCss
 * @returns {Promise<{ valid: boolean, errors: Array<{line: number, message: string}> }>}
 */
async function validateCustomCSS(customCss) {
  if (!customCss || !customCss.trim()) return { valid: true, errors: [] }

  try {
    const postcss = require('postcss')
    postcss.parse(customCss)
    return { valid: true, errors: [] }
  } catch (e) {
    return {
      valid: false,
      errors: [{
        line: e.line || 0,
        message: `⚠ カスタムCSS ${e.line || '?'}行目に構文エラーがあります。修正してから生成してください。`
      }]
    }
  }
}

module.exports = {
  checkPDFWarnings,
  checkCustomCSSWarnings,
  validateYaml,
  validateCustomCSS
}

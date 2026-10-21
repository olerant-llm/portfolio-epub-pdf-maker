'use strict'

const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  // ダイアログ
  openFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  openImage: () => ipcRenderer.invoke('dialog:openImage'),
  openImages: () => ipcRenderer.invoke('dialog:openImages'),
  saveFile: (opts) => ipcRenderer.invoke('dialog:saveFile', opts),

  // プロジェクト読み込み
  loadProject: (folderPath) => ipcRenderer.invoke('project:load', folderPath),

  // CSS設定の永続化
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings) => ipcRenderer.invoke('settings:save', settings),

  // テンプレート
  listTemplates: () => ipcRenderer.invoke('templates:list'),
  loadTemplate: (name) => ipcRenderer.invoke('template:load', name),
  saveTemplate: (name, settings) => ipcRenderer.invoke('template:save', { name, settings }),
  deleteTemplate: (name) => ipcRenderer.invoke('template:delete', name),

  // CSS操作
  compileCSS: (settings) => ipcRenderer.invoke('css:compile', settings),
  validateCSS: (customCss) => ipcRenderer.invoke('css:validate', customCss),
  saveCSSFile: (folderPath, settings) => ipcRenderer.invoke('css:save-file', { folderPath, settings }),

  // バリデーション
  checkPDFWarnings: (settings) => ipcRenderer.invoke('validate:pdf-warnings', settings),

  // ビルド操作
  startBuild: (opts) => ipcRenderer.invoke('build:start', opts),
  cancelBuild: () => ipcRenderer.invoke('build:cancel'),

  // ファイル操作
  openFile: (filePath) => ipcRenderer.invoke('file:open', filePath),
  checkFileExists: (filePath) => ipcRenderer.invoke('file:exists', filePath),
  checkWritePermission: (folderPath) => ipcRenderer.invoke('file:check-write', folderPath),
  saveYaml: (folderPath, filename, content) => ipcRenderer.invoke('yaml:save', { folderPath, filename, content }),
  saveMetadata: (folderPath, filename, fields) => ipcRenderer.invoke('metadata:save', { folderPath, filename, fields }),

  // イベント受信（main→renderer）
  onBuildProgress: (callback) => {
    ipcRenderer.on('build:progress', (_, data) => callback(data))
  },
  onBuildLog: (callback) => {
    ipcRenderer.on('build:log', (_, data) => callback(data))
  },

  // リスナー解除
  removeAllListeners: (channel) => {
    ipcRenderer.removeAllListeners(channel)
  }
})

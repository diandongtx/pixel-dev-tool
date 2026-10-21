import { useState } from 'react'
import './App.css'
import { ImageProcessor } from './components/ImageProcessor'
import { BeadLevelPage } from './components/BeadLevelPage'
import { BeadDebugPage } from './components/BeadDebugPage'
import { LevelProductionWorkbench } from './components/LevelProductionWorkbench'
import { PixelConfigPage } from './components/PixelConfigPage'
import { LevelConfigPage } from './components/LevelConfigPage'
import { LevelBeadRegionPage } from './components/LevelBeadRegionPage'
import { ThemeConfigPage } from './components/ThemeConfigPage'
import type { GridData } from './types/grid'
import type { PixelConfigItem } from './types/pixelConfig'

function App() {
  const [gridSize, setGridSize] = useState(10)
  const [colorTolerance, setColorTolerance] = useState(8)
  const [gridRefreshVersion, setGridRefreshVersion] = useState(0)
  const [gridSizeSuggestion, setGridSizeSuggestion] = useState<{
    cellSize: number
    confidence: 'low' | 'medium'
  } | null>(null)
  const [activePage, setActivePage] = useState<
    'pixel' | 'bead' | 'bead-debug' | 'level-production' | 'pixel-config' | 'theme-config' | 'main-level' | 'daily-level' | 'bead-region'
  >('pixel')
  const [processedGridData, setProcessedGridData] = useState<GridData | null>(null)
  const [subjectGridData, setSubjectGridData] = useState<GridData | null>(null)
  const [useSubjectGridForLevel, setUseSubjectGridForLevel] = useState(true)
  const [pixelConfigs, setPixelConfigs] = useState<PixelConfigItem[]>([])
  const [loadedPixelConfigName, setLoadedPixelConfigName] = useState('pixelconfig.json')
  const beadGridData = useSubjectGridForLevel ? (subjectGridData ?? processedGridData) : processedGridData
  const showGridControls = activePage === 'pixel' || activePage === 'bead'

  return (
    <div className="App">
      <h1>Pixel Grid Analyzer</h1>
      <div className="page-switch">
        <button
          type="button"
          className={activePage === 'pixel' ? 'active' : ''}
          onClick={() => setActivePage('pixel')}
        >
          像素化页面
        </button>
        <button
          type="button"
          className={activePage === 'bead' ? 'active' : ''}
          onClick={() => setActivePage('bead')}
        >
          拼豆关卡
        </button>
        <button
          type="button"
          className={activePage === 'bead-debug' ? 'active' : ''}
          onClick={() => setActivePage('bead-debug')}
        >
          豆子调试
        </button>
        <button
          type="button"
          className={activePage === 'level-production' ? 'active' : ''}
          onClick={() => setActivePage('level-production')}
        >
          关卡工作台
        </button>
        <button
          type="button"
          className={activePage === 'pixel-config' ? 'active' : ''}
          onClick={() => setActivePage('pixel-config')}
        >
          像素图管理
        </button>
        <button
          type="button"
          className={activePage === 'theme-config' ? 'active' : ''}
          onClick={() => setActivePage('theme-config')}
        >
          主题管理
        </button>
        <button
          type="button"
          className={activePage === 'main-level' ? 'active' : ''}
          onClick={() => setActivePage('main-level')}
        >
          主线关卡管理
        </button>
        <button
          type="button"
          className={activePage === 'daily-level' ? 'active' : ''}
          onClick={() => setActivePage('daily-level')}
        >
          每日挑战管理
        </button>
        <button
          type="button"
          className={activePage === 'bead-region' ? 'active' : ''}
          onClick={() => setActivePage('bead-region')}
        >
          豆子区域统计
        </button>
      </div>
      {showGridControls && (
        <div className="grid-size-control">
          <label htmlFor="gridSize">Grid Size: </label>
          <input
            type="number"
            id="gridSize"
            value={gridSize}
            onChange={(e) => {
              setGridSize(Math.max(1, parseInt(e.target.value)))
              setGridSizeSuggestion(null)
            }}
            min="1"
          />
          {activePage === 'pixel' && gridSizeSuggestion ? (
            <span className="grid-size-suggestion" style={{ marginLeft: 8 }}>
              建议 Grid Size: {gridSizeSuggestion.cellSize}px（{gridSizeSuggestion.confidence === 'low' ? '低' : '中'}置信度）
            </span>
          ) : null}
          <label htmlFor="colorTolerance" style={{ marginLeft: 12 }}>Color Tolerance: </label>
          <input
            type="number"
            id="colorTolerance"
            value={colorTolerance}
            onChange={(e) => {
              const next = Number.isNaN(parseInt(e.target.value)) ? 0 : parseInt(e.target.value)
              setColorTolerance(Math.min(100, Math.max(0, next)))
            }}
            min="0"
            max="100"
          />
          {activePage === 'pixel' && (
            <button
              type="button"
              onClick={() => setGridRefreshVersion((version) => version + 1)}
            >
              更新网格和色差
            </button>
          )}
          {activePage === 'bead' && (
            <>
              <label htmlFor="useSubjectGrid" style={{ marginLeft: 12 }}>
                拼豆用主体网格
              </label>
              <input
                id="useSubjectGrid"
                type="checkbox"
                checked={useSubjectGridForLevel}
                onChange={(e) => setUseSubjectGridForLevel(e.target.checked)}
              />
            </>
          )}
        </div>
      )}
      {activePage === 'pixel' && (
        <ImageProcessor
          gridSize={gridSize}
          colorTolerance={colorTolerance}
          gridRefreshVersion={gridRefreshVersion}
          showGridSettingsButton={false}
          onAutoGridSizeDetected={(detectedGridSize) => {
            setGridSize(detectedGridSize)
            setGridSizeSuggestion(null)
          }}
          onGridSizeSuggestionChange={setGridSizeSuggestion}
          onGridDataChange={setProcessedGridData}
          onSubjectGridDataChange={setSubjectGridData}
        />
      )}
      {activePage === 'bead' && (
        <BeadLevelPage
          processedGridData={beadGridData}
          gridSize={gridSize}
        />
      )}
      {activePage === 'bead-debug' && (
        <div className="app-page-panel app-page-panel--debug">
          <BeadDebugPage />
        </div>
      )}
      {activePage === 'level-production' && (
        <div className="app-page-panel">
          <LevelProductionWorkbench />
        </div>
      )}
      {activePage === 'pixel-config' && (
        <PixelConfigPage
          previewGridSize={8}
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={setPixelConfigs}
          loadedConfigName={loadedPixelConfigName}
          onLoadedConfigNameChange={setLoadedPixelConfigName}
        />
      )}
      {activePage === 'theme-config' && (
        <ThemeConfigPage />
      )}
      {activePage === 'main-level' && (
        <LevelConfigPage
          levelType={1}
          pageTitle="主线关卡管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={setPixelConfigs}
          loadedPixelConfigName={loadedPixelConfigName}
          onLoadedPixelConfigNameChange={setLoadedPixelConfigName}
        />
      )}
      {activePage === 'daily-level' && (
        <LevelConfigPage
          levelType={2}
          pageTitle="每日挑战管理"
          pixelConfigs={pixelConfigs}
          onPixelConfigsChange={setPixelConfigs}
          loadedPixelConfigName={loadedPixelConfigName}
          onLoadedPixelConfigNameChange={setLoadedPixelConfigName}
        />
      )}
      {activePage === 'bead-region' && (
        <div className="app-page-panel">
          <LevelBeadRegionPage />
        </div>
      )}
    </div>
  )
}

export default App

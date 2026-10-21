import { t } from '../i18n'
import React, { useEffect, useRef, useState } from 'react'
import type { GridData } from '../types/grid'
import { buildPointFilename, deriveAssetBaseName, downloadTextFile } from '../utils/configIO'
import { buildGridOutputJson, cloneGridData } from '../utils/gridData'
import { drawGridToCanvas } from '../utils/gridCanvas'
import {
  generateSortedGridByTargetBlockCount,
  generateStructureAwareSortedGrid,
  generateRegionRecolorSortedGrid,
  rrAdaptiveFixedThreshold,
  type RegionRecolorSortResult,
  type SizeProfileName,
  type StructureAwareSortResult
} from '../utils/levelGridSorter'

type SortMode = 'regionRecolor' | 'structure' | 'legacy'

interface BeadLevelPageProps {
  processedGridData: GridData | null
  gridSize: number
}

export const BeadLevelPage: React.FC<BeadLevelPageProps> = ({ processedGridData, gridSize }) => {
  const [sortMode, setSortMode] = useState<SortMode>('regionRecolor')
  const [targetBlockCount, setTargetBlockCount] = useState(30)
  const [overflowConstraint, setOverflowConstraint] = useState(5)
  // 区域重染色参数（v2 默认模式）
  const [rrMinRegionSize, setRrMinRegionSize] = useState(4)
  const [rrMaxBlockSize, setRrMaxBlockSize] = useState(0)
  const [regionRecolorResult, setRegionRecolorResult] = useState<RegionRecolorSortResult | null>(null)
  // 结构感知参数
  const [sizeProfile, setSizeProfile] = useState<SizeProfileName>('standard')
  const [structureAffinity, setStructureAffinity] = useState(0.8)
  const [smallBlockQuota, setSmallBlockQuota] = useState(0.10)
  const [sortSeedInput, setSortSeedInput] = useState('')
  const [sortResult, setSortResult] = useState<StructureAwareSortResult | null>(null)
  const [sortedGridData, setSortedGridData] = useState<GridData | null>(null)
  const processedCanvasRef = useRef<HTMLCanvasElement>(null)
  const sortedCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    drawGridToCanvas(processedCanvasRef.current, processedGridData, gridSize)
  }, [processedGridData, gridSize])

  useEffect(() => {
    drawGridToCanvas(sortedCanvasRef.current, sortedGridData, gridSize)
  }, [sortedGridData, gridSize])

  useEffect(() => {
    if (!processedGridData) {
      setSortedGridData(null)
      setSortResult(null)
      return
    }
    setSortedGridData((previous) => {
      if (!previous) return null
      return {
        ...cloneGridData(previous),
        fileName: `${processedGridData.fileName}_sorted`
      }
    })
  }, [processedGridData])

  const handleGenerateSortedGrid = () => {
    if (!processedGridData) return
    if (sortMode === 'legacy') {
      const nextTargetBlockCount = Math.max(1, targetBlockCount)
      const generated = generateSortedGridByTargetBlockCount(processedGridData, nextTargetBlockCount, {
        overflowConstraint
      })
      setSortedGridData({
        ...generated,
        fileName: `${processedGridData.fileName}_sorted`
      })
      setSortResult(null)
      setRegionRecolorResult(null)
      return
    }
    const parsedSeed = Number.parseInt(sortSeedInput, 10)
    const seed = Number.isNaN(parsedSeed) ? undefined : parsedSeed
    if (sortMode === 'regionRecolor') {
      const result = generateRegionRecolorSortedGrid(processedGridData, {
        minRegionSize: rrMinRegionSize,
        maxBlockSize: rrMaxBlockSize,
        seed
      })
      setRegionRecolorResult(result)
      setSortResult(null)
      setSortedGridData({
        ...result.grid,
        fileName: `${processedGridData.fileName}_sorted`
      })
      return
    }
    const result = generateStructureAwareSortedGrid(processedGridData, {
      sizeProfile,
      structureAffinity,
      smallBlockQuota,
      seed
    })
    setSortResult(result)
    setRegionRecolorResult(null)
    setSortedGridData({
      ...result.grid,
      fileName: `${processedGridData.fileName}_sorted`
    })
  }

  const handleDownloadSortedGrid = () => {
    if (!sortedGridData) return
    const content = buildGridOutputJson(sortedGridData)
    downloadTextFile(content, buildPointFilename(deriveAssetBaseName(sortedGridData.fileName)))
  }

  return (
    <div className="bead-level-page">
      <div className="bead-level-controls">
        <div className="bead-level-mode">
          <label>
            <input
              type="radio"
              name="bead-level-sort-mode"
              value="regionRecolor"
              checked={sortMode === 'regionRecolor'}
              onChange={() => setSortMode('regionRecolor')}
            />{t("区域重染色（默认）")}</label>
          <label>
            <input
              type="radio"
              name="bead-level-sort-mode"
              value="structure"
              checked={sortMode === 'structure'}
              onChange={() => setSortMode('structure')}
            />{t("结构感知")}</label>
          <label>
            <input
              type="radio"
              name="bead-level-sort-mode"
              value="legacy"
              checked={sortMode === 'legacy'}
              onChange={() => setSortMode('legacy')}
            />{t("传统（legacy）")}</label>
        </div>

        {sortMode === 'regionRecolor' && (
          <>
            <label htmlFor="rrMinRegionSizeInput">{t("小区域并入阈值")}</label>
            <input
              id="rrMinRegionSizeInput"
              type="number"
              min={1}
              max={64}
              value={rrMinRegionSize}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(parsed)) {
                  setRrMinRegionSize(4)
                  return
                }
                setRrMinRegionSize(Math.min(64, Math.max(1, parsed)))
              }}
            />
            <label htmlFor="rrMaxBlockSizeInput">{t("单块上限（0=不限）")}</label>
            <input
              id="rrMaxBlockSizeInput"
              type="number"
              min={0}
              value={rrMaxBlockSize}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(parsed)) {
                  setRrMaxBlockSize(0)
                  return
                }
                setRrMaxBlockSize(Math.max(0, parsed))
              }}
            />
            <label htmlFor="sortSeedInput">{t("seed（留空=随机）")}</label>
            <input
              id="sortSeedInput"
              type="number"
              placeholder={t("随机")}
              value={sortSeedInput}
              onChange={(event) => setSortSeedInput(event.target.value)}
            />
          </>
        )}

        {sortMode === 'legacy' && (
          <>
            <label htmlFor="targetBlockCountInput">{t("目标色块数")}</label>
            <input
              id="targetBlockCountInput"
              type="number"
              min={1}
              value={targetBlockCount}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(parsed)) {
                  setTargetBlockCount(1)
                  return
                }
                setTargetBlockCount(Math.max(1, parsed))
              }}
            />
            <label htmlFor="overflowConstraintInput">{t("溢出约束")}</label>
            <input
              id="overflowConstraintInput"
              type="number"
              min={0}
              max={5}
              value={overflowConstraint}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10)
                if (Number.isNaN(parsed)) {
                  setOverflowConstraint(5)
                  return
                }
                setOverflowConstraint(Math.min(5, Math.max(0, parsed)))
              }}
            />
          </>
        )}

        {sortMode === 'structure' && (
          <>
            <label htmlFor="sizeProfileInput">{t("手感档位")}</label>
            <select
              id="sizeProfileInput"
              value={sizeProfile}
              onChange={(event) => setSizeProfile(event.target.value as SizeProfileName)}
            >
              <option value="loose">{t("松（大块爽感）")}</option>
              <option value="standard">{t("标准")}</option>
              <option value="tight">{t("紧（决策密度高）")}</option>
            </select>
            <label htmlFor="structureAffinityInput">{t("预期强度 α：")}{structureAffinity.toFixed(2)}</label>
            <input
              id="structureAffinityInput"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={structureAffinity}
              onChange={(event) => setStructureAffinity(Number.parseFloat(event.target.value))}
            />
            <label htmlFor="smallBlockQuotaInput">{t("小块配额")}</label>
            <input
              id="smallBlockQuotaInput"
              type="number"
              min={0}
              max={1}
              step={0.05}
              value={smallBlockQuota}
              onChange={(event) => {
                const parsed = Number.parseFloat(event.target.value)
                if (Number.isNaN(parsed)) {
                  setSmallBlockQuota(0.10)
                  return
                }
                setSmallBlockQuota(Math.min(1, Math.max(0, parsed)))
              }}
            />
            <label htmlFor="sortSeedInput">{t("seed（留空=随机）")}</label>
            <input
              id="sortSeedInput"
              type="number"
              placeholder={t("随机")}
              value={sortSeedInput}
              onChange={(event) => setSortSeedInput(event.target.value)}
            />
          </>
        )}

        <button type="button" onClick={handleGenerateSortedGrid} disabled={!processedGridData}>{t("生成排序")}</button>
        <button type="button" onClick={handleDownloadSortedGrid} disabled={!sortedGridData}>{t("下载排序后网格")}</button>
      </div>

      {sortMode === 'regionRecolor' && regionRecolorResult && (
        <div className="bead-level-metrics">
          <span className={regionRecolorResult.passed ? 'metric-pass' : 'metric-fail'}>
            {regionRecolorResult.passed ? t("✓ 全部达标") : t("△ 未达标（已返回最优一次）")}
          </span>
          <span>seed: {regionRecolorResult.usedSeed}</span>
          <span>{t("尝试:")}{' '}{regionRecolorResult.attempts}</span>
          <span>{t("策略:")}{' '}{regionRecolorResult.metrics.allocStrategy === 'matched' ? t("最小溢出匹配") : t("配额倾倒")}</span>
          <span>fixedFloor: {(regionRecolorResult.metrics.fixedFloor * 100).toFixed(0)}%</span>
          <span className={regionRecolorResult.metrics.contourPreservation >= 0.75 ? 'metric-pass' : 'metric-fail'}>{t("R1 轮廓保留")}{' '}{regionRecolorResult.metrics.contourPreservation.toFixed(2)}
          </span>
          <span className={regionRecolorResult.metrics.regionPurity >= 0.80 ? 'metric-pass' : 'metric-fail'}>{t("区域纯度")}{' '}{regionRecolorResult.metrics.regionPurity.toFixed(2)}
          </span>
          <span>{t("区域数")}{' '}{regionRecolorResult.metrics.regionCount}</span>
          <span className={regionRecolorResult.metrics.smallBlockRatio <= 0.10 ? 'metric-pass' : 'metric-fail'}>{t("R2 小块占比")}{' '}{(regionRecolorResult.metrics.smallBlockRatio * 100).toFixed(0)}%
          </span>
          <span className={regionRecolorResult.metrics.greedyTailRun <= 8 ? 'metric-pass' : 'metric-fail'}>{t("R3 尾串")}{' '}{regionRecolorResult.metrics.greedyTailRun}
          </span>
          <span className={regionRecolorResult.metrics.fixedCellRatio <= rrAdaptiveFixedThreshold(regionRecolorResult.metrics.fixedFloor) ? 'metric-pass' : 'metric-fail'}>{t("R4 落原位")}{' '}{(regionRecolorResult.metrics.fixedCellRatio * 100).toFixed(0)}%
          </span>
          <span>{t("拾取")}{' '}{regionRecolorResult.metrics.pickupCount}</span>
        </div>
      )}

      {sortMode === 'structure' && sortResult && (
        <div className="bead-level-metrics">
          <span className={sortResult.passed ? 'metric-pass' : 'metric-fail'}>
            {sortResult.passed ? t("✓ 全部达标") : t("△ 未达标（已返回最优一次）")}
          </span>
          <span>seed: {sortResult.usedSeed}</span>
          <span>{t("尝试:")}{' '}{sortResult.attempts}</span>
          <span className={sortResult.metrics.structureRetention >= 0.55 ? 'metric-pass' : 'metric-fail'}>{t("H1 结构保留")}{' '}{sortResult.metrics.structureRetention.toFixed(2)}
          </span>
          <span className={sortResult.metrics.smallBlockRatio <= 0.10 ? 'metric-pass' : 'metric-fail'}>{t("H2 小块占比")}{' '}{(sortResult.metrics.smallBlockRatio * 100).toFixed(0)}%
          </span>
          <span className={sortResult.metrics.greedyTailRun <= 8 ? 'metric-pass' : 'metric-fail'}>{t("H3 尾串")}{' '}{sortResult.metrics.greedyTailRun}
          </span>
          <span className={sortResult.metrics.fixedCellRatio <= 0.50 ? 'metric-pass' : 'metric-fail'}>{t("H4 白送进度")}{' '}{(sortResult.metrics.fixedCellRatio * 100).toFixed(0)}%
          </span>
          <span>{t("拾取")}{' '}{sortResult.metrics.pickupCount}</span>
        </div>
      )}

      {!processedGridData && (
        <div className="bead-level-empty">{t("请先在像素化页面生成或导入处理后网格数据")}</div>
      )}

      <div className="bead-level-canvases">
        <div className="bead-grid-panel">
          <h3>{t("处理后网格")}</h3>
          <canvas ref={processedCanvasRef} className="bead-grid-canvas" />
        </div>
        <div className="bead-grid-panel">
          <h3>{t("排序后网格")}</h3>
          <canvas ref={sortedCanvasRef} className="bead-grid-canvas" />
        </div>
      </div>
    </div>
  )
}

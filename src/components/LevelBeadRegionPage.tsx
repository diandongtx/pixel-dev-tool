import { t } from '../i18n'
import React, { useEffect, useMemo, useRef, useState } from 'react'
import type { ManagedLevelConfigItem as LevelConfigItem } from '../types/levelConfig'
import type { PixelConfigItem } from '../types/pixelConfig'
import {
  readLevelWorkspaceLevelConfig,
  readLevelWorkspacePixelConfig
} from '../utils/levelWorkspaceClient'
import {
  computeBeadRegionStats,
  histogramToSortedEntries,
  type BeadRegionStats
} from '../utils/levelBeadRegionStats'
import { drawPixelMatrixThumbnail } from '../utils/pixelMatrixThumbnail'

interface LevelBeadRegionPageProps {
  /** 由父级在初次进入页面时预加载，节省用户首点等待；可缺省。 */
  defaultLevelType?: number
}

interface LevelStatsRow {
  level: LevelConfigItem
  pixelConfig: PixelConfigItem | null
  stats: BeadRegionStats | null
  reason: string | null // stats 为 null 时的原因说明
}

const PAGE_SIZE_OPTIONS = [20, 50, 100] as const
const DEFAULT_PAGE_SIZE = 50
const THUMBNAIL_CELL_SIZE = 6

const LEVEL_TYPE_OPTIONS = [
  { value: 1, label: t("主线关卡 (type=1)") },
  { value: 2, label: t("每日挑战 (dailylevelconfig)") }
] as const

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : t("未知错误")

/**
 * 分页器（Paginator）：上一页/下一页 + 当前页码/总页数 + 跳页输入。
 * 列表顶部与底部复用同一组件。
 */
const Pager: React.FC<{
  pageIndex: number
  totalPages: number
  totalItems: number
  onPrev: () => void
  onNext: () => void
  onJump: (page: number) => void
}> = ({ pageIndex, totalPages, totalItems, onPrev, onNext, onJump }) => (
  <div className="bead-region-pager">
    <button type="button" onClick={onPrev} disabled={pageIndex <= 0}>{t("上一页")}</button>
    <span>{t("第")}{' '}{pageIndex + 1} / {totalPages}{' '}{t("页（共")}{' '}{totalItems}{' '}{t("关）")}</span>
    <button
      type="button"
      onClick={onNext}
      disabled={pageIndex >= totalPages - 1}
    >{t("下一页")}</button>
    <label className="bead-region-field">{t("跳转")}<input
        type="number"
        min={1}
        max={totalPages}
        value={pageIndex + 1}
        onChange={(e) => {
          const next = Number.parseInt(e.target.value, 10)
          if (Number.isFinite(next)) onJump(next - 1)
        }}
        style={{ width: 64 }}
      />
    </label>
  </div>
)

/**
 * 单个关卡的缩略图 + 统计条目。同时渲染成品图(pixelMatrix)与乱序图(initPixel)，
 * 统计基于 initPixel，故乱序图与右侧数字一一对应，便于核对。
 */
const LevelStatsItem: React.FC<{ row: LevelStatsRow }> = ({ row }) => {
  const pixelCanvasRef = useRef<HTMLCanvasElement>(null)
  const initCanvasRef = useRef<HTMLCanvasElement>(null)
  const { level, pixelConfig, stats, reason } = row

  useEffect(() => {
    if (!pixelConfig) return
    drawPixelMatrixThumbnail(
      pixelCanvasRef.current,
      pixelConfig.pixelMatrix,
      pixelConfig.localPixelResource,
      THUMBNAIL_CELL_SIZE
    )
  }, [pixelConfig])

  useEffect(() => {
    if (!pixelConfig) return
    // 没有 initPixel 时复用成品图 canvas 占位，避免空白；reason 已说明原因。
    const matrix = Array.isArray(pixelConfig.initPixel) && pixelConfig.initPixel.length > 0
      ? pixelConfig.initPixel
      : pixelConfig.pixelMatrix
    drawPixelMatrixThumbnail(
      initCanvasRef.current,
      matrix,
      pixelConfig.localPixelResource,
      THUMBNAIL_CELL_SIZE
    )
  }, [pixelConfig])

  const histogramEntries = useMemo(
    () => (stats ? histogramToSortedEntries(stats.sizeHistogram) : []),
    [stats]
  )

  return (
    <div className="bead-region-item">
      <div className="bead-region-thumbs">
        {pixelConfig ? (
          <>
            <div className="bead-region-thumb">
              <div className="bead-region-thumb-label">{t("成品图")}</div>
              <canvas ref={pixelCanvasRef} className="bead-region-thumb-canvas" />
            </div>
            <div className="bead-region-thumb">
              <div className="bead-region-thumb-label">{t("乱序图（统计依据）")}</div>
              <canvas ref={initCanvasRef} className="bead-region-thumb-canvas" />
            </div>
          </>
        ) : (
          <div className="bead-region-thumb-empty">{t("无图")}</div>
        )}
      </div>
      <div className="bead-region-stats">
        <div className="bead-region-stats-header">
          <span className="bead-region-level-id">#{level.id}</span>
          <span className="bead-region-level-name">
            {pixelConfig?.name ?? `pixel ${level.pixelImageId}`}
          </span>
          <span className="bead-region-level-meta">{t("难度")}{' '}{level.difficulty}</span>
        </div>
        {stats ? (
          <>
            <div className="bead-region-summary">{t("豆子")}{' '}{stats.totalBeads}{' '}{t("· 连通区域")}{' '}{stats.regionCount}{' '}{t("· 区域大小种数")}{' '}{histogramEntries.length}
              <span className="bead-region-summary-hint">{t("（按乱序图同色 8 连通）")}</span>
            </div>
            <div className="bead-region-histogram">
              {histogramEntries.map(({ size, count }) => (
                <span key={size} className="bead-region-hist-chip">
                  [{size}{t("颗]×")}{count}
                </span>
              ))}
            </div>
          </>
        ) : (
          <div className="bead-region-stats-empty">{reason ?? t("无统计数据")}</div>
        )}
      </div>
    </div>
  )
}

export const LevelBeadRegionPage: React.FC<LevelBeadRegionPageProps> = ({
  defaultLevelType = 1
}) => {
  const [levelType, setLevelType] = useState<number>(defaultLevelType)
  const [rows, setRows] = useState<LevelStatsRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [statusMessage, setStatusMessage] = useState(t("请点击「加载 levelconfig」开始统计。"))
  const [searchKeyword, setSearchKeyword] = useState('')
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE)
  const [pageIndex, setPageIndex] = useState(0)

  const handleLoad = async () => {
    setIsLoading(true)
    setStatusMessage(t("正在加载 levelconfig 与 pixelconfig…"))
    try {
      const [levelConfigItems, pixelConfigItems] = await Promise.all([
        readLevelWorkspaceLevelConfig(levelType),
        readLevelWorkspacePixelConfig()
      ])

      const pixelMap = new Map<number, PixelConfigItem>()
      for (const item of pixelConfigItems) {
        pixelMap.set(item.id, item)
      }

      const filteredLevels = levelConfigItems
        .filter((item) => levelType === 2 || item.type === levelType)
        .sort((a, b) => String(a.id).localeCompare(String(b.id), undefined, { numeric: true }))

      const nextRows: LevelStatsRow[] = filteredLevels.map((level) => {
        const pixelConfig = pixelMap.get(level.pixelImageId) ?? null
        if (!pixelConfig) {
          return { level, pixelConfig: null, stats: null, reason: t("未关联到 pixelconfig（pixelImageId 缺失）") }
        }
        if (!Array.isArray(pixelConfig.initPixel) || pixelConfig.initPixel.length === 0) {
          return { level, pixelConfig, stats: null, reason: t("该像素图无 initPixel 乱序数据") }
        }
        const stats = computeBeadRegionStats(pixelConfig.initPixel)
        return { level, pixelConfig, stats, reason: null }
      })

      setRows(nextRows)
      setPageIndex(0)
      const totalRegions = nextRows.reduce((sum, r) => sum + (r.stats?.regionCount ?? 0), 0)
      setStatusMessage(
        t("已加载 {0} 个关卡，pixelconfig {1} 条；累计连通区域 {2} 个。", nextRows.length, pixelConfigItems.length, totalRegions)
      )
    } catch (error: unknown) {
      setStatusMessage(t("加载失败：{0}", getErrorMessage(error)))
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }

  // 关键字筛选：匹配关卡 ID 或像素图名称。
  const filteredRows = useMemo(() => {
    const keyword = searchKeyword.trim().toLowerCase()
    if (!keyword) return rows
    return rows.filter((row) => {
      if (String(row.level.id).includes(keyword)) return true
      const name = row.pixelConfig?.name
      return typeof name === 'string' && name.toLowerCase().includes(keyword)
    })
  }, [rows, searchKeyword])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
  const safePageIndex = Math.min(pageIndex, totalPages - 1)
  const pageRows = useMemo(() => {
    const start = safePageIndex * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [filteredRows, safePageIndex, pageSize])

  // 筛选结果变化导致当前页越界时，回退到最后一页。
  useEffect(() => {
    if (pageIndex > totalPages - 1) {
      setPageIndex(Math.max(0, totalPages - 1))
    }
  }, [totalPages, pageIndex])

  return (
    <div className="bead-region-page">
      <div className="bead-region-toolbar">
        <label className="bead-region-field">{t("关卡类型")}<select
            value={levelType}
            onChange={(e) => setLevelType(Number.parseInt(e.target.value, 10) || 1)}
            disabled={isLoading}
          >
            {LEVEL_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => {
            void handleLoad()
          }}
          disabled={isLoading}
        >
          {isLoading ? t("加载中…") : t("加载 levelconfig")}
        </button>
        <label className="bead-region-field">{t("搜索（关卡 ID / 像素图名称）")}<input
            type="text"
            value={searchKeyword}
            onChange={(e) => {
              setSearchKeyword(e.target.value)
              setPageIndex(0)
            }}
            placeholder={t("输入 ID 或名称…")}
          />
        </label>
        <label className="bead-region-field">{t("每页")}<select
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number.parseInt(e.target.value, 10) || DEFAULT_PAGE_SIZE)
              setPageIndex(0)
            }}
          >
            {PAGE_SIZE_OPTIONS.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="pixel-config-status">{statusMessage}</div>

      {filteredRows.length > 0 && (
        <Pager
          pageIndex={safePageIndex}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          onPrev={() => setPageIndex((i) => Math.max(0, i - 1))}
          onNext={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
          onJump={(p) => setPageIndex(Math.min(totalPages - 1, Math.max(0, p)))}
        />
      )}

      {filteredRows.length === 0 ? (
        <div className="pixel-config-empty-main">
          {rows.length === 0 ? t("尚未加载数据，请先点击「加载 levelconfig」。") : t("没有匹配搜索条件的关卡。")}
        </div>
      ) : (
        <div className="bead-region-list">
          {pageRows.map((row) => (
            <LevelStatsItem key={row.level.id} row={row} />
          ))}
        </div>
      )}

      {filteredRows.length > 0 && (
        <Pager
          pageIndex={safePageIndex}
          totalPages={totalPages}
          totalItems={filteredRows.length}
          onPrev={() => setPageIndex((i) => Math.max(0, i - 1))}
          onNext={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
          onJump={(p) => setPageIndex(Math.min(totalPages - 1, Math.max(0, p)))}
        />
      )}
    </div>
  )
}

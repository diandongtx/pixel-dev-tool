import { t } from '../i18n'
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import type { GridData, RGBColor } from '../types/grid'
import type { PixelConfigItem } from '../types/pixelConfig'
import {
  buildBeadResourceCatalog,
  type BeadResourceCatalogItem,
  type BeadResourceStateCode
} from '../utils/beadResourceCatalog'
import { buildBeadThumbnailDataUrl } from '../utils/beadThumbnail'
import { matchBeadResourcesForColors, type BeadResourceMatch } from '../utils/beadResourceMatcher'
import {
  buildPixelConfigFromGridPair,
  deriveAssetBaseName,
  downloadTextFile,
  inferNextPixelConfigId,
  parseGridDataFile,
  serializePixelConfigFile
} from '../utils/configIO'
import { loadDefaultBeadResourceAssets } from '../utils/defaultBeadResources'
import { applyBeadResourceMatchesToPixelConfig } from '../utils/levelProductionDraft'
import { saveLevelDraft, saveLevelWorkspaceThumbnail } from '../utils/levelWorkspaceClient'

const BEAD_STATE_CODES: BeadResourceStateCode[] = [2, 3, 4]

const colorToCss = (color: RGBColor): string =>
  `rgba(${color.r}, ${color.g}, ${color.b}, ${color.a / 255})`

const colorToHex = (color: RGBColor | null | undefined): string => {
  if (!color) return '------'

  return [color.r, color.g, color.b]
    .map((channel) => channel.toString(16).padStart(2, '0').toUpperCase())
    .join('')
}

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : t("未知错误")

export function LevelProductionWorkbench() {
  const mapInputRef = useRef<HTMLInputElement>(null)
  const [mapGrid, setMapGrid] = useState<GridData | null>(null)
  const [pixelConfigDraft, setPixelConfigDraft] = useState<PixelConfigItem | null>(null)
  const [catalog, setCatalog] = useState<BeadResourceCatalogItem[]>([])
  const [manualResourceNames, setManualResourceNames] = useState<Record<number, string>>({})
  const [replacementPanel, setReplacementPanel] = useState<{
    colorIndex: number
    selectedResourceName: string | null
  } | null>(null)
  const [statusMessage, setStatusMessage] = useState(t("请导入 map.json，豆子资源会自动从 resource/grid 匹配。"))

  useEffect(() => {
    let isActive = true

    const loadDefaultCatalog = async () => {
      try {
        const defaultAssets = await loadDefaultBeadResourceAssets()
        const nextCatalog = await buildBeadResourceCatalog(defaultAssets)
        if (!isActive) return

        setCatalog(nextCatalog)
        setStatusMessage(t("已加载默认豆子资源目录：resource/grid，共 {0} 组。", nextCatalog.length))
      } catch (error: unknown) {
        if (!isActive) return
        setStatusMessage(t("默认豆子资源加载失败：{0}", getErrorMessage(error)))
      }
    }

    void loadDefaultCatalog()

    return () => {
      isActive = false
    }
  }, [])

  const matches = useMemo<BeadResourceMatch[]>(() => {
    if (!mapGrid || catalog.length === 0) return []

    return matchBeadResourcesForColors(mapGrid.colors, catalog)
  }, [catalog, mapGrid])

  const effectiveMatches = useMemo<BeadResourceMatch[]>(() => {
    return matches.map((match) => {
      const manualResourceName = manualResourceNames[match.colorIndex]?.trim()

      if (!manualResourceName) {
        return match
      }

      return {
        ...match,
        resourceName: manualResourceName,
        confidence: 'high'
      }
    })
  }, [manualResourceNames, matches])

  const catalogByName = useMemo(() => {
    return new Map(catalog.map((item) => [item.resourceName, item]))
  }, [catalog])

  const matchByColorIndex = useMemo(() => {
    return new Map(effectiveMatches.map((match) => [match.colorIndex, match]))
  }, [effectiveMatches])

  const pixelConfigWithResources = useMemo(() => {
    if (!pixelConfigDraft) return null

    return applyBeadResourceMatchesToPixelConfig(pixelConfigDraft, effectiveMatches)
  }, [effectiveMatches, pixelConfigDraft])

  const handleExportPixelConfigDraft = () => {
    if (!pixelConfigWithResources) return

    downloadTextFile(
      serializePixelConfigFile([pixelConfigWithResources]),
      `${pixelConfigWithResources.name}_pixelconfig_draft.json`
    )
  }

  const handleSaveDraft = async () => {
    if (!mapGrid || !pixelConfigWithResources) return

    try {
      await saveLevelDraft(pixelConfigWithResources.name, {
        map: mapGrid,
        point: mapGrid,
        pixelConfig: pixelConfigWithResources
      })
      const thumbnailDataUrl = await buildBeadThumbnailDataUrl(mapGrid, effectiveMatches, catalog)
      await saveLevelWorkspaceThumbnail(pixelConfigWithResources.name, thumbnailDataUrl)
      setStatusMessage(t("已保存草稿：{0}", pixelConfigWithResources.name))
    } catch (error: unknown) {
      setStatusMessage(t("保存草稿失败：{0}", getErrorMessage(error)))
    }
  }

  const handleExportMissingList = () => {
    const rows = effectiveMatches
      .filter((match) => match.confidence === 'low' || match.confidence === 'missing')
      .map((match) => ({
        colorIndex: match.colorIndex,
        targetColor: match.targetColor,
        resourceName: match.resourceName,
        confidence: match.confidence,
        distance: match.distance
      }))

    downloadTextFile(`${JSON.stringify(rows, null, 2)}\n`, 'bead-resource-review-list.json')
  }

  const handleMapImport = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]

    if (!file) {
      return
    }

    try {
      const mapText = await file.text()
      const nextMapGrid = parseGridDataFile(mapText, deriveAssetBaseName(file.name))
      const draft = buildPixelConfigFromGridPair(nextMapGrid, nextMapGrid, inferNextPixelConfigId([]))

      setMapGrid(nextMapGrid)
      setPixelConfigDraft(draft)
      setManualResourceNames({})
      setReplacementPanel(null)
      setStatusMessage(t("已导入 {0}，正在使用默认豆子资源匹配。", draft.name))
    } catch (error: unknown) {
      setStatusMessage(t("导入失败：{0}", getErrorMessage(error)))
    } finally {
      event.target.value = ''
    }
  }

  const getCatalogItemForMatch = (match: BeadResourceMatch): BeadResourceCatalogItem | null => {
    if (!match.resourceName) return null
    return catalogByName.get(match.resourceName) ?? null
  }

  const getPreviewResourceUrl = (colorIndex: number): string | null => {
    const match = matchByColorIndex.get(colorIndex)
    if (!match) return null

    return getCatalogItemForMatch(match)?.stateFiles[4]?.url ?? null
  }

  const openReplacementPanel = (match: BeadResourceMatch) => {
    setReplacementPanel({
      colorIndex: match.colorIndex,
      selectedResourceName: match.resourceName ?? catalog[0]?.resourceName ?? null
    })
  }

  const confirmReplacement = () => {
    if (!replacementPanel?.selectedResourceName) return

    setManualResourceNames((previous) => ({
      ...previous,
      [replacementPanel.colorIndex]: replacementPanel.selectedResourceName ?? ''
    }))
    setReplacementPanel(null)
  }

  const currentReplacementColor = replacementPanel
    ? mapGrid?.colors[replacementPanel.colorIndex] ?? null
    : null
  const selectedReplacementItem = replacementPanel?.selectedResourceName
    ? catalogByName.get(replacementPanel.selectedResourceName) ?? null
    : null

  return (
    <div className="level-production-workbench">
      <div className="pixel-config-toolbar">
        <input
          ref={mapInputRef}
          type="file"
          accept=".json,application/json"
          style={{ display: 'none' }}
          onChange={(event) => {
            void handleMapImport(event)
          }}
        />
        <button type="button" onClick={() => mapInputRef.current?.click()}>{t("导入 map")}</button>
        <button
          type="button"
          onClick={handleExportMissingList}
          disabled={effectiveMatches.length === 0}
        >{t("导出低置信度/未匹配清单")}</button>
        <button
          type="button"
          onClick={handleExportPixelConfigDraft}
          disabled={!pixelConfigWithResources}
        >{t("导出 pixelconfig 草稿")}</button>
        <button
          type="button"
          onClick={() => {
            void handleSaveDraft()
          }}
          disabled={!pixelConfigWithResources}
        >{t("保存草稿")}</button>
      </div>

      <div className="pixel-config-status">{statusMessage}</div>
      <div className="level-production-summary">
        <div>{t("当前图片：")}{pixelConfigDraft?.name ?? '-'}</div>
        <div>{t("颜色数量：")}{mapGrid?.colors.length ?? 0}</div>
        <div>{t("默认资源组数量：")}{catalog.length}</div>
      </div>

      {mapGrid ? (
        <section className="level-production-preview-section">
          <h3>{t("map 预览")}</h3>
          <div className="level-production-preview-pair">
            <div className="level-production-preview-panel">
              <h4>{t("原色像素预览")}</h4>
              <div
                data-testid="level-production-color-preview"
                className="level-production-map-preview"
                style={{
                  gridTemplateColumns: `repeat(${mapGrid.width}, minmax(0, 1fr))`
                }}
              >
                {mapGrid.colorIndices.flatMap((row, rowIndex) =>
                  row.map((colorIndex, columnIndex) => {
                    const color = mapGrid.colors[colorIndex]

                    return (
                      <div
                        key={`${rowIndex}:${columnIndex}`}
                        className="level-production-preview-cell"
                        style={{ backgroundColor: color ? colorToCss(color) : '#fff' }}
                      />
                    )
                  })
                )}
              </div>
            </div>
            <div className="level-production-preview-panel">
              <h4>{t("豆子资源预览")}</h4>
              <div
                data-testid="level-production-bead-preview"
                className="level-production-map-preview"
                style={{
                  gridTemplateColumns: `repeat(${mapGrid.width}, minmax(0, 1fr))`
                }}
              >
                {mapGrid.colorIndices.flatMap((row, rowIndex) =>
                  row.map((colorIndex, columnIndex) => {
                    const previewUrl = getPreviewResourceUrl(colorIndex)
                    const match = matchByColorIndex.get(colorIndex)
                    const color = mapGrid.colors[colorIndex]

                    return (
                      <div
                        key={`${rowIndex}:${columnIndex}`}
                        className="level-production-preview-cell"
                        style={{ backgroundColor: color ? colorToCss(color) : '#fff' }}
                      >
                        {previewUrl ? (
                          <img
                            alt={t("预览格子 {0}-{1} {2}", rowIndex + 1, columnIndex + 1, match?.resourceName ?? t("未匹配"))}
                            src={previewUrl}
                          />
                        ) : null}
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {replacementPanel ? (
        <section className="level-production-replacement-panel" role="dialog" aria-modal="true">
          <div className="level-production-replacement-header">
            <h3>{t("更换豆子资源 #")}{replacementPanel.colorIndex}</h3>
            <button type="button" onClick={() => setReplacementPanel(null)}>{t("取消")}</button>
          </div>
          <div className="level-production-replacement-colors">
            <div className="level-production-replacement-color">
              <span>{t("当前颜色")}</span>
              <div
                className="level-production-replacement-swatch"
                style={{
                  backgroundColor: currentReplacementColor
                    ? colorToCss(currentReplacementColor)
                    : '#fff'
                }}
              />
              <strong>{colorToHex(currentReplacementColor)}</strong>
            </div>
            <div className="level-production-replacement-color">
              <span>{t("新选择颜色")}</span>
              <div
                className="level-production-replacement-swatch"
                style={{
                  backgroundColor: selectedReplacementItem
                    ? colorToCss(selectedReplacementItem.compareColor)
                    : '#fff'
                }}
              />
              <strong>{colorToHex(selectedReplacementItem?.compareColor)}</strong>
            </div>
          </div>
          <div className="level-production-resource-picker">
            {catalog.map((item) => {
              const state4 = item.stateFiles[4]
              const isSelected = item.resourceName === replacementPanel.selectedResourceName
              const hexColor = colorToHex(item.compareColor)

              return (
                <button
                  key={item.resourceName}
                  type="button"
                  className={`level-production-resource-option${isSelected ? ' selected' : ''}`}
                  onClick={() =>
                    setReplacementPanel((previous) =>
                      previous ? { ...previous, selectedResourceName: item.resourceName } : previous
                    )
                  }
                >
                  {state4?.url ? (
                    <img alt={t("{0} 4号资源", item.resourceName)} src={state4.url} />
                  ) : (
                    <span className="level-production-state-missing">{t("缺失 4")}</span>
                  )}
                  <span>{item.resourceName}</span>
                  <span>{hexColor}</span>
                </button>
              )
            })}
          </div>
          <div className="level-production-replacement-actions">
            <button
              type="button"
              onClick={confirmReplacement}
              disabled={!replacementPanel.selectedResourceName}
            >{t("确认")}</button>
          </div>
        </section>
      ) : null}

      <div className="level-production-match-list">
        {effectiveMatches.map((match) => {
          const catalogItem = getCatalogItemForMatch(match)

          return (
            <div
              key={match.colorIndex}
              className={`level-production-match level-production-match--${match.confidence}`}
            >
              <span>#{match.colorIndex}</span>
              <span>{match.resourceName ?? t("未匹配")}</span>
              <span>{match.confidence}</span>
              <span>{match.distance === null ? '-' : match.distance.toFixed(1)}</span>
              <div className="level-production-state-images">
                {BEAD_STATE_CODES.map((stateCode) => {
                  const stateAsset = catalogItem?.stateFiles[stateCode]

                  return (
                    <div key={stateCode} className="level-production-state-image">
                      <span>{stateCode}</span>
                      {stateAsset?.url ? (
                        <img
                          alt={t("{0} 状态 {1}", match.resourceName ?? t("未匹配"), stateCode)}
                          src={stateAsset.url}
                        />
                      ) : (
                        <span className="level-production-state-missing">{t("缺失")}</span>
                      )}
                    </div>
                  )
                })}
              </div>
              <button type="button" onClick={() => openReplacementPanel(match)}>{t("更换")}</button>
              <input
                aria-label={t("手动替换颜色 {0} 的资源", match.colorIndex)}
                value={manualResourceNames[match.colorIndex] ?? ''}
                placeholder={t("手动资源组名")}
                onChange={(event) => {
                  setManualResourceNames((previous) => ({
                    ...previous,
                    [match.colorIndex]: event.target.value
                  }))
                }}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

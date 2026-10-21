import { useEffect, useRef, useState } from 'react'
import {
  beadTemplates,
  buildBeadAssetFilename,
  buildBeadDebugLayerFilename,
  renderBeadDebugResult,
  resolveDebugExportBaseName
} from '../beads'
import type { BeadDebugLayerResult, BeadDebugRenderResult, BeadTemplate } from '../beads/types'
import type { RGBColor } from '../types/grid'

type StateCode = BeadTemplate['stateCode']
type DownloadVariant = 'original' | 'tinted' | 'composite'

const DEFAULT_HEX = '#db3937'
const STATE_CODES: StateCode[] = [2, 3, 4]

const createEmptyStateRecord = <T,>(value: T): Record<StateCode, T> => ({
  2: value,
  3: value,
  4: value
})

const buildRenderCycleKey = (
  color: RGBColor,
  hiddenLayerIdsByState: Record<StateCode, string[]>
): string =>
  JSON.stringify({
    color,
    hiddenLayerIdsByState
  })

const normalizeHexInput = (value: string): string | null => {
  const trimmed = value.trim()
  if (!/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return null
  }

  return `#${trimmed.replace(/^#/, '').toLowerCase()}`
}

const hexToColor = (hex: string): RGBColor => ({
  r: Number.parseInt(hex.slice(1, 3), 16),
  g: Number.parseInt(hex.slice(3, 5), 16),
  b: Number.parseInt(hex.slice(5, 7), 16),
  a: 255
})

const colorToHex = (color: RGBColor): string =>
  `#${color.r.toString(16).padStart(2, '0')}${color.g.toString(16).padStart(2, '0')}${color.b.toString(16).padStart(2, '0')}`

const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown bead debug error.'

const isRgbColor = (value: unknown): value is RGBColor => {
  if (typeof value !== 'object' || value === null) {
    return false
  }

  const candidate = value as Partial<RGBColor>

  return ['r', 'g', 'b', 'a'].every((channel) => {
    const numericValue = candidate[channel as keyof RGBColor]
    return typeof numericValue === 'number' && Number.isFinite(numericValue)
  })
}

const triggerBlobDownload = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  window.setTimeout(() => {
    anchor.remove()
    URL.revokeObjectURL(url)
  }, 0)
}

const toggleHiddenLayer = (current: string[], layerId: string): string[] =>
  current.includes(layerId)
    ? current.filter((candidate) => candidate !== layerId)
    : [...current, layerId]

const getLayerBlob = (
  layer: BeadDebugLayerResult,
  variant: DownloadVariant
): Blob => {
  if (variant === 'original') {
    return layer.originalBlob
  }

  if (variant === 'tinted') {
    return layer.tintedBlob
  }

  return layer.compositeBlob
}

const parseImportedColors = async (file: File): Promise<RGBColor[]> => {
  const parsed = JSON.parse(await file.text()) as { colors?: unknown }

  if (!Array.isArray(parsed.colors)) {
    throw new Error('Imported JSON must include a colors array.')
  }

  if (!parsed.colors.every(isRgbColor)) {
    throw new Error('Imported JSON colors must be RGBA objects.')
  }

  return parsed.colors
}

interface BlobPreviewImageProps {
  alt: string
  blob: Blob
  testId?: string
}

function BlobPreviewImage({ alt, blob, testId }: BlobPreviewImageProps) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    const nextUrl = URL.createObjectURL(blob)
    setUrl(nextUrl)

    return () => {
      URL.revokeObjectURL(nextUrl)
    }
  }, [blob])

  if (!url) {
    return <div aria-label={`${alt} loading`} data-testid={testId}>Loading preview...</div>
  }

  return <img alt={alt} data-testid={testId} src={url} />
}

export function BeadDebugPage() {
  const latestRenderRequestIdRef = useRef(0)
  const latestImportRequestIdRef = useRef(0)
  const [manualHexInput, setManualHexInput] = useState(DEFAULT_HEX)
  const [manualHexValue, setManualHexValue] = useState(DEFAULT_HEX)
  const [manualHexError, setManualHexError] = useState<string | null>(null)
  const [manualBaseName, setManualBaseName] = useState('')
  const [importedColors, setImportedColors] = useState<RGBColor[]>([])
  const [importedFilename, setImportedFilename] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [selectedImportedIndex, setSelectedImportedIndex] = useState<number | null>(null)
  const [focusedState, setFocusedState] = useState<StateCode>(2)
  const [resultsByState, setResultsByState] = useState<Record<StateCode, BeadDebugRenderResult | null>>(
    createEmptyStateRecord<BeadDebugRenderResult | null>(null)
  )
  const [renderErrorsByState, setRenderErrorsByState] = useState<Record<StateCode, string | null>>(
    createEmptyStateRecord<string | null>(null)
  )
  const [loadingByState, setLoadingByState] = useState<Record<StateCode, boolean>>(
    createEmptyStateRecord<boolean>(true)
  )
  const [resolvedRenderCycleKeyByState, setResolvedRenderCycleKeyByState] = useState<Record<StateCode, string | null>>(
    createEmptyStateRecord<string | null>(null)
  )
  const [hiddenLayerIdsByState, setHiddenLayerIdsByState] = useState<Record<StateCode, string[]>>(
    createEmptyStateRecord<string[]>([])
  )

  const activeColor = selectedImportedIndex === null
    ? hexToColor(manualHexValue)
    : (importedColors[selectedImportedIndex] ?? hexToColor(manualHexValue))
  const activeColorIndex = selectedImportedIndex ?? 0
  const exportBaseName = resolveDebugExportBaseName(manualBaseName, importedFilename)
  const currentRenderCycleKey = buildRenderCycleKey(activeColor, hiddenLayerIdsByState)
  const hiddenLayerIdsState2 = hiddenLayerIdsByState[2]
  const hiddenLayerIdsState3 = hiddenLayerIdsByState[3]
  const hiddenLayerIdsState4 = hiddenLayerIdsByState[4]
  const isStateCurrent = (stateCode: StateCode): boolean =>
    !loadingByState[stateCode] && resolvedRenderCycleKeyByState[stateCode] === currentRenderCycleKey
  const canUseStateResult = (stateCode: StateCode): boolean =>
    isStateCurrent(stateCode) &&
    !renderErrorsByState[stateCode] &&
    resultsByState[stateCode] !== null
  const focusedResult = canUseStateResult(focusedState) ? resultsByState[focusedState] : null

  useEffect(() => {
    let isActive = true
    const renderRequestId = latestRenderRequestIdRef.current + 1
    latestRenderRequestIdRef.current = renderRequestId
    const targetColor = {
      r: activeColor.r,
      g: activeColor.g,
      b: activeColor.b,
      a: activeColor.a
    }
    const hiddenLayerIdsLookup: Record<StateCode, string[]> = {
      2: hiddenLayerIdsState2,
      3: hiddenLayerIdsState3,
      4: hiddenLayerIdsState4
    }
    const renderCycleKey = buildRenderCycleKey(targetColor, hiddenLayerIdsLookup)

    setLoadingByState(createEmptyStateRecord(true))
    setRenderErrorsByState(createEmptyStateRecord<string | null>(null))

    const renderAllStates = async () => {
      await Promise.all(
        beadTemplates.map(async (template) => {
          try {
            const result = await renderBeadDebugResult(template, targetColor, {
              hiddenLayerIds: hiddenLayerIdsLookup[template.stateCode]
            })

            if (!isActive || latestRenderRequestIdRef.current !== renderRequestId) {
              return
            }

            setResultsByState((current) => ({
              ...current,
              [template.stateCode]: result
            }))
            setResolvedRenderCycleKeyByState((current) => ({
              ...current,
              [template.stateCode]: renderCycleKey
            }))
            setRenderErrorsByState((current) => ({
              ...current,
              [template.stateCode]: null
            }))
            setLoadingByState((current) => ({
              ...current,
              [template.stateCode]: false
            }))
          } catch (error) {
            if (!isActive || latestRenderRequestIdRef.current !== renderRequestId) {
              return
            }

            setResultsByState((current) => ({
              ...current,
              [template.stateCode]: null
            }))
            setRenderErrorsByState((current) => ({
              ...current,
              [template.stateCode]: getErrorMessage(error)
            }))
            setResolvedRenderCycleKeyByState((current) => ({
              ...current,
              [template.stateCode]: renderCycleKey
            }))
            setLoadingByState((current) => ({
              ...current,
              [template.stateCode]: false
            }))
          }
        })
      )
    }

    void renderAllStates()

    return () => {
      isActive = false
    }
  }, [
    activeColor.a,
    activeColor.b,
    activeColor.g,
    activeColor.r,
    hiddenLayerIdsState2,
    hiddenLayerIdsState3,
    hiddenLayerIdsState4
  ])

  const handleHexInputChange = (value: string) => {
    setManualHexInput(value)
    const normalized = normalizeHexInput(value)

    if (!normalized) {
      setManualHexError('Enter a 6-digit hex color like #db3937.')
      return
    }

    setManualHexError(null)
    setManualHexValue(normalized)
  }

  const handleColorPickerChange = (value: string) => {
    const normalized = normalizeHexInput(value)
    if (!normalized) {
      return
    }

    setManualHexInput(normalized)
    setManualHexValue(normalized)
    setManualHexError(null)
  }

  const handleImportedFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const importRequestId = latestImportRequestIdRef.current + 1
    latestImportRequestIdRef.current = importRequestId

    try {
      const colors = await parseImportedColors(file)
      if (latestImportRequestIdRef.current !== importRequestId) {
        return
      }

      setImportedColors(colors)
      setImportedFilename(file.name)
      setSelectedImportedIndex(null)
      setImportError(null)
    } catch (error) {
      if (latestImportRequestIdRef.current !== importRequestId) {
        return
      }

      setImportError(getErrorMessage(error))
    } finally {
      event.target.value = ''
    }
  }

  const handleColorSourceChange = (value: string) => {
    if (value === 'manual') {
      setSelectedImportedIndex(null)
      return
    }

    const nextIndex = Number.parseInt(value, 10)
    if (Number.isNaN(nextIndex)) {
      setSelectedImportedIndex(null)
      return
    }

    setSelectedImportedIndex(nextIndex)
  }

  const handleLayerVisibilityChange = (layerId: string) => {
    setHiddenLayerIdsByState((current) => ({
      ...current,
      [focusedState]: toggleHiddenLayer(current[focusedState], layerId)
    }))
  }

  const downloadFinalImage = (result: BeadDebugRenderResult) => {
    triggerBlobDownload(
      result.finalBlob,
      buildBeadAssetFilename(exportBaseName, activeColorIndex, result.stateCode)
    )
  }

  const downloadLayerImage = (layer: BeadDebugLayerResult, variant: DownloadVariant) => {
    triggerBlobDownload(
      getLayerBlob(layer, variant),
      buildBeadDebugLayerFilename(
        exportBaseName,
        activeColorIndex,
        focusedState,
        layer.layerId,
        variant
      )
    )
  }

  return (
    <section className="bead-debug-page">
      <header className="bead-debug-header">
        <h2>Bead Debug Page</h2>
        <p>Inspect the three bead states, isolate layers, and export debug images for the active color.</p>
      </header>

      <section aria-labelledby="bead-debug-inputs">
        <h3 id="bead-debug-inputs">Inputs</h3>
        <div className="bead-debug-controls">
          <label htmlFor="beadDebugHexInput">
            Hex color
          </label>
          <input
            id="beadDebugHexInput"
            type="text"
            value={manualHexInput}
            onChange={(event) => handleHexInputChange(event.target.value)}
          />

          <label htmlFor="beadDebugColorPicker">
            Color picker
          </label>
          <input
            id="beadDebugColorPicker"
            type="color"
            value={manualHexValue}
            onChange={(event) => handleColorPickerChange(event.target.value)}
          />

          <label htmlFor="beadDebugJsonInput">
            Import colors JSON
          </label>
          <input
            id="beadDebugJsonInput"
            accept="application/json"
            type="file"
            onChange={(event) => {
              void handleImportedFileChange(event)
            }}
          />

          <label htmlFor="beadDebugColorSource">
            Color source
          </label>
          <select
            id="beadDebugColorSource"
            value={selectedImportedIndex === null ? 'manual' : String(selectedImportedIndex)}
            onChange={(event) => handleColorSourceChange(event.target.value)}
          >
            <option value="manual">Manual hex</option>
            {importedColors.map((color, index) => (
              <option key={index} value={String(index)}>
                Imported {index}: {colorToHex(color)}
              </option>
            ))}
          </select>

          <label htmlFor="beadDebugBaseName">
            Export base name
          </label>
          <input
            id="beadDebugBaseName"
            type="text"
            value={manualBaseName}
            onChange={(event) => setManualBaseName(event.target.value)}
          />
        </div>

        <div className="bead-debug-summary">
          <p>Active color: <strong>{colorToHex(activeColor)}</strong></p>
          <p>Active export base: <strong>{exportBaseName}</strong></p>
          {importedFilename ? <p>Imported file: {importedFilename}</p> : null}
          {manualHexError ? <p role="alert">{manualHexError}</p> : null}
          {importError ? <p role="alert">{importError}</p> : null}
        </div>
      </section>

      <section aria-labelledby="bead-debug-final-results">
        <h3 id="bead-debug-final-results">Final Results</h3>
        <div className="bead-debug-final-grid">
          {STATE_CODES.map((stateCode) => {
            const template = beadTemplates.find((candidate) => candidate.stateCode === stateCode)
            const result = resultsByState[stateCode]
            const renderError = renderErrorsByState[stateCode]
            const canDownloadFinal = canUseStateResult(stateCode)
            const currentResult = canUseStateResult(stateCode) ? result : null

            if (!template) {
              return null
            }

            return (
              <article
                key={template.templateId}
                aria-current={focusedState === stateCode}
                data-testid={`final-preview-${stateCode}`}
              >
                <h4>{template.templateId}</h4>
                <p>State {template.stateCode}</p>
                <p>Filename: {buildBeadAssetFilename(exportBaseName, activeColorIndex, template.stateCode)}</p>
                <button type="button" onClick={() => setFocusedState(template.stateCode)}>
                  {focusedState === stateCode ? 'Layer focus active' : 'Focus layer details'}
                </button>
                <button
                  data-testid={`download-final-${stateCode}`}
                  type="button"
                  disabled={!canDownloadFinal}
                  onClick={() => {
                    if (currentResult) {
                      downloadFinalImage(currentResult)
                    }
                  }}
                >
                  Download final PNG
                </button>
                {renderError ? <p role="alert">{renderError}</p> : null}
                {!renderError && currentResult ? (
                  <BlobPreviewImage
                    alt={`${template.templateId} final preview`}
                    blob={currentResult.finalBlob}
                  />
                ) : null}
                {!renderError && !currentResult ? <p>Rendering preview...</p> : null}
              </article>
            )
          })}
        </div>
      </section>

      <section aria-labelledby="bead-debug-suspects">
        <h3 id="bead-debug-suspects">Possible Suspect Layers</h3>
        {focusedResult && focusedResult.suspects.length > 0 ? (
          <ul>
            {focusedResult.suspects.map((suspect) => (
              <li key={`${suspect.layerId}:${suspect.reason}`}>
                <strong>{suspect.layerId}</strong>: {suspect.message}
              </li>
            ))}
          </ul>
        ) : (
          <p>No suspect hints for the focused state.</p>
        )}
      </section>

      <section aria-labelledby="bead-debug-layers">
        <h3 id="bead-debug-layers">Layer Debug</h3>
        <p>Focused state: {focusedState}</p>
        {focusedResult ? (
          <div className="bead-debug-layer-grid">
            {focusedResult.layers.map((layer) => (
              <article key={layer.layerId} data-testid={`layer-card-${layer.layerId}`}>
                <h4>{layer.layerId}</h4>
                <p>Kind: {layer.kind}</p>
                <p>Resolved color: {colorToHex(layer.resolvedColor)}</p>
                <label>
                  <input
                    checked={layer.visible}
                    data-layer-id={layer.layerId}
                    type="checkbox"
                    onChange={() => handleLayerVisibilityChange(layer.layerId)}
                  />
                  Visible in final composite
                </label>

                <div className="bead-debug-layer-previews">
                  <div>
                    <h5>Original</h5>
                    <BlobPreviewImage
                      alt={`${layer.layerId} original preview`}
                      blob={layer.originalBlob}
                    />
                    <button
                      data-testid={`download-layer-${layer.layerId}-original`}
                      type="button"
                      disabled={!canUseStateResult(focusedState)}
                      onClick={() => downloadLayerImage(layer, 'original')}
                    >
                      Download original PNG
                    </button>
                  </div>
                  <div>
                    <h5>Tinted</h5>
                    <BlobPreviewImage
                      alt={`${layer.layerId} tinted preview`}
                      blob={layer.tintedBlob}
                    />
                    <button
                      data-testid={`download-layer-${layer.layerId}-tinted`}
                      type="button"
                      disabled={!canUseStateResult(focusedState)}
                      onClick={() => downloadLayerImage(layer, 'tinted')}
                    >
                      Download tinted PNG
                    </button>
                  </div>
                  <div>
                    <h5>Composite</h5>
                    <BlobPreviewImage
                      alt={`${layer.layerId} composite preview`}
                      blob={layer.compositeBlob}
                    />
                    <button
                      data-testid={`download-layer-${layer.layerId}-composite`}
                      type="button"
                      disabled={!canUseStateResult(focusedState)}
                      onClick={() => downloadLayerImage(layer, 'composite')}
                    >
                      Download composite PNG
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p>Render this state to inspect layer details.</p>
        )}
      </section>
    </section>
  )
}

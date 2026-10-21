import React, { useEffect, useMemo, useRef } from 'react'
import { drawGridToCanvas } from '../utils/gridCanvas'
import { buildPreviewGridDataFromMatrix } from '../utils/previewGrid'
import { drawPixelMatrixThumbnail } from '../utils/pixelMatrixThumbnail'

interface GridMatrixPreviewProps {
  title: string
  matrix: number[][]
  gridSize?: number
  // 传入则用 localPixelResource 的真实 hex 颜色渲染；否则回退到索引伪彩色（仅用于结构查看）。
  localPixelResource?: string[]
  canvasClassName?: string
  containerClassName?: string
  titleClassName?: string
}

export const GridMatrixPreview: React.FC<GridMatrixPreviewProps> = ({
  title,
  matrix,
  gridSize = 8,
  localPixelResource,
  canvasClassName = 'pixel-config-preview-canvas',
  containerClassName = 'pixel-config-preview',
  titleClassName = 'pixel-config-preview-title'
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const previewData = useMemo(
    () => buildPreviewGridDataFromMatrix(matrix, title),
    [matrix, title]
  )

  useEffect(() => {
    if (localPixelResource) {
      drawPixelMatrixThumbnail(canvasRef.current, matrix, localPixelResource, gridSize)
      return
    }
    drawGridToCanvas(canvasRef.current, previewData, gridSize)
  }, [gridSize, previewData, localPixelResource, matrix])

  return (
    <div className={containerClassName}>
      <div className={titleClassName}>{title}</div>
      <canvas ref={canvasRef} className={canvasClassName} />
    </div>
  )
}

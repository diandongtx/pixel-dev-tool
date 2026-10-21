import type { LevelConfigFile } from './levelConfig'
import type { PixelConfigFile } from './pixelConfig'

export interface MainLevelReviewGenerateRequest {
  levels: LevelConfigFile
  pixelConfigs: PixelConfigFile
}

export interface MainLevelReviewGenerateResponse {
  ok: true
  levelCount: number
  outputPath: 'output/main-level-review/index.html'
  previewUrl: '/api/level-workspace/main-level-review-preview/index.html'
  warnings: string[]
}

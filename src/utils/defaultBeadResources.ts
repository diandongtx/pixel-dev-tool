import type { BeadResourceAsset } from './beadResourceCatalog'

const resourceUrls = import.meta.glob('../../resource/grid/*.png', {
  import: 'default',
  query: '?url'
}) as Record<string, () => Promise<string>>

const getAssetName = (path: string): string => path.split(/[\\/]/).pop() ?? path

export const loadDefaultBeadResourceAssets = async (): Promise<BeadResourceAsset[]> => {
  const assets = await Promise.all(
    Object.entries(resourceUrls).map(async ([path, loadUrl]) => ({
      name: getAssetName(path),
      url: await loadUrl()
    }))
  )

  return assets.sort((left, right) => left.name.localeCompare(right.name))
}

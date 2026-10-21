export const buildLevelConfigFilename = (type: number): string =>
  type === 1 ? 'levelconfig.json' : type === 2 ? 'dailylevelconfig.json' : `levelconfig_${type}.json`

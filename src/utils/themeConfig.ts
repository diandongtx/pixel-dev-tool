import type { ThemeConfigFile } from '../types/themeConfig'

export const DEFAULT_THEME_CONFIG: ThemeConfigFile = [
  { theme: 'animal', themeName: '动物', sortOrder: 1 },
  { theme: 'plant', themeName: '植物', sortOrder: 2 },
  { theme: 'character', themeName: '人物', sortOrder: 3 },
  { theme: 'fruit-veggie', themeName: '果蔬', sortOrder: 4 },
  { theme: 'object', themeName: '物品', sortOrder: 5 },
  { theme: 'food', themeName: '食物', sortOrder: 6 },
  { theme: 'scenery', themeName: '风景', sortOrder: 7 },
  { theme: 'insect', themeName: '昆虫', sortOrder: 8 },
  { theme: 'dessert', themeName: '甜品', sortOrder: 9 },
  { theme: 'vehicle', themeName: '交通工具', sortOrder: 10 },
  { theme: 'other', themeName: '其它', sortOrder: 11 }
]

export const sortThemeConfig = (items: ThemeConfigFile): ThemeConfigFile =>
  [...items].sort((left, right) =>
    left.sortOrder - right.sortOrder || left.theme.localeCompare(right.theme)
  )

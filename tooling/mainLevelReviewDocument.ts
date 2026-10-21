import type { LevelConfigItem } from '../src/types/levelConfig'
import type { MainLevelReviewGenerateRequest } from '../src/types/mainLevelReview'
import type { PixelConfigItem } from '../src/types/pixelConfig'
import {
  countPixelConfigBeads,
  isValidPixelConfigBeadCount
} from '../src/utils/pixelConfigBeadCount'

export interface MainLevelReviewPixelMetadata {
  name: string
  theme: unknown | null
  quality: unknown | null
  imageType: unknown | null
  albumId: unknown | null
  difficulty: unknown | null
}

export interface MainLevelReviewRecord {
  level: LevelConfigItem
  pixel: MainLevelReviewPixelMetadata | null
  initPixel: number[][] | null
  localPixelResource: string[]
  colorCount: number | null
  beadCount: number | null
  diagnostics: string[]
}

export interface MainLevelReviewBuildResult {
  records: MainLevelReviewRecord[]
  warnings: string[]
}

const cloneLevel = (level: LevelConfigItem): LevelConfigItem => ({
  ...level,
  widthHeight: [...level.widthHeight] as [number, number],
  propConfigs: [...level.propConfigs]
})

const isValidInitPixel = (value: unknown): value is number[][] => {
  if (!Array.isArray(value) || value.length === 0) return false

  const width = Array.isArray(value[0]) ? value[0].length : 0
  return width > 0 && value.every((row) =>
    Array.isArray(row)
    && row.length === width
    && row.every((cell) => typeof cell === 'number' && Number.isInteger(cell))
  )
}

const toPixelMetadata = (pixel: PixelConfigItem): MainLevelReviewPixelMetadata => ({
  name: pixel.name,
  theme: pixel.theme ?? null,
  quality: pixel.quality ?? null,
  imageType: pixel.imageType ?? null,
  albumId: pixel.albumId ?? null,
  difficulty: pixel.difficulty ?? null
})

const prefixWarning = (levelId: number, diagnostic: string): string =>
  `关卡 ${levelId}：${diagnostic}`

export const buildMainLevelReviewRecords = (
  request: MainLevelReviewGenerateRequest,
  availableBeadFiles: Iterable<string>
): MainLevelReviewBuildResult => {
  if (!request || !Array.isArray(request.levels)) {
    throw new Error('关卡配置 levels 必须是数组')
  }
  if (!Array.isArray(request.pixelConfigs)) {
    throw new Error('像素图配置 pixelConfigs 必须是数组')
  }

  const beadFiles = new Set(availableBeadFiles)
  const pixelsById = new Map<number, PixelConfigItem>()
  for (const pixel of request.pixelConfigs) {
    if (!pixelsById.has(pixel.id)) pixelsById.set(pixel.id, pixel)
  }

  const warnings: string[] = []
  const records = [...request.levels]
    .sort((left, right) => left.id - right.id)
    .map((sourceLevel): MainLevelReviewRecord => {
      const level = cloneLevel(sourceLevel)
      const pixel = pixelsById.get(level.pixelImageId)
      if (!pixel) {
        const diagnostic = `未找到 pixelImageId ${level.pixelImageId} 对应的像素图配置`
        warnings.push(prefixWarning(level.id, diagnostic))
        return {
          level,
          pixel: null,
          initPixel: null,
          localPixelResource: [],
          colorCount: null,
          beadCount: null,
          diagnostics: [diagnostic]
        }
      }

      const pixelMetadata = toPixelMetadata(pixel)
      const localPixelResource = [...pixel.localPixelResource]
      if (!isValidInitPixel(pixel.initPixel)) {
        const diagnostic = '预览矩阵 initPixel 不可用'
        warnings.push(prefixWarning(level.id, diagnostic))
        return {
          level,
          pixel: pixelMetadata,
          initPixel: null,
          localPixelResource,
          colorCount: null,
          beadCount: null,
          diagnostics: [diagnostic]
        }
      }

      const initPixel = pixel.initPixel.map((row) => [...row])
      const colorIndexes = [...new Set(initPixel.flat().filter((cell) => cell >= 0))]
        .sort((left, right) => left - right)
      const diagnostics: string[] = []

      for (const colorIndex of colorIndexes) {
        const resourceName = localPixelResource[colorIndex]
        if (typeof resourceName !== 'string' || resourceName.length === 0) {
          diagnostics.push(`颜色索引 ${colorIndex} 缺少资源名称映射`)
          continue
        }

        for (const state of [2, 3]) {
          const fileName = `${resourceName}_${state}.png`
          if (!beadFiles.has(fileName)) {
            diagnostics.push(`颜色索引 ${colorIndex} 缺少 ${fileName}`)
          }
        }
      }

      warnings.push(...diagnostics.map((diagnostic) => prefixWarning(level.id, diagnostic)))
      return {
        level,
        pixel: pixelMetadata,
        initPixel,
        localPixelResource,
        colorCount: colorIndexes.length,
        beadCount: isValidPixelConfigBeadCount(pixel.beadCount)
          ? pixel.beadCount
          : countPixelConfigBeads(initPixel),
        diagnostics
      }
    })

  return { records, warnings }
}

const serializeForInlineScript = (value: unknown): string => JSON.stringify(value)
  .replace(/&/g, '\\u0026')
  .replace(/</g, '\\u003c')
  .replace(/>/g, '\\u003e')
  .replace(/\u2028/g, '\\u2028')
  .replace(/\u2029/g, '\\u2029')

export const renderMainLevelReviewHtml = (
  records: MainLevelReviewRecord[],
  generatedAt: string
): string => {
  const payload = serializeForInlineScript({ generatedAt, records })

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>主线关卡阅览</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
      color: #243044;
      background: #edf1f6;
    }
    * { box-sizing: border-box; }
    body { margin: 0; min-width: 1040px; background: #edf1f6; }
    button, input { font: inherit; }
    .page-shell { width: min(1500px, calc(100% - 40px)); margin: 28px auto 44px; }
    .review-header {
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
      padding: 22px 26px;
      border: 1px solid #dce3ec;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 8px 24px rgba(43, 56, 76, .07);
    }
    h1 { margin: 0 0 10px; font-size: 28px; letter-spacing: .04em; color: #182235; }
    .header-meta { display: flex; flex-wrap: wrap; gap: 8px 22px; color: #657188; font-size: 14px; }
    .page-summary { flex: none; color: #42516a; font-weight: 700; }
    .pager {
      min-height: 46px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-wrap: wrap;
      gap: 8px;
      margin: 18px 0;
    }
    .pager button, .pager input {
      height: 36px;
      border: 1px solid #ccd5e2;
      border-radius: 8px;
      background: #fff;
      color: #34445d;
    }
    .pager button { min-width: 38px; padding: 0 12px; cursor: pointer; }
    .pager button:hover:not(:disabled) { border-color: #5979b8; color: #315a9e; }
    .pager button.is-current { border-color: #446baa; background: #446baa; color: #fff; }
    .pager button:disabled { opacity: .46; cursor: not-allowed; }
    .pager .jump-label { margin-left: 8px; color: #6d788b; font-size: 13px; }
    .pager input { width: 70px; padding: 0 8px; text-align: center; }
    .review-scroll { overflow-x: auto; padding-bottom: 2px; }
    #review-list { min-width: 1000px; display: grid; gap: 16px; scroll-margin-top: 12px; }
    .empty-state {
      padding: 80px 24px;
      border: 1px dashed #b8c3d3;
      border-radius: 14px;
      background: rgba(255,255,255,.72);
      color: #748096;
      text-align: center;
    }
    .level-row {
      min-height: 260px;
      display: grid;
      grid-template-columns: 84px 240px minmax(620px, 1fr);
      gap: 22px;
      align-items: stretch;
      padding: 14px 22px 14px 14px;
      border: 1px solid #dce3ec;
      border-radius: 14px;
      background: #fff;
      box-shadow: 0 5px 18px rgba(47, 60, 80, .055);
    }
    .level-id {
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid #e7ebf1;
      color: #34445d;
      font-size: 24px;
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .preview-panel {
      width: 240px;
      min-height: 230px;
      display: flex;
      align-items: center;
      justify-content: center;
      align-self: center;
      overflow: hidden;
      border: 1px solid #dfe5ed;
      border-radius: 11px;
      background-color: #f8fafc;
      background-image:
        linear-gradient(45deg, #e9edf3 25%, transparent 25%),
        linear-gradient(-45deg, #e9edf3 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, #e9edf3 75%),
        linear-gradient(-45deg, transparent 75%, #e9edf3 75%);
      background-position: 0 0, 0 8px, 8px -8px, -8px 0;
      background-size: 16px 16px;
    }
    .preview-panel canvas { display: block; max-width: 240px; max-height: 240px; image-rendering: pixelated; }
    .preview-message {
      width: 100%;
      padding: 20px;
      background: rgba(248,250,252,.9);
      color: #8a6470;
      text-align: center;
      line-height: 1.6;
    }
    .level-data { min-width: 0; padding: 7px 0; }
    .primary-metrics { display: flex; gap: 12px; margin-bottom: 15px; }
    .metric {
      min-width: 144px;
      padding: 11px 16px;
      border-radius: 10px;
      background: #eaf1fb;
      color: #2b4b78;
    }
    .metric-label { display: block; margin-bottom: 3px; font-size: 12px; font-weight: 650; }
    .metric-value { font-size: 23px; font-weight: 800; font-variant-numeric: tabular-nums; }
    .secondary-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(125px, 1fr));
      gap: 7px 16px;
      color: #677286;
      font-size: 12px;
    }
    .detail { min-width: 0; padding-bottom: 5px; border-bottom: 1px solid #edf0f4; }
    .detail-label { color: #9099a8; margin-right: 7px; }
    .detail-value { color: #596579; overflow-wrap: anywhere; white-space: pre-wrap; }
    .detail-wide { grid-column: 1 / -1; }
    .prop-configs { display: inline; margin: 0; font: inherit; white-space: pre-wrap; }
    .diagnostics {
      margin: 12px 0 0;
      padding: 9px 12px 9px 30px;
      border: 1px solid #efc9aa;
      border-radius: 8px;
      background: #fff6eb;
      color: #9a5725;
      font-size: 12px;
      line-height: 1.55;
    }
    @media (max-width: 1100px) {
      .page-shell { width: calc(100% - 24px); }
      .review-header { align-items: flex-start; }
    }
  </style>
</head>
<body>
  <main class="page-shell">
    <header class="review-header">
      <div>
        <h1>主线关卡阅览</h1>
        <div class="header-meta">
          <span>关卡总数：<strong id="total-levels">0</strong></span>
          <span>生成时间：<strong id="generated-time"></strong></span>
        </div>
      </div>
      <div class="page-summary">第 <span id="current-page">1</span> / <span id="total-pages">1</span> 页</div>
    </header>
    <nav class="pager" id="top-pager" aria-label="顶部翻页"></nav>
    <div class="review-scroll">
      <section id="review-list" aria-live="polite"></section>
    </div>
    <nav class="pager" id="bottom-pager" aria-label="底部翻页"></nav>
  </main>
  <script>
    (function () {
      'use strict';
      const payload = ${payload};
      const records = payload.records;
      const PAGE_SIZE = 12;
      const totalPages = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
      const imagePromiseCache = new Map();
      const list = document.getElementById('review-list');
      const pagerElements = [
        document.getElementById('top-pager'),
        document.getElementById('bottom-pager')
      ];
      let currentPage = 1;

      function escapeHtml(value) {
        const text = value === null || value === undefined || value === '' ? '—' : String(value);
        return text.replace(/[&<>"']/g, function (character) {
          return {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
          }[character];
        });
      }

      function formatValue(value) {
        if (value === null || value === undefined || value === '') return '—';
        if (Array.isArray(value)) return JSON.stringify(value);
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
      }

      function prettyJson(value) {
        const json = JSON.stringify(value, null, 2);
        return json === undefined ? '—' : json;
      }

      function detail(label, value, className) {
        const classes = className ? 'detail ' + className : 'detail';
        return '<div class="' + classes + '"><span class="detail-label">' + label
          + '</span><span class="detail-value">' + escapeHtml(formatValue(value)) + '</span></div>';
      }

      function diagnosticsHtml(diagnostics) {
        if (!Array.isArray(diagnostics) || diagnostics.length === 0) return '';
        return '<ul class="diagnostics">' + diagnostics.map(function (diagnostic) {
          return '<li>' + escapeHtml(diagnostic) + '</li>';
        }).join('') + '</ul>';
      }

      function rowHtml(record, recordIndex) {
        const level = record.level || {};
        const pixel = record.pixel || {};
        const hasMatrix = Array.isArray(record.initPixel) && record.initPixel.length > 0;
        const preview = hasMatrix
          ? '<canvas data-preview-index="' + recordIndex + '" aria-label="豆子预览"></canvas>'
          : '<div class="preview-message">预览矩阵缺失，无法显示豆子预览</div>';
        const propConfigs = prettyJson(Array.isArray(level.propConfigs) ? level.propConfigs : []);

        return '<article class="level-row">'
          + '<div class="level-id">' + escapeHtml(level.id) + '</div>'
          + '<div class="preview-panel">' + preview + '</div>'
          + '<div class="level-data">'
          + '<div class="primary-metrics">'
          + '<div class="metric"><span class="metric-label">颜色数量</span><span class="metric-value">'
          + escapeHtml(record.colorCount) + '</span></div>'
          + '<div class="metric"><span class="metric-label">豆子数量</span><span class="metric-value">'
          + escapeHtml(record.beadCount) + '</span></div>'
          + '</div>'
          + '<div class="secondary-grid">'
          + detail('缩略图', level.thumbnail)
          + detail('类型', level.type)
          + detail('难度', level.difficulty)
          + detail('pixelImageId', level.pixelImageId)
          + detail('宽高', level.widthHeight)
          + detail('最大槽位', level.storageMaxSlots)
          + detail('槽位列数', level.storageCols)
          + detail('初始槽位', level.storageInitialSlots)
          + detail('广告解锁增量', level.adUnlockIncrement)
          + detail('初始时限', level.initialTimeLimit)
          + detail('广告时间增量', level.adTimeIncrement)
          + detail('复活次数', level.reviveCount)
          + '<div class="detail detail-wide"><span class="detail-label">道具配置</span>'
          + '<pre class="detail-value prop-configs">' + escapeHtml(propConfigs) + '</pre></div>'
          + detail('像素图名称', pixel.name)
          + detail('主题', pixel.theme)
          + detail('品质', pixel.quality)
          + detail('图片类型', pixel.imageType)
          + detail('相册 ID', pixel.albumId)
          + detail('像素图难度', pixel.difficulty)
          + '</div>'
          + diagnosticsHtml(record.diagnostics)
          + '</div>'
          + '</article>';
      }

      function loadImage(url) {
        if (!imagePromiseCache.has(url)) {
          imagePromiseCache.set(url, new Promise(function (resolve) {
            const image = new Image();
            image.onload = function () { resolve(image); };
            image.onerror = function () { resolve(null); };
            image.src = url;
          }));
        }
        return imagePromiseCache.get(url);
      }

      async function drawBeadPreview(canvas, record) {
        const matrix = record.initPixel;
        const rowCount = matrix.length;
        const columnCount = matrix.reduce(function (maximum, row) {
          return Math.max(maximum, Array.isArray(row) ? row.length : 0);
        }, 0);
        const baseSize = 25;
        const topSize = 21;
        const topOffset = (baseSize - topSize) / 2;
        canvas.width = Math.max(1, columnCount * baseSize);
        canvas.height = Math.max(1, rowCount * baseSize);
        const displayScale = Math.min(240 / canvas.width, 240 / canvas.height);
        canvas.style.width = Math.max(1, Math.round(canvas.width * displayScale)) + 'px';
        canvas.style.height = Math.max(1, Math.round(canvas.height * displayScale)) + 'px';
        const context = canvas.getContext('2d');
        if (!context) return;
        context.clearRect(0, 0, canvas.width, canvas.height);

        for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
          const row = Array.isArray(matrix[rowIndex]) ? matrix[rowIndex] : [];
          for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
            const colorIndex = row[columnIndex];
            if (!Number.isInteger(colorIndex) || colorIndex < 0) continue;
            const resourceName = record.localPixelResource[colorIndex];
            if (typeof resourceName !== 'string' || resourceName.length === 0) continue;
            const baseUrl = 'assets/beads/' + encodeURIComponent(resourceName) + '_2.png';
            const topUrl = 'assets/beads/' + encodeURIComponent(resourceName) + '_3.png';
            const layers = await Promise.all([loadImage(baseUrl), loadImage(topUrl)]);
            const x = columnIndex * baseSize;
            const y = rowIndex * baseSize;
            if (layers[0]) context.drawImage(layers[0], x, y, baseSize, baseSize);
            if (layers[1]) context.drawImage(layers[1], x + topOffset, y + topOffset, topSize, topSize);
          }
        }
      }

      function renderPager(pager) {
        const firstNearbyPage = Math.max(1, currentPage - 2);
        const lastNearbyPage = Math.min(totalPages, currentPage + 2);
        const controls = [
          '<button type="button" data-action="previous"' + (currentPage === 1 ? ' disabled' : '') + '>上一页</button>'
        ];
        for (let page = firstNearbyPage; page <= lastNearbyPage; page += 1) {
          controls.push('<button type="button" data-action="page" data-page="' + page + '"'
            + (page === currentPage ? ' class="is-current" disabled aria-current="page"' : '')
            + '>' + page + '</button>');
        }
        controls.push('<button type="button" data-action="next"'
          + (currentPage === totalPages ? ' disabled' : '') + '>下一页</button>');
        controls.push('<span class="jump-label">跳至</span>');
        controls.push('<input data-role="jump-input" type="number" min="1" max="' + totalPages
          + '" value="' + currentPage + '" aria-label="跳转页码">');
        controls.push('<button type="button" data-action="jump">跳转</button>');
        pager.innerHTML = controls.join('');
      }

      function renderPage() {
        const start = (currentPage - 1) * PAGE_SIZE;
        const pageRecords = records.slice(start, start + PAGE_SIZE);
        list.innerHTML = pageRecords.length === 0
          ? '<div class="empty-state">暂无关卡数据</div>'
          : pageRecords.map(function (record, index) {
            return rowHtml(record, start + index);
          }).join('');
        pagerElements.forEach(renderPager);
        document.getElementById('current-page').textContent = String(currentPage);
        pageRecords.forEach(function (record, index) {
          if (!Array.isArray(record.initPixel) || record.initPixel.length === 0) return;
          const canvas = list.querySelector('canvas[data-preview-index="' + (start + index) + '"]');
          if (canvas) void drawBeadPreview(canvas, record);
        });
      }

      function navigateTo(requestedPage, scrollToList) {
        const numericPage = Number.isFinite(requestedPage) ? Math.trunc(requestedPage) : currentPage;
        currentPage = Math.min(totalPages, Math.max(1, numericPage));
        renderPage();
        if (scrollToList) {
          requestAnimationFrame(function () {
            list.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
        }
      }

      function handlePagerAction(event) {
        const button = event.target.closest('button[data-action]');
        if (!button || button.disabled) return;
        const action = button.dataset.action;
        const pager = event.currentTarget;
        if (action === 'previous') navigateTo(currentPage - 1, true);
        if (action === 'next') navigateTo(currentPage + 1, true);
        if (action === 'page') navigateTo(Number(button.dataset.page), true);
        if (action === 'jump') {
          const input = pager.querySelector('[data-role="jump-input"]');
          navigateTo(Number(input.value), true);
        }
      }

      pagerElements.forEach(function (pager) {
        pager.addEventListener('click', handlePagerAction);
        pager.addEventListener('keydown', function (event) {
          if (event.key !== 'Enter' || !event.target.matches('[data-role="jump-input"]')) return;
          event.preventDefault();
          navigateTo(Number(event.target.value), true);
        });
      });
      document.getElementById('total-levels').textContent = String(records.length);
      document.getElementById('generated-time').textContent = String(payload.generatedAt);
      document.getElementById('total-pages').textContent = String(totalPages);
      renderPage();
    }());
  </script>
</body>
</html>
`
}

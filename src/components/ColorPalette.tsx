import React, { useRef } from 'react';

interface ColorPaletteProps {
  currentColor: string;
  onColorChange: (color: string) => void;
  recentColors: string[];
  defaultColors?: string[];
  defaultColorsTitle?: string;
}

export const ColorPalette: React.FC<ColorPaletteProps> = ({
  currentColor,
  onColorChange,
  recentColors,
  defaultColors: providedDefaultColors,
  defaultColorsTitle = '默认颜色',
}) => {
  const colorInputRef = useRef<HTMLInputElement>(null);

  // 预定义的颜色
  const fallbackDefaultColors = [
    '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF',
    '#FFFF00', '#FF00FF', '#00FFFF', '#808080', '#800000',
    '#808000', '#008000', '#800080', '#008080', '#000080',
  ];
  const defaultColors = providedDefaultColors ?? fallbackDefaultColors;

  const handleColorPickerClick = () => {
    if (colorInputRef.current) {
      colorInputRef.current.value = currentColor;
      colorInputRef.current.click();
    }
  };

  return (
    <div className="color-palette">
      <div className="current-color">
        <div
          className="color-preview"
          style={{ backgroundColor: currentColor }}
          onClick={handleColorPickerClick}
          title="点击打开颜色选择器"
        />
        <input
          ref={colorInputRef}
          type="color"
          value={currentColor}
          onChange={(e) => onColorChange(e.target.value)}
          style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }}
        />
      </div>

      <div className="color-section">
        <h4>最近使用的颜色</h4>
        <div className="color-grid">
          {recentColors.map((color, index) => (
            <div
              key={`recent-${index}`}
              className="color-item"
              style={{ backgroundColor: color }}
              onClick={() => onColorChange(color)}
              title={color}
            />
          ))}
        </div>
      </div>

      <div className="color-section">
        <h4>{defaultColorsTitle}</h4>
        <div className="color-grid">
          {defaultColors.map((color, index) => (
            <div
              key={`default-${index}`}
              className="color-item"
              style={{ backgroundColor: color }}
              onClick={() => onColorChange(color)}
              title={color}
            />
          ))}
        </div>
      </div>

      <style>{`
        .color-palette {
          background: #f5f5f5;
          border-radius: 8px;
          padding: 12px;
          width: 200px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }

        .current-color {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 12px;
          position: relative;
        }

        .color-preview {
          width: 40px;
          height: 40px;
          border-radius: 4px;
          border: 2px solid #ddd;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          position: relative;
        }

        .color-preview:hover {
          transform: scale(1.05);
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        }

        .color-preview::after {
          content: '🎨';
          position: absolute;
          right: -8px;
          top: -8px;
          background: white;
          border-radius: 50%;
          padding: 2px;
          font-size: 12px;
          opacity: 0;
          transition: opacity 0.2s;
        }

        .color-preview:hover::after {
          opacity: 1;
        }

        .color-section {
          margin-bottom: 12px;
        }

        .color-section h4 {
          margin: 0 0 8px 0;
          font-size: 14px;
          color: #666;
        }

        .color-grid {
          display: grid;
          grid-template-columns: repeat(5, 1fr);
          gap: 4px;
        }

        .color-item {
          width: 100%;
          aspect-ratio: 1;
          border-radius: 4px;
          border: 1px solid #ddd;
          cursor: pointer;
          transition: transform 0.1s;
        }

        .color-item:hover {
          transform: scale(1.1);
          z-index: 1;
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        }
      `}</style>
    </div>
  );
};

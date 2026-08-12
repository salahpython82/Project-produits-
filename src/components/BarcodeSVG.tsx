import React from 'react';

interface BarcodeSVGProps {
  value: string;
  width?: number; // width multiplier for each bar
  height?: number; // vertical height of the barcode
  showText?: boolean;
}

const CODE39_MAP: Record<string, string> = {
  '0': '101001101101', '1': '110100101011', '2': '101100101011', '3': '110110010101',
  '4': '101001101011', '5': '110100110101', '6': '101100110101', '7': '101001011011',
  '8': '110100101101', '9': '101100101101', 'A': '110101001011', 'B': '101101001011',
  'C': '110110100101', 'D': '101011001011', 'E': '110101100101', 'F': '101101100101',
  'G': '101010011011', 'H': '110101001101', 'I': '101101001101', 'J': '101011001101',
  'K': '110101010011', 'L': '101101010011', 'M': '110110101001', 'N': '101011010011',
  'O': '110101101001', 'P': '101101101001', 'Q': '101010110011', 'R': '110101011001',
  'S': '101101011001', 'T': '101011011001', 'U': '110010101011', 'V': '100110101011',
  'W': '110011010101', 'X': '100101101011', 'Y': '110010110101', 'Z': '100110110101',
  '-': '100101011011', '.': '110010101101', ' ': '100110101101', '*': '100101101101',
  '$': '100100100101', '/': '100100101001', '+': '100101001001', '%': '101001001001'
};

export const BarcodeSVG: React.FC<BarcodeSVGProps> = ({
  value,
  width = 2,
  height = 50,
  showText = true,
}) => {
  // If no value provided, return empty space
  if (!value) return null;

  // Code 39 requires uppercase, prepended/appended with *
  const rawValue = value.trim().toUpperCase();
  
  // Sanitize the input - keep only characters we can render
  let sanitized = '';
  for (let i = 0; i < rawValue.length; i++) {
    const char = rawValue[i];
    if (CODE39_MAP[char]) {
      sanitized += char;
    } else {
      sanitized += '-'; // Fallback for unsupported chars
    }
  }

  // Final string includes start and stop characters
  const finalString = `*${sanitized}*`;
  
  // Build the full binary representation of bars and spaces
  let binaryString = '';
  for (let i = 0; i < finalString.length; i++) {
    const char = finalString[i];
    binaryString += CODE39_MAP[char] || '';
    // Add small inter-character space (white gap)
    if (i < finalString.length - 1) {
      binaryString += '0';
    }
  }

  const svgWidth = binaryString.length * width;
  const padding = 15;
  const totalSvgWidth = svgWidth + padding * 2;
  const totalSvgHeight = height + (showText ? 25 : 0) + 15;

  // Generate rect JSX elements
  const rects: React.ReactElement[] = [];
  let isDrawing = false;
  let runLength = 0;
  let startX = 0;

  for (let i = 0; i < binaryString.length; i++) {
    const isBar = binaryString[i] === '1';

    if (isBar) {
      if (!isDrawing) {
        isDrawing = true;
        startX = i;
        runLength = 1;
      } else {
        runLength++;
      }
    } else {
      if (isDrawing) {
        rects.push(
          <rect
            key={`bar-${startX}`}
            x={padding + startX * width}
            y={10}
            width={runLength * width}
            height={height}
            fill="#0f172a" // elegant deep dark slate color
          />
        );
        isDrawing = false;
        runLength = 0;
      }
    }
  }

  // If we ended with a bar drawing
  if (isDrawing) {
    rects.push(
      <rect
        key={`bar-${startX}`}
        x={padding + startX * width}
        y={10}
        width={runLength * width}
        height={height}
        fill="#0f172a"
      />
    );
  }

  return (
    <div id="barcode-display-wrapper" className="flex flex-col items-center justify-center bg-white p-2.5 rounded-xl border border-slate-100 shadow-xs max-w-full overflow-hidden select-none">
      <svg
        id={`barcode-svg-${value}`}
        width="100%"
        height={totalSvgHeight}
        viewBox={`0 0 ${totalSvgWidth} ${totalSvgHeight}`}
        preserveAspectRatio="xMidYMid meet"
        className="max-h-[110px]"
      >
        {/* Background */}
        <rect width={totalSvgWidth} height={totalSvgHeight} fill="#ffffff" rx={8} />

        {/* Drawn Barcode Lines */}
        <g id="barcode-lines-group">
          {rects}
        </g>

        {/* Text presentation */}
        {showText && (
          <text
            id={`barcode-text-${value}`}
            x={totalSvgWidth / 2}
            y={height + 25}
            textAnchor="middle"
            className="font-mono text-xs font-semibold tracking-widest fill-slate-700"
          >
            {value.toUpperCase()}
          </text>
        )}
      </svg>
    </div>
  );
};

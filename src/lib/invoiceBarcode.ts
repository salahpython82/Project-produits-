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

export function getBarcodeSVGString(value: string, width = 1.2, height = 35): string {
  if (!value) return '';
  const rawValue = value.trim().toUpperCase();
  let sanitized = '';
  
  // Keep only compatible characters
  for (let i = 0; i < rawValue.length; i++) {
    const char = rawValue[i];
    if (CODE39_MAP[char]) {
      sanitized += char;
    } else {
      sanitized += '-'; // Fallback
    }
  }

  // Prepend & append star character for Code-39 boundaries
  const finalString = `*${sanitized}*`;
  let binaryString = '';
  
  for (let i = 0; i < finalString.length; i++) {
    const char = finalString[i];
    binaryString += CODE39_MAP[char] || '';
    if (i < finalString.length - 1) {
      binaryString += '0'; // Inter-character gap
    }
  }

  const svgWidth = binaryString.length * width;
  const padding = 15;
  const totalSvgWidth = svgWidth + padding * 2;
  const totalSvgHeight = height + 30; // height + spacing for text indicator

  let rects = '';
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
        rects += `<rect x="${padding + startX * width}" y="8" width="${runLength * width}" height="${height}" fill="#0f172a" />`;
        isDrawing = false;
        runLength = 0;
      }
    }
  }
  if (isDrawing) {
    rects += `<rect x="${padding + startX * width}" y="8" width="${runLength * width}" height="${height}" fill="#0f172a" />`;
  }

  return `
    <svg width="${totalSvgWidth}" height="${totalSvgHeight}" viewBox="0 0 ${totalSvgWidth} ${totalSvgHeight}" style="background-color: transparent" xmlns="http://www.w3.org/2000/svg">
      <style>
        .barcode-label-text {
          font-family: monospace;
          font-size: 10px;
          fill: #475569;
          font-weight: bold;
          letter-spacing: 2px;
          text-anchor: middle;
        }
      </style>
      ${rects}
      <text x="${totalSvgWidth / 2}" y="${height + 22}" class="barcode-label-text">${sanitized}</text>
    </svg>
  `;
}

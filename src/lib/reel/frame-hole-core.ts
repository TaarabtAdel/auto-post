export type FrameHole = {
  xPercent: number;
  yPercent: number;
  wPercent: number;
  hPercent: number;
};

const BLACK = 22;

export function largestBlackRect(
  grid: Uint8Array,
  cols: number,
  rows: number
): FrameHole {
  const heights = new Array<number>(cols).fill(0);
  let best = { area: 0, x: 0, y: 0, w: 0, h: 0 };

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      heights[x] = grid[y * cols + x] ? heights[x] + 1 : 0;
    }
    const stack: number[] = [];
    for (let i = 0; i <= cols; i++) {
      const h = i === cols ? 0 : heights[i];
      while (stack.length && heights[stack[stack.length - 1]] > h) {
        const height = heights[stack.pop()!];
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = i - left;
        const area = height * width;
        if (area > best.area) {
          best = { area, x: left, y: y - height + 1, w: width, h: height };
        }
      }
      stack.push(i);
    }
  }

  if (best.area < 80) {
    return { xPercent: 8, yPercent: 26, wPercent: 84, hPercent: 42 };
  }

  return {
    xPercent: (best.x / cols) * 100,
    yPercent: (best.y / rows) * 100,
    wPercent: (best.w / cols) * 100,
    hPercent: (best.h / rows) * 100,
  };
}

export function detectFrameHoleFromImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number
): FrameHole {
  const grid = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    grid[i] =
      data[o] < BLACK && data[o + 1] < BLACK && data[o + 2] < BLACK ? 1 : 0;
  }
  return largestBlackRect(grid, width, height);
}

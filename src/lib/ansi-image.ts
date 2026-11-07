const ALPHA_CUTOFF = 64;
const images = new Map<string, Promise<HTMLImageElement>>();

function loadImage(src: string) {
  let p = images.get(src);
  if (!p) {
    const img = new Image();
    img.src = src;
    p = img.decode().then(() => img);
    p.catch(() => images.delete(src));
    images.set(src, p);
  }
  return p;
}

function pixels(source: CanvasImageSource, sx: number, sy: number, sw: number, sh: number, w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h).data;
}

function contentBox(img: HTMLImageElement) {
  const { naturalWidth: w, naturalHeight: h } = img;
  const data = pixels(img, 0, 0, w, h, w, h);
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > ALPHA_CUTOFF) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? { x: 0, y: 0, w, h } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

export async function imageToAnsi(src: string, width: number, indent = 0): Promise<string> {
  const img = await loadImage(src);
  const box = contentBox(img);
  const height = Math.max(2, Math.round((width * box.h) / box.w / 2) * 2);
  const data = pixels(img, box.x, box.y, box.w, box.h, width, height);

  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return data[i + 3] > ALPHA_CUTOFF ? `${data[i]};${data[i + 1]};${data[i + 2]}` : null;
  };

  const lines: string[] = [];
  for (let y = 0; y < height; y += 2) {
    let line = " ".repeat(indent);
    for (let x = 0; x < width; x++) {
      const top = px(x, y);
      const bottom = px(x, y + 1);
      if (top && bottom) line += `\x1b[38;2;${top};48;2;${bottom}m▀`;
      else if (top) line += `\x1b[49;38;2;${top}m▀`;
      else if (bottom) line += `\x1b[49;38;2;${bottom}m▄`;
      else line += "\x1b[0m ";
    }
    lines.push(line + "\x1b[0m");
  }
  return lines.join("\r\n");
}

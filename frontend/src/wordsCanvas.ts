export type WordsConfig = {
  text: string;
  font: string;
  size: number;
  align: "left" | "center" | "right";
  ratio: "4:5" | "1:1" | "9:16";
  colors: { text: string; highlight: string | null };
  background: {
    kind: "solid" | "gradient" | "texture" | "image";
    color: string;
    color2: string;
    asset: "coast" | "sky" | "forest";
    photo: string | null;
    overlay: number;
  };
};
export const fonts: Record<
  string,
  { label: string; family: string; weight: string }
> = {
  upright: {
    label: "Upright Regular",
    family: '"Upright Regular", cursive',
    weight: "400",
  },
  sans: { label: "Sans", family: "Arial, sans-serif", weight: "600" },
  meme: {
    label: "Condensed meme (outline)",
    family: 'Impact, "Arial Narrow", sans-serif',
    weight: "900",
  },
  serif: { label: "Serif", family: "Georgia, serif", weight: "400" },
  handwritten: {
    label: "Handwritten",
    family: '"Segoe Print", "Comic Sans MS", cursive',
    weight: "400",
  },
  mono: { label: "Mono", family: '"Courier New", monospace', weight: "600" },
  rounded: {
    label: "Rounded",
    family: '"Trebuchet MS", sans-serif',
    weight: "700",
  },
};
export const initialWords: WordsConfig = {
  text: "",
  font: "upright",
  size: 88,
  align: "center",
  ratio: "4:5",
  colors: { text: "#ffffff", highlight: null },
  background: {
    kind: "solid",
    color: "#183247",
    color2: "#546e87",
    asset: "coast",
    photo: null,
    overlay: 0.35,
  },
};
export const templates: Record<string, Partial<WordsConfig>> = {
  "Hot take": {
    text: "Hot take: your next little idea is worth sharing.",
    font: "meme",
    colors: { text: "#ffffff", highlight: null },
    background: { ...initialWords.background, color: "#a43c29" },
  },
  Quote: {
    text: "Make room for the things that make you curious.",
    font: "serif",
    background: {
      ...initialWords.background,
      kind: "gradient",
      color: "#1b3258",
      color2: "#6a3e67",
    },
  },
  Confession: {
    text: "A little confession...",
    font: "mono",
    align: "left",
    background: { ...initialWords.background, color: "#25252c" },
  },
  "Note to self": {
    text: "Note to self: one small step still counts.",
    font: "handwritten",
    colors: { text: "#242933", highlight: null },
    background: {
      ...initialWords.background,
      kind: "texture",
      color: "#f2e6c9",
    },
  },
};
export function loadBackground(
  config: WordsConfig,
): Promise<HTMLImageElement | null> {
  if (config.background.kind !== "image") return Promise.resolve(null);
  const src =
    config.background.photo ||
    `/word-backgrounds/${config.background.asset}.svg`;
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(new Error("The background could not be loaded."));
    img.src = src;
  });
}
function luminance(color: string) {
  const values = [1, 3, 5]
    .map((i) => parseInt(color.slice(i, i + 2), 16) / 255)
    .map((v) =>
      v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
    );
  return 0.2126 * values[0] + 0.7152 * values[1] + 0.0722 * values[2];
}
export function contrast(a: string, b: string) {
  const x = luminance(a),
    y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function wrapped(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word;
      if (context.measureText(next).width <= width) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = "";
      for (const char of word) {
        if (context.measureText(line + char).width > width && line) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line);
  }
  return lines;
}
export function drawWords(
  canvas: HTMLCanvasElement,
  config: WordsConfig,
  image: HTMLImageElement | null,
) {
  const width = 1080,
    height =
      config.ratio === "1:1" ? 1080 : config.ratio === "9:16" ? 1920 : 1350;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable in this browser.");
  const bg = config.background;
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, width, height);
  if (bg.kind === "gradient") {
    const g = ctx.createLinearGradient(0, 0, width, height);
    g.addColorStop(0, bg.color);
    g.addColorStop(1, bg.color2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  }
  if (bg.kind === "texture") {
    ctx.strokeStyle = "rgba(0,0,0,.10)";
    ctx.lineWidth = 2;
    for (let y = 40; y < height; y += 40) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,.1)";
    for (let x = 16; x < width; x += 32)
      for (let y = 16; y < height; y += 32) ctx.fillRect(x, y, 2, 2);
  }
  if (bg.kind === "image" && image) {
    const scale = Math.max(width / image.width, height / image.height);
    const w = image.width * scale,
      h = image.height * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
    ctx.fillStyle = `rgba(0,0,0,${bg.overlay})`;
    ctx.fillRect(0, 0, width, height);
  }
  const pad = 88,
    maxWidth = width - pad * 2,
    maxHeight = height - pad * 2;
  let size = config.size;
  const font = fonts[config.font] || fonts.sans;
  const setFont = () => {
    ctx.font = `${font.weight} ${size}px ${font.family}`;
  };
  setFont();
  let lines = wrapped(ctx, config.text, maxWidth);
  while (
    size > 16 &&
    (lines.length * size * 1.35 > maxHeight ||
      lines.some((line) => ctx.measureText(line).width > maxWidth))
  ) {
    size -= 2;
    setFont();
    lines = wrapped(ctx, config.text, maxWidth);
  }
  let minContrast = 21;
  if (config.colors.highlight)
    minContrast = contrast(config.colors.text, config.colors.highlight);
  else
    for (let x = pad; x < width - pad; x += 100)
      for (let y = pad; y < height - pad; y += 100) {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        const hex =
          "#" +
          [...pixel]
            .slice(0, 3)
            .map((v) => v.toString(16).padStart(2, "0"))
            .join("");
        minContrast = Math.min(minContrast, contrast(config.colors.text, hex));
      }
  ctx.direction = /[\u0590-\u08ff]/.test(config.text) ? "rtl" : "ltr";
  ctx.textAlign = config.align;
  ctx.textBaseline = "middle";
  const x =
    config.align === "left"
      ? pad
      : config.align === "right"
        ? width - pad
        : width / 2;
  const lineHeight = size * 1.35;
  const start = (height - (lines.length - 1) * lineHeight) / 2;
  // Paint highlights first, with a full line-height so adjacent lines join.
  if (config.colors.highlight) {
    ctx.fillStyle = config.colors.highlight;
    lines.forEach((line, i) => {
      const measured = ctx.measureText(line).width;
      const left =
        config.align === "left"
          ? x
          : config.align === "right"
            ? x - measured
            : x - measured / 2;
      ctx.beginPath();
      ctx.roundRect(
        left - 24,
        start + i * lineHeight - lineHeight / 2 - 1,
        measured + 48,
        lineHeight + 2,
        20,
      );
      ctx.fill();
    });
  }
  lines.forEach((line, i) => {
    const y = start + i * lineHeight;
    if (config.font === "meme") {
      ctx.strokeStyle = "#000000";
      ctx.lineWidth = Math.max(3, size * 0.08);
      ctx.lineJoin = "round";
      ctx.strokeText(line, x, y);
    }
    ctx.fillStyle = config.colors.text;
    ctx.fillText(line, x, y);
  });
  return {
    size,
    contrast: minContrast,
    lines: lines.length,
    lineHeight,
    width,
    height,
  };
}
export async function photoData(file: File) {
  if (
    file.size > 8 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  )
    throw new Error("Choose a JPG, PNG or WebP smaller than 8 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("This image could not be read."));
      image.src = url;
    });
    const scale = Math.min(1, 800 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    for (const quality of [0.8, 0.65, 0.5, 0.35]) {
      const data = c.toDataURL("image/jpeg", quality);
      if (data.length <= 280000) return data;
    }
    throw new Error("Choose a smaller photo for an editable background.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
export const languageWarning = (text: string) =>
  /\b(fuck(?:ing)?|shit|bitch|asshole|nigger|faggot)\b/i.test(text);

let uprightLoading: Promise<void> | undefined;
export function ensureWordsFont() {
  if (!uprightLoading)
    uprightLoading = document.fonts
      .load('400 88px "Upright Regular"')
      .then((loaded) => {
        if (!loaded.length)
          throw new Error(
            "Upright Regular could not load. Please refresh before publishing.",
          );
      })
      .catch((error) => {
        uprightLoading = undefined;
        throw error;
      });
  return uprightLoading;
}
export function readableWords(
  config: WordsConfig,
  image: HTMLImageElement | null,
  fix = false,
): WordsConfig {
  const canvas = document.createElement("canvas");
  const white = { ...config, colors: { ...config.colors, text: "#ffffff" } },
    dark = { ...config, colors: { ...config.colors, text: "#111519" } };
  const a = drawWords(canvas, white, image).contrast,
    b = drawWords(canvas, dark, image).contrast;
  let result = a >= b ? white : dark;
  if (fix && Math.max(a, b) < 4.5 && result.background.kind === "image") {
    result = {
      ...result,
      colors: { ...result.colors, text: "#ffffff" },
      background: { ...result.background },
    };
    while (
      result.background.overlay < 0.9 &&
      drawWords(canvas, result, image).contrast < 4.5
    )
      result.background.overlay = Math.min(
        0.9,
        result.background.overlay + 0.05,
      );
  } else if (fix && Math.max(a, b) < 4.5) {
    result = { ...result, colors: { text: "#ffffff", highlight: "#111519" } };
  }
  return result;
}
export function isWordsConfig(value: unknown): value is WordsConfig {
  if (!value || typeof value !== "object") return false;
  const c = value as WordsConfig;
  return (
    typeof c.text === "string" &&
    c.text.length <= 280 &&
    typeof c.font === "string" &&
    Object.hasOwn(fonts, c.font) &&
    typeof c.size === "number" &&
    c.size >= 24 &&
    c.size <= 240 &&
    ["left", "center", "right"].includes(c.align) &&
    ["4:5", "1:1", "9:16"].includes(c.ratio) &&
    !!c.colors &&
    /^#[0-9a-f]{6}$/i.test(c.colors.text) &&
    (c.colors.highlight === null ||
      /^#[0-9a-f]{6}$/i.test(c.colors.highlight)) &&
    !!c.background &&
    ["solid", "gradient", "texture", "image"].includes(c.background.kind) &&
    /^#[0-9a-f]{6}$/i.test(c.background.color) &&
    /^#[0-9a-f]{6}$/i.test(c.background.color2) &&
    ["coast", "sky", "forest"].includes(c.background.asset) &&
    typeof c.background.overlay === "number" &&
    c.background.overlay >= 0 &&
    c.background.overlay <= 0.9 &&
    (c.background.photo === null ||
      (typeof c.background.photo === "string" &&
        c.background.photo.length <= 280000 &&
        /^data:image\/(jpeg|png|webp);base64,/.test(c.background.photo)))
  );
}

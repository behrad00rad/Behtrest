import { useEffect, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Check,
  Image as ImageIcon,
  Palette,
  RectangleHorizontal,
  RectangleVertical,
  Square,
  Type,
  Upload,
  X,
} from "lucide-react";
import { request, upload, ApiError } from "./api";
import { useAuth } from "./auth";
import { ErrorNotice, Modal, message } from "./components";
import { notify } from "./ProductUI";
import Owl from "./Owl";
import type { Post } from "./types";
import {
  drawWords,
  ensureWordsFont,
  fonts,
  initialWords,
  isWordsConfig,
  languageWarning,
  loadBackground,
  photoData,
  readableWords,
  templates,
} from "./wordsCanvas";
import type { WordsConfig } from "./wordsCanvas";
import { WordsColors, WordsSlider, WordsSwitch } from "./WordsControls";
import { useWordsLeaveGuard } from "./wordsLeaveGuard";

type Details = {
  title: string;
  tags: string[];
  context: string;
  alt: string;
  altEdited: boolean;
  downloads: boolean;
};
type Draft = { version: 1; config: WordsConfig; details: Details; step: 1 | 2 };
const suggestions = [
  "thoughts",
  "words",
  "quotes",
  "humor",
  "poetry",
  "self-care",
  "creativity",
  "life",
];
const backgrounds = [
  "#183247",
  "#111519",
  "#f2e6c9",
  "#a43c29",
  "#adc8af",
  "#d9b8df",
];
function readDraft(key: string, original: Draft): Draft {
  try {
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 350000) return original;
    const value = JSON.parse(raw) as Draft;
    const d = value.details;
    if (
      value.version !== 1 ||
      !isWordsConfig(value.config) ||
      !d ||
      typeof d.title !== "string" ||
      d.title.length > 200 ||
      typeof d.context !== "string" ||
      d.context.length > 5000 ||
      typeof d.alt !== "string" ||
      d.alt.length > 500 ||
      !Array.isArray(d.tags) ||
      d.tags.length > 8 ||
      d.tags.some(
        (tag) => typeof tag !== "string" || !/^[a-z0-9_-]{1,40}$/.test(tag),
      ) ||
      typeof d.downloads !== "boolean" ||
      typeof d.altEdited !== "boolean"
    )
      return original;
    return { ...value, step: value.step === 2 ? 2 : 1 };
  } catch {
    return original;
  }
}
function normalizeTag(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9_-]/g, "")
    .slice(0, 40);
}

export default function WordsEditor() {
  const [params] = useSearchParams();
  const id = params.get("edit");
  const { user } = useAuth();
  const [post, setPost] = useState<Post | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    if (!id) {
      setPost(null);
      setError("");
      return;
    }
    const controller = new AbortController();
    void request<Post>(
      `/posts/${id}/`,
      "GET",
      undefined,
      true,
      controller.signal,
    )
      .then(setPost)
      .catch((e) => {
        if (!controller.signal.aborted) setError(message(e));
      });
    return () => controller.abort();
  }, [id]);
  if (id && (!post || String(post.id) !== id))
    return (
      <main className="collection-page words-page">
        <Owl state="think" />
        <ErrorNotice error={error} />
        <p>Opening Words...</p>
      </main>
    );
  if (
    id &&
    post &&
    (post.owner.id !== user?.id || post.type !== "text_card" || !post.config)
  )
    return (
      <main className="collection-page words-page">
        <p>You can only edit your own Words cards.</p>
      </main>
    );
  return (
    <WordsForm
      key={`${user?.id}:${id || "new"}`}
      post={id ? post || undefined : undefined}
      userId={user?.id || 0}
    />
  );
}
function WordsForm({ post, userId }: { post?: Post; userId: number }) {
  const draftKey = `behtrest:words-draft:${userId}:${post?.id || "new"}`;
  const original = useRef<Draft>({
    version: 1,
    config: structuredClone(post?.config || initialWords),
    details: {
      title: post?.title || "",
      tags: post?.tags || [],
      context: post?.description || "",
      alt: post?.alt_text || "",
      altEdited: !!post?.alt_text && post.alt_text !== post.config?.text,
      downloads: post?.allow_download !== false,
    },
    step: 1,
  });
  const [draft] = useState(() => readDraft(draftKey, original.current));
  const [config, setConfig] = useState(draft.config),
    [details, setDetails] = useState(draft.details),
    [step, setStep] = useState<1 | 2>(draft.step);
  const [active, setActive] = useState<
      "Style" | "Color" | "Background" | "Format"
    >("Style"),
    [sheet, setSheet] = useState(false),
    [mobile, setMobile] = useState(
      () => matchMedia("(max-width: 767px)").matches,
    );
  const [image, setImage] = useState<HTMLImageElement | null>(null),
    [loading, setLoading] = useState(false),
    [fontReady, setFontReady] = useState(false),
    [busy, setBusy] = useState(false),
    [published, setPublished] = useState(false),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(
      draft !== original.current ? "Draft restored" : "",
    );
  const [pendingTag, setPendingTag] = useState(""),
    [altOpen, setAltOpen] = useState(false),
    [metrics, setMetrics] = useState({
      size: config.size,
      contrast: 21,
      lines: 1,
      lineHeight: config.size * 1.35,
      width: 1080,
      height: 1350,
    });
  const loadedImage = useRef("");
  const canvas = useRef<HTMLCanvasElement>(null),
    card = useRef<HTMLDivElement>(null),
    photoInput = useRef<HTMLInputElement>(null),
    textInput = useRef<HTMLTextAreaElement>(null),
    publishedRef = useRef(false),
    autoColor = useRef(false),
    controller = useRef<AbortController | null>(null),
    timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const navigate = useNavigate();
  const [cardWidth, setCardWidth] = useState(360);
  const snapshot: Draft = { version: 1, config, details, step };
  const current = useRef(snapshot);
  current.current = snapshot;
  const dirty =
    JSON.stringify({ config, details }) !==
    JSON.stringify({
      config: original.current.config,
      details: original.current.details,
    });
  function saveDraft() {
    if (publishedRef.current) return;
    try {
      localStorage.setItem(draftKey, JSON.stringify(current.current));
      setSaved("Draft saved on this device");
    } catch {
      setSaved("Draft could not be saved on this device");
    }
  }
  const leave = useWordsLeaveGuard(dirty, publishedRef, saveDraft);
  useEffect(() => {
    const query = matchMedia("(max-width: 767px)");
    const update = () => setMobile(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!dirty || published) return;
    const tick = setTimeout(saveDraft, 350);
    return () => clearTimeout(tick);
  }, [config, details, step, published]);
  useEffect(() => {
    let active = true;
    void ensureWordsFont()
      .then(() => {
        if (active) setFontReady(true);
      })
      .catch((e) => {
        if (active) setError(message(e));
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(
    () => () => {
      controller.current?.abort();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    let live = true;
    setLoading(true);
    setImage(null);
    loadedImage.current = "";
    const source = config.background.photo || config.background.asset;
    void loadBackground(config)
      .then((value) => {
        if (live) {
          loadedImage.current = source;
          setImage(value);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (live) {
          setError(message(e));
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [
    config.background.kind,
    config.background.asset,
    config.background.photo,
  ]);
  useEffect(() => {
    if (!card.current) return;
    const observer = new ResizeObserver(() => {
      if (card.current) setCardWidth(card.current.clientWidth);
    });
    observer.observe(card.current);
    setCardWidth(card.current.clientWidth);
    return () => observer.disconnect();
  }, [step]);
  useEffect(() => {
    if (
      !canvas.current ||
      loading ||
      !fontReady ||
      (config.background.kind === "image" &&
        loadedImage.current !==
          (config.background.photo || config.background.asset))
    )
      return;
    try {
      if (autoColor.current) {
        autoColor.current = false;
        setConfig((c) => readableWords(c, image));
        return;
      }
      setMetrics(drawWords(canvas.current, config, image));
    } catch (e) {
      setError(message(e));
    }
  }, [config, image, loading, fontReady, step]);
  function update<K extends keyof WordsConfig>(key: K, value: WordsConfig[K]) {
    setConfig((c) => ({ ...c, [key]: value }));
  }
  function background(value: Partial<WordsConfig["background"]>) {
    autoColor.current = true;
    setConfig((c) => ({ ...c, background: { ...c.background, ...value } }));
  }
  function highlight(value: string | null) {
    autoColor.current = true;
    setConfig((c) => ({ ...c, colors: { ...c.colors, highlight: value } }));
  }
  function template(name: string) {
    autoColor.current = true;
    setConfig({
      ...structuredClone(initialWords),
      ...structuredClone(templates[name]),
    });
  }
  function addTag(value: string) {
    const tag = normalizeTag(value);
    if (tag && details.tags.length < 8)
      setDetails((d) => ({ ...d, tags: [...new Set([...d.tags, tag])] }));
    setPendingTag("");
  }
  async function publish(event: FormEvent) {
    event.preventDefault();
    if (
      step !== 2 ||
      busy ||
      !fontReady ||
      loading ||
      !config.text.trim() ||
      !canvas.current ||
      (config.background.kind === "image" && !image)
    )
      return;
    setBusy(true);
    setError("");
    controller.current = new AbortController();
    try {
      await ensureWordsFont();
      drawWords(canvas.current, config, image);
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("PNG export failed.")),
          "image/png",
        ),
      );
      const body = new FormData();
      body.set(
        "title",
        details.title.trim() || config.text.trim().slice(0, 200),
      );
      body.set("description", details.context);
      body.set(
        "tags",
        [
          ...new Set([
            ...details.tags,
            ...(normalizeTag(pendingTag) ? [normalizeTag(pendingTag)] : []),
          ]),
        ]
          .slice(0, 8)
          .join(", "),
      );
      body.set(
        "alt_text",
        details.altEdited ? details.alt : config.text.trim(),
      );
      body.set("source_url", post?.source_url || "");
      body.set("allow_download", String(details.downloads));
      body.set("image", blob, "words.png");
      body.set("type", "text_card");
      body.set("config", JSON.stringify(config));
      const result = await upload<Post>(
        post ? `/posts/${post.id}/text-card/` : "/posts/",
        body,
        () => {},
        controller.current.signal,
      );
      publishedRef.current = true;
      setPublished(true);
      try {
        localStorage.removeItem(draftKey);
      } catch {
        /* Publication does not depend on draft storage. */
      }
      notify(post ? "Words updated" : "Words published");
      timer.current = setTimeout(
        () => navigate(`/pin/${result.id}`),
        matchMedia("(prefers-reduced-motion: reduce)").matches ? 150 : 700,
      );
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(e instanceof ApiError ? e.message : message(e));
    } finally {
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  }
  const scale = cardWidth / 1080;
  const ratio =
    config.ratio === "1:1" ? 1 : config.ratio === "9:16" ? 9 / 16 : 4 / 5;
  const panels = (
    <div className="words-settings">
      {active === "Style" && (
        <>
          <div className="words-font-tiles" role="group" aria-label="Font">
            {["upright", "meme", "serif", "handwritten", "mono", "rounded"].map(
              (key) => (
                <button
                  type="button"
                  key={key}
                  aria-pressed={config.font === key}
                  onClick={() => update("font", key)}
                >
                  <span
                    style={{
                      fontFamily: fonts[key].family,
                      fontWeight: Number(fonts[key].weight),
                    }}
                  >
                    {key === "meme"
                      ? "HOT TAKE"
                      : key === "upright"
                        ? "Your words"
                        : "A little idea"}
                  </span>
                  <small>{fonts[key].label}</small>
                </button>
              ),
            )}
          </div>
          <WordsSlider
            label="Font size"
            value={config.size}
            min={24}
            max={240}
            step={2}
            unit="px"
            change={(value) => update("size", value)}
          />
          <div className="words-segments" role="group" aria-label="Alignment">
            {(
              [
                ["left", AlignLeft],
                ["center", AlignCenter],
                ["right", AlignRight],
              ] as const
            ).map(([value, Icon]) => (
              <button
                type="button"
                key={value}
                aria-label={`Align ${value}`}
                aria-pressed={config.align === value}
                onClick={() => update("align", value)}
              >
                <Icon size={18} />
              </button>
            ))}
          </div>
        </>
      )}
      {active === "Color" && (
        <>
          <WordsColors
            label="Text color"
            value={config.colors.text}
            change={(value) =>
              setConfig((c) => ({ ...c, colors: { ...c.colors, text: value } }))
            }
          />
          <WordsSwitch
            label="Highlight text"
            checked={!!config.colors.highlight}
            change={(value) => highlight(value ? "#f1d68a" : null)}
          />
          {config.colors.highlight && (
            <WordsColors
              label="Highlight color"
              value={config.colors.highlight}
              change={highlight}
            />
          )}
        </>
      )}
      {active === "Background" && (
        <>
          <WordsColors
            label="Background color"
            value={config.background.color}
            colors={backgrounds}
            change={(value) =>
              background({ kind: "solid", color: value, photo: null })
            }
          />
          <span className="words-control-label">Gradients</span>
          <div
            className="words-background-tiles"
            role="group"
            aria-label="Gradients"
          >
            {[
              ["Dusk", "#1b3258", "#6a3e67"],
              ["Sunrise", "#f2e6c9", "#da704e"],
              ["Ocean", "#183247", "#287fa0"],
            ].map(([name, color, color2]) => (
              <button
                type="button"
                key={name}
                aria-label={`${name} gradient`}
                aria-pressed={
                  config.background.kind === "gradient" &&
                  config.background.color === color
                }
                style={{
                  background: `linear-gradient(135deg,${color},${color2})`,
                }}
                onClick={() =>
                  background({ kind: "gradient", color, color2, photo: null })
                }
              >
                <span>{name}</span>
              </button>
            ))}
          </div>
          <div className="words-textures" role="group" aria-label="Textures">
            <button
              type="button"
              aria-pressed={
                config.background.kind === "texture" &&
                config.background.color === "#f2e6c9"
              }
              onClick={() =>
                background({ kind: "texture", color: "#f2e6c9", photo: null })
              }
            >
              Paper
            </button>
            <button
              type="button"
              aria-pressed={
                config.background.kind === "texture" &&
                config.background.color === "#183247"
              }
              onClick={() =>
                background({ kind: "texture", color: "#183247", photo: null })
              }
            >
              Midnight paper
            </button>
          </div>
          <span className="words-control-label">Images</span>
          <div
            className="words-background-tiles"
            role="group"
            aria-label="Built-in image"
          >
            {(["coast", "sky", "forest"] as const).map((asset) => (
              <button
                type="button"
                key={asset}
                aria-label={`${asset} illustration`}
                aria-pressed={
                  config.background.kind === "image" &&
                  !config.background.photo &&
                  config.background.asset === asset
                }
                onClick={() =>
                  background({ kind: "image", asset, photo: null })
                }
              >
                <img src={`/word-backgrounds/${asset}.svg`} alt="" />
                <span>{asset}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="secondary-button"
            onClick={() => photoInput.current?.click()}
          >
            <Upload size={16} />
            Upload photo
          </button>
          <input
            ref={photoInput}
            type="file"
            hidden
            accept="image/png,image/jpeg,image/webp"
            aria-label="Upload photo"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              setLoading(true);
              setError("");
              try {
                background({ kind: "image", photo: await photoData(file) });
              } catch (e) {
                setError(message(e));
                setLoading(false);
              }
            }}
          />
          <p className="words-small">
            Only use images you have the right to use.
          </p>
          {config.background.kind === "image" && (
            <WordsSlider
              label="Dark overlay"
              value={Math.round(config.background.overlay * 100)}
              min={0}
              max={90}
              unit="%"
              change={(value) => background({ overlay: value / 100 })}
            />
          )}
        </>
      )}
      {active === "Format" && (
        <div
          className="words-segments words-formats"
          role="group"
          aria-label="Aspect ratio"
        >
          {(
            [
              ["4:5", RectangleVertical],
              ["1:1", Square],
              ["9:16", RectangleHorizontal],
            ] as const
          ).map(([value, Icon]) => (
            <button
              type="button"
              key={value}
              aria-label={`Aspect ratio ${value}`}
              aria-pressed={config.ratio === value}
              onClick={() => update("ratio", value)}
            >
              <Icon size={22} />
              <span>{value}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
  return (
    <main className="collection-page words-page">
      <header className="words-heading">
        <div>
          <h1>{post ? "Edit your Words" : "Create Words"}</h1>
          <p>A little idea, made yours.</p>
        </div>
        <div className="words-owl">
          <Owl
            state={published ? "happy" : config.text ? "idle" : "sleep"}
            followCursor
            gaze={
              config.text
                ? { x: Math.sin(config.text.length / 8) * 0.4, y: 1 }
                : undefined
            }
          />
        </div>
      </header>
      <nav className="words-progress" aria-label="Words steps">
        <button
          type="button"
          aria-current={step === 1 ? "step" : undefined}
          onClick={() => setStep(1)}
        >
          <span>{step === 2 ? <Check size={14} /> : 1}</span>Design
        </button>
        <span className="words-progress-line" aria-hidden="true" />
        <button
          type="button"
          disabled={!config.text.trim()}
          aria-current={step === 2 ? "step" : undefined}
          onClick={() => {
            setSheet(false);
            setStep(2);
          }}
        >
          <span>2</span>Details
        </button>
      </nav>
      <form onSubmit={(event) => void publish(event)}>
        <fieldset className="words-form-fields" disabled={busy || published}>
          <legend className="sr-only">Words creator</legend>
          {step === 1 && (
            <div
              className="words-templates"
              role="group"
              aria-label="Starter templates"
            >
              {Object.keys(templates).map((name) => (
                <button type="button" key={name} onClick={() => template(name)}>
                  {name}
                </button>
              ))}
            </div>
          )}
          <div className={step === 1 ? "words-design" : "words-details-layout"}>
            <div
              className={
                step === 1
                  ? "words-card-column"
                  : "words-card-column words-card-small"
              }
            >
              <div
                ref={card}
                className="words-card"
                style={{
                  aspectRatio: config.ratio.replace(":", "/"),
                  maxWidth: `min(100%, ${step === 1 ? 70 : 34}dvh * ${ratio})`,
                }}
              >
                <canvas
                  ref={canvas}
                  role="img"
                  aria-label={config.text || "Empty Words preview"}
                  aria-hidden={step === 1}
                />
                {step === 1 && (
                  <textarea
                    ref={textInput}
                    className="words-card-input"
                    dir="auto"
                    aria-label="Your words"
                    aria-describedby="words-counter"
                    placeholder="What's on your mind?"
                    maxLength={280}
                    spellCheck
                    style={
                      {
                        fontFamily: fonts[config.font]?.family,
                        fontWeight: Number(fonts[config.font]?.weight || 400),
                        fontSize: `${metrics.size * scale}px`,
                        lineHeight: 1.35,
                        textAlign: config.align,
                        paddingTop: `${Math.max(32, (metrics.height - metrics.lines * metrics.lineHeight) / 2) * scale}px`,
                        paddingLeft: `${88 * scale}px`,
                        paddingRight: `${88 * scale}px`,
                        "--words-text": config.colors.text,
                      } as CSSProperties
                    }
                    value={config.text}
                    onChange={(event) =>
                      update("text", event.target.value.slice(0, 280))
                    }
                  />
                )}
              </div>
              {step === 1 && (
                <div className="words-card-meta">
                  <span
                    id="words-counter"
                    className={
                      config.text.length >= 260
                        ? "words-counter words-counter-warning"
                        : "words-counter"
                    }
                    aria-live="polite"
                  >
                    {config.text.length}/280
                    {config.text.length >= 260 ? " � Almost full" : ""}
                  </span>
                  {metrics.contrast < 4.5 && (
                    <span className="words-contrast" role="status">
                      Low contrast{" "}
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((c) => readableWords(c, image, true))
                        }
                      >
                        Fix automatically
                      </button>
                    </span>
                  )}
                </div>
              )}
            </div>
            {step === 1 ? (
              <>
                <div
                  className="words-toolbar"
                  role="group"
                  aria-label="Design tools"
                >
                  {(
                    [
                      ["Style", Type],
                      ["Color", Palette],
                      ["Background", ImageIcon],
                      ["Format", RectangleVertical],
                    ] as const
                  ).map(([name, Icon]) => (
                    <button
                      type="button"
                      key={name}
                      aria-pressed={active === name}
                      aria-haspopup={mobile ? "dialog" : undefined}
                      onClick={() => {
                        setActive(name);
                        if (mobile) setSheet(true);
                      }}
                    >
                      <Icon size={20} />
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
                {!mobile && (
                  <section
                    className="words-panel"
                    aria-label={`${active} settings`}
                  >
                    {panels}
                  </section>
                )}
                {mobile && sheet && (
                  <Modal
                    title={`${active} settings`}
                    className="words-tool-sheet"
                    close={() => setSheet(false)}
                  >
                    {panels}
                  </Modal>
                )}
              </>
            ) : (
              <div className="words-details-fields">
                <label className="field">
                  Title (optional)
                  <input
                    maxLength={200}
                    value={details.title}
                    onChange={(event) =>
                      setDetails((d) => ({ ...d, title: event.target.value }))
                    }
                    placeholder="Give your words a name"
                  />
                </label>
                <label className="field">
                  Tags
                  <div className="words-tag-input">
                    <input
                      aria-label="Add tag"
                      maxLength={40}
                      value={pendingTag}
                      disabled={details.tags.length >= 8}
                      placeholder="Add a topic"
                      onChange={(event) => setPendingTag(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === ",") {
                          event.preventDefault();
                          addTag(pendingTag);
                        }
                      }}
                      onBlur={() => {
                        if (pendingTag) addTag(pendingTag);
                      }}
                    />
                    <button
                      type="button"
                      disabled={
                        !normalizeTag(pendingTag) || details.tags.length >= 8
                      }
                      onClick={() => addTag(pendingTag)}
                    >
                      Add
                    </button>
                  </div>
                </label>
                <div className="words-tag-chips" aria-label="Selected tags">
                  {details.tags.map((tag) => (
                    <button
                      type="button"
                      key={tag}
                      aria-label={`Remove tag ${tag}`}
                      onClick={() =>
                        setDetails((d) => ({
                          ...d,
                          tags: d.tags.filter((t) => t !== tag),
                        }))
                      }
                    >
                      {tag}
                      <X size={12} />
                    </button>
                  ))}
                </div>
                <div
                  className="words-tag-suggestions"
                  role="group"
                  aria-label="Suggested tags"
                >
                  {suggestions
                    .filter((tag) => !details.tags.includes(tag))
                    .map((tag) => (
                      <button
                        type="button"
                        key={tag}
                        disabled={details.tags.length >= 8}
                        onClick={() => addTag(tag)}
                      >
                        {tag}
                      </button>
                    ))}
                </div>
                <label className="field">
                  Add context (optional)
                  <textarea
                    rows={3}
                    maxLength={5000}
                    value={details.context}
                    onChange={(event) =>
                      setDetails((d) => ({ ...d, context: event.target.value }))
                    }
                    placeholder="Anything else you want to say?"
                  />
                </label>
                <div className="words-alt-row">
                  <div>
                    <span>Alt text</span>
                    <p>
                      {details.altEdited
                        ? details.alt
                        : config.text || "Your words will describe this card."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="quiet-button"
                    aria-expanded={altOpen}
                    onClick={() => setAltOpen(!altOpen)}
                  >
                    {altOpen ? "Done" : "Edit"}
                  </button>
                </div>
                {altOpen && (
                  <label className="field">
                    Alt text
                    <input
                      aria-label="Alt text"
                      maxLength={500}
                      value={details.altEdited ? details.alt : config.text}
                      onChange={(event) =>
                        setDetails((d) => ({
                          ...d,
                          altEdited: true,
                          alt: event.target.value,
                        }))
                      }
                    />
                  </label>
                )}
                <details className="words-advanced">
                  <summary>Advanced</summary>
                  <WordsSwitch
                    label="Allow downloads"
                    checked={details.downloads}
                    change={(value) =>
                      setDetails((d) => ({ ...d, downloads: value }))
                    }
                  />
                </details>
              </div>
            )}
          </div>
          {languageWarning(config.text) && (
            <p className="words-language" role="status">
              Please review this language before publishing. This warning does
              not block your card.
            </p>
          )}
          <ErrorNotice error={error} />
          <footer className="words-stage-actions">
            <div>
              <span className="words-draft-status" role="status">
                {saved}
              </span>
              {step === 2 && (
                <button
                  type="button"
                  className="quiet-button"
                  onClick={() => setStep(1)}
                >
                  <ArrowLeft size={16} />
                  Back to Design
                </button>
              )}
            </div>
            {step === 1 ? (
              <button
                className="primary-button"
                type="button"
                disabled={
                  !config.text.trim() ||
                  loading ||
                  !fontReady ||
                  (config.background.kind === "image" && !image)
                }
                onClick={() => setStep(2)}
              >
                Next: Details
                <ArrowRight size={16} />
              </button>
            ) : (
              <div className="words-publish">
                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    !config.text.trim() ||
                    loading ||
                    !fontReady ||
                    (config.background.kind === "image" && !image)
                  }
                >
                  {busy
                    ? "Publishing..."
                    : post
                      ? "Save Words"
                      : "Publish Words"}
                </button>
                <p>Public. Be kind. Reports welcome.</p>
              </div>
            )}
          </footer>
        </fieldset>
      </form>
      {published && (
        <div className="words-published" role="status">
          <Owl state="happy" />
          <p>{post ? "Updated" : "Published"}!</p>
        </div>
      )}
      {leave.asking && (
        <Modal title="Leave Words?" close={leave.stay}>
          <p>
            {saved.includes("could not")
              ? "Your draft could not be saved on this device. Leave and lose these changes?"
              : "Your unpublished draft is saved on this device. Leave the editor?"}
          </p>
          <div className="form-actions">
            <button className="secondary-button" onClick={leave.stay}>
              Keep editing
            </button>
            <button className="primary-button" onClick={leave.leave}>
              Leave
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

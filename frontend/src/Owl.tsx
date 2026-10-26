import { useEffect, useRef, useState } from "react";

export type OwlState = "idle" | "blink" | "sleep" | "think" | "happy";
export type OwlAccessory = "none" | "mug" | "backpack" | "lamp";

export function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Original shapes from Desktop/owl.txt, recolored for Behtrest's blue owl.
export default function Owl({
  state = "idle",
  accessory = "none",
  followCursor = false,
  gaze,
}: {
  state?: OwlState;
  accessory?: OwlAccessory;
  followCursor?: boolean;
  gaze?: { x: number; y: number };
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [blink, setBlink] = useState(false);
  useEffect(() => {
    if (state !== "idle") return;
    let next: ReturnType<typeof setTimeout>,
      finish: ReturnType<typeof setTimeout>;
    let disposed = false;
    const schedule = () => {
      next = setTimeout(
        () => {
          if (disposed) return;
          if (!reducedMotion() && !document.hidden) setBlink(true);
          finish = setTimeout(() => {
            setBlink(false);
            schedule();
          }, 180);
        },
        3000 + Math.random() * 3000,
      );
    };
    schedule();
    return () => {
      disposed = true;
      clearTimeout(next);
      clearTimeout(finish);
      setBlink(false);
    };
  }, [state]);
  useEffect(() => {
    if (!followCursor) return;
    let frame = 0,
      last = 0;
    const move = (event: PointerEvent) => {
      if (frame || reducedMotion() || event.pointerType === "touch") return;
      const { clientX, clientY } = event;
      frame = requestAnimationFrame((now) => {
        frame = 0;
        if (now - last < 50 || !svg.current) return;
        last = now;
        const r = svg.current.getBoundingClientRect();
        const x =
          Math.max(-1, Math.min(1, (clientX - r.x - r.width / 2) / 200)) * 3;
        const y =
          Math.max(-1, Math.min(1, (clientY - r.y - r.height / 2) / 200)) * 2;
        svg.current.querySelectorAll<SVGElement>(".owl-pupil").forEach((p) => {
          p.style.transform = `translate(${x}px, ${y}px)`;
        });
      });
    };
    const reset = () =>
      svg.current?.querySelectorAll<SVGElement>(".owl-pupil").forEach((p) => {
        p.style.transform = "none";
      });
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    preference.addEventListener("change", reset);
    window.addEventListener("pointermove", move, { passive: true });
    return () => {
      cancelAnimationFrame(frame);
      preference.removeEventListener("change", reset);
      window.removeEventListener("pointermove", move);
    };
  }, [followCursor]);
  useEffect(() => {
    if (!gaze || reducedMotion()) return;
    svg.current?.querySelectorAll<SVGElement>(".owl-pupil").forEach((p) => {
      p.style.transform = `translate(${Math.max(-1, Math.min(1, gaze.x)) * 3}px, ${Math.max(-1, Math.min(1, gaze.y)) * 2}px)`;
    });
  }, [gaze?.x, gaze?.y]);
  return (
    <svg
      ref={svg}
      className={`owl owl-${state} ${blink || state === "blink" ? "owl-blinking" : ""}`}
      viewBox="0 0 64 64"
      width="52"
      height="52"
      aria-hidden="true"
      focusable="false"
    >
      <g className="owl-body">
        <polygon points="13,12 24,22 9,27" fill="#4387ba" />
        <polygon points="51,12 40,22 55,27" fill="#4387ba" />
        <ellipse cx="32" cy="38" rx="23" ry="22" fill="#6caddb" />
        <ellipse cx="32" cy="46" rx="13" ry="13" fill="#c2e1f5" />
        <path
          d="M26 42 q3 3 6 0 q3 3 6 0 M26 49 q3 3 6 0 q3 3 6 0"
          stroke="#7fb6d9"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
        />
        {[22, 42].map((x) => (
          <g className="owl-eye" key={x}>
            <circle cx={x} cy="30" r="9.5" fill="#fff" stroke="#4387ba" />
            <circle
              className="owl-pupil"
              cx={x}
              cy="31"
              r="4.2"
              fill="#17181b"
            />
            <path
              className="owl-heart"
              d={`M${x} 35 C${x - 8} 30 ${x - 6} 24 ${x} 27.5 C${x + 6} 24 ${x + 8} 30 ${x} 35Z`}
              fill="#2874d0"
            />
          </g>
        ))}
        <path
          className="owl-closed-eyes"
          d="M15 30q7 5 14 0 M35 30q7 5 14 0"
          fill="none"
          stroke="#17354d"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <polygon points="29,37 35,37 32,43" fill="#e8a33d" />
        <ellipse cx="25" cy="60" rx="5" ry="2.5" fill="#e8a33d" />
        <ellipse cx="39" cy="60" rx="5" ry="2.5" fill="#e8a33d" />
      </g>
      <g key={accessory} className="owl-accessory">
        {accessory === "mug" && (
          <>
            <rect x="40" y="44" width="14" height="13" rx="3" fill="#f3f4f6" />
            <path
              d="M54 46h3q5 6-3 8 M44 40q-3-3 0-6"
              fill="none"
              stroke="#f3f4f6"
              strokeWidth="2"
            />
          </>
        )}
        {accessory === "backpack" && (
          <>
            <rect x="45" y="35" width="15" height="22" rx="5" fill="#315a81" />
            <path
              d="M49 35v-3h7v3 M48 46h9v7h-9z"
              fill="none"
              stroke="#c2e1f5"
              strokeWidth="2"
            />
          </>
        )}
        {accessory === "lamp" && (
          <>
            <path
              d="M5 57h15 M12 57V37l9-8"
              stroke="#c2e1f5"
              strokeWidth="3"
              fill="none"
            />
            <path d="M16 23l13 9-17 1z" fill="#e8a33d" />
          </>
        )}
      </g>
      {state === "sleep" && (
        <text
          className="owl-zzz"
          x="42"
          y="12"
          fill="currentColor"
          fontSize="12"
        >
          zzz
        </text>
      )}
      {state === "think" && (
        <g className="owl-thoughts" fill="currentColor">
          <circle cx="46" cy="9" r="2" />
          <circle cx="53" cy="6" r="2" />
          <circle cx="60" cy="3" r="2" />
        </g>
      )}
    </svg>
  );
}

export function LogoOwl() {
  const [state, setState] = useState<OwlState>("idle");
  const [accessory, setAccessory] = useState<OwlAccessory>("none");
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const happy = () => {
      setState("happy");
      clearTimeout(timer);
      timer = setTimeout(() => setState("idle"), 1000);
    };
    const change = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        ["none", "mug", "backpack", "lamp"].includes(event.detail)
      )
        setAccessory(event.detail);
    };
    window.addEventListener("pin-saved", happy);
    window.addEventListener("owl-accessory", change);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pin-saved", happy);
      window.removeEventListener("owl-accessory", change);
    };
  }, []);
  return <Owl state={state} accessory={accessory} followCursor />;
}

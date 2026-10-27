import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import Owl, { reducedMotion } from "./Owl";
import type { Post } from "./types";

export function celebrateSave(post: Post, sparkle = false) {
  const card = document.querySelector<HTMLElement>(
    `[data-pin-id="${post.id}"]`,
  );
  const source = card?.getBoundingClientRect();
  window.dispatchEvent(
    new CustomEvent("pin-saved", {
      detail: {
        image: post.thumbnail,
        x: source ? source.x + source.width / 2 : innerWidth / 2,
        y: source
          ? Math.max(
              80,
              Math.min(innerHeight - 80, source.y + source.height / 2),
            )
          : innerHeight / 2,
        sparkle,
      },
    }),
  );
}

export function useMasonry(
  ref: RefObject<HTMLDivElement | null>,
  items: Post[],
  enabled: boolean,
) {
  const [longFeed, setLongFeed] = useState(false);
  useLayoutEffect(() => {
    const grid = ref.current;
    if (!grid) return;
    let frame = 0;
    const layout = () => {
      frame = 0;
      if (enabled && grid.clientWidth) {
        const columns =
          Number(
            getComputedStyle(grid).getPropertyValue("--masonry-columns"),
          ) || 2;
        const width = (grid.clientWidth - (columns - 1) * 12) / columns;
        const cards = [
          ...grid.querySelectorAll<HTMLElement>(":scope > .feed-pin"),
        ];
        const fresh = cards.filter((card) => !card.dataset.placed);
        fresh.forEach((card) => {
          card.style.transition = "none";
          card.dataset.placed = "true";
        });
        cards.forEach((card) => {
          card.style.width = `${width}px`;
        });
        const heights = Array(columns).fill(0) as number[];
        const sizes = cards.map((card) => card.getBoundingClientRect().height);
        cards.forEach((card, index) => {
          const column = heights.indexOf(Math.min(...heights));
          // Column geometry must update with width, without interpolating from
          // an old offscreen column when the viewport shrinks. Only Y animates.
          card.style.left = `${column * (width + 12)}px`;
          card.style.transform = `translateY(${heights[column]}px)`;
          heights[column] += sizes[index] + 12;
        });
        grid.style.height = `${Math.max(0, ...heights) - (cards.length ? 12 : 0)}px`;
        if (fresh.length) {
          grid.getBoundingClientRect();
          fresh.forEach((card) => card.style.removeProperty("transition"));
        }
      }
      setLongFeed(grid.getBoundingClientRect().height > innerHeight * 2);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(layout);
    };
    const observer = new ResizeObserver(queue);
    observer.observe(grid);
    grid
      .querySelectorAll(":scope > article")
      .forEach((card) => observer.observe(card));
    // Reconcile viewport geometry in the resize event, before the next paint.
    window.addEventListener("resize", layout);
    layout();
    return () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", layout);
    };
  }, [ref, items, enabled]);
  return longFeed;
}

export function MotionLayer() {
  const [flying, setFlying] = useState(false);
  const flyingRef = useRef(false);
  useEffect(() => {
    let flightTimer: ReturnType<typeof setTimeout>;
    const active = new Set<Animation>();
    const elements = new Set<HTMLElement>();
    const fly = () => {
      if (reducedMotion() || flyingRef.current) return;
      flyingRef.current = true;
      setFlying(true);
      flightTimer = setTimeout(() => {
        setFlying(false);
        flyingRef.current = false;
      }, 1800);
    };
    const animate = (
      element: HTMLElement,
      frames: Keyframe[],
      duration: number,
      remove = false,
    ) => {
      const animation = element.animate(frames, {
        duration,
        easing: "ease-out",
      });
      active.add(animation);
      animation.onfinish = () => {
        active.delete(animation);
        if (remove) {
          element.remove();
          elements.delete(element);
        }
      };
    };
    const saved = (event: Event) => {
      if (reducedMotion() || !(event instanceof CustomEvent)) return;
      const { image, x, y, sparkle } = event.detail;
      const target = [
        ...document.querySelectorAll<HTMLElement>('a[href="/boards"]'),
      ].find((e) => e.getBoundingClientRect().width > 0);
      if (!target) return;
      const destination = target.getBoundingClientRect();
      const parent = document.querySelector("dialog[open]") || document.body;
      const pin = document.createElement("img");
      pin.src = image;
      pin.alt = "";
      pin.className = "flying-pin";
      pin.setAttribute("aria-hidden", "true");
      parent.append(pin);
      elements.add(pin);
      const endX = destination.x + destination.width / 2 - 24,
        endY = destination.y + destination.height / 2 - 24;
      const frames = Array.from({ length: 7 }, (_, i) => {
        const t = i / 6;
        return {
          transform: `translate(${x - 24 + (endX - x + 24) * t}px, ${y - 24 + (endY - y + 24) * t - 4 * t * (1 - t) * 100}px) scale(${1 - t * 0.8})`,
          opacity: 1 - t,
          offset: t,
        };
      });
      animate(pin, frames, 280, true);
      animate(
        target,
        [
          { transform: "scale(1)" },
          { transform: "translateY(-4px) scale(1.15)", offset: 0.6 },
          { transform: "scale(1)" },
        ],
        250,
      );
      if (sparkle)
        for (let i = 0; i < 6; i++) {
          const star = document.createElement("span");
          star.className = "save-sparkle";
          star.textContent = "✦";
          star.setAttribute("aria-hidden", "true");
          parent.append(star);
          elements.add(star);
          const angle = (i * Math.PI) / 3;
          animate(
            star,
            [
              { transform: `translate(${x}px, ${y}px) scale(.4)`, opacity: 1 },
              {
                transform: `translate(${x + Math.cos(angle) * 55}px, ${y + Math.sin(angle) * 55}px) scale(1)`,
                opacity: 0,
              },
            ],
            250,
            true,
          );
        }
    };
    window.addEventListener("pin-saved", saved);
    window.addEventListener("owl-flight", fly);
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const stop = () => {
      if (preference.matches) {
        active.forEach((animation) => animation.cancel());
        elements.forEach((element) => element.remove());
        active.clear();
        elements.clear();
        setFlying(false);
        flyingRef.current = false;
        clearTimeout(flightTimer);
      }
    };
    preference.addEventListener("change", stop);
    return () => {
      clearTimeout(flightTimer);
      active.forEach((animation) => animation.cancel());
      elements.forEach((element) => element.remove());
      preference.removeEventListener("change", stop);
      window.removeEventListener("pin-saved", saved);
      window.removeEventListener("owl-flight", fly);
    };
  }, []);
  return flying ? (
    <div className="owl-flight-viewport" aria-hidden="true">
      <div className="owl-flight">
        <Owl state="happy" accessory="backpack" />
      </div>
    </div>
  ) : null;
}

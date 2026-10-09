import { ArrowUpRight, Sparkles } from "lucide-react";

export default function Art() {
  return (
    <section
      className="art-panel"
      aria-label="Illustrations of a blue inspiration collection"
    >
      <div className="art-heading">
        <span className="eyebrow">A LITTLE SPACE FOR BIG IDEAS</span>
        <Sparkles size={20} />
      </div>
      <h1>
        Keep what
        <br /> moves <em>you.</em>
      </h1>
      <p>
        The colors, the places, the little things.
        <br />A home for everything that sparks an idea.
      </p>
      <div className="moodboard" aria-hidden="true">
        <div className="art-card ocean">
          <svg viewBox="0 0 240 300">
            <defs>
              <linearGradient id="ocean" x2="0" y2="1">
                <stop stopColor="#1a4564" />
                <stop offset="1" stopColor="#6ab1ce" />
              </linearGradient>
            </defs>
            <rect width="240" height="300" fill="url(#ocean)" />
            <circle cx="177" cy="80" r="29" fill="#efdfbd" />
            <path d="M0 150Q50 115 105 153T240 152V300H0Z" fill="#1c6487" />
            <path d="M0 200Q75 150 143 194T240 187V300H0Z" fill="#2b7d9e" />
            <path d="M0 250Q65 193 140 235T240 224V300H0Z" fill="#91c2cc" />
          </svg>
          <span>Somewhere slower ↗</span>
        </div>
        <div className="art-card type-study">
          <span>
            blue
            <br />
            <em>is a</em>
            <br />
            feeling.
          </span>
          <small>COLOR STUDY / 001</small>
        </div>
        <div className="art-card arch">
          <svg viewBox="0 0 220 255">
            <rect width="220" height="255" fill="#b6c8d0" />
            <path d="M35 255V115A75 75 0 0 1 185 115V255Z" fill="#526c82" />
            <path d="M60 255V115A50 50 0 0 1 160 115V255Z" fill="#183247" />
            <circle cx="110" cy="127" r="33" fill="#8ab5ce" />
            <path d="M60 189L125 152L160 188V255H60Z" fill="#6f98ab" />
          </svg>
          <span>Room to imagine</span>
        </div>
        <div className="art-card note">
          <Sparkles size={28} />
          <p>
            Good ideas
            <br />
            start with
            <br />
            <em>looking.</em>
          </p>
          <span>STAY CURIOUS</span>
        </div>
      </div>
      <div className="art-footer">
        <span>Made for curious minds.</span>
        <ArrowUpRight size={18} />
      </div>
    </section>
  );
}

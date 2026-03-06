type LandingPageProps = {
  onStart: () => void;
};

export default function LandingPage({ onStart }: LandingPageProps) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-slate-100">
      <div
        className="absolute inset-0 scale-105 blur-[3px]"
        style={{
          backgroundImage:
            "url('https://assets.badlion.net/blog/minecraft-backgrounds/campfire-mountain.webp')",
          backgroundSize: "cover",
          backgroundPosition: "center"
        }}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,rgba(45,212,191,0.22),transparent_40%),radial-gradient(circle_at_90%_20%,rgba(251,146,60,0.18),transparent_40%),linear-gradient(120deg,rgba(15,23,42,0.9),rgba(2,6,23,0.95))]" />

      <div className="relative mx-auto max-w-6xl px-6 pb-12 pt-8 md:px-10">
        <header className="rounded-2xl border border-slate-700/70 bg-slate-900/50 px-5 py-3 backdrop-blur">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan">MCSR Ranked</p>
            <p className="text-sm text-slate-300">Analytics Platform</p>
          </div>
        </header>

        <section className="mt-8 grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl border border-slate-700/70 bg-slate-900/45 p-7 shadow-soft backdrop-blur">
            <p className="inline-flex rounded-full border border-cyan/60 bg-cyan/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-cyan">
              Live Competitive Insights
            </p>
            <h1 className="mt-4 text-4xl font-bold leading-tight md:text-5xl">
              Track Ranked Performance
              <span className="block text-slate-300">From Raw Matches to Clear Decisions.</span>
            </h1>
            <p className="mt-4 max-w-2xl text-sm text-slate-300 md:text-base">
              Search any player to get all-time records, rolling form, split timing trends, elo progression, and seed
              and bastion breakdowns powered by an automated sync pipeline.
            </p>
            <div className="mt-6">
              <button
                onClick={onStart}
                className="rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 transition hover:brightness-95"
              >
                Start Searching
              </button>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">What You Get</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-200">
                <li>All-time record, elo, streaks, and average match time</li>
                <li>Ranked form across last 7 days and 30 days</li>
                <li>Average split timings with filterable seed and bastion type</li>
              </ul>
            </div>
            <div className="rounded-2xl border border-slate-700/70 bg-slate-900/45 p-5 backdrop-blur">
              <p className="text-xs uppercase tracking-[0.12em] text-slate-400">Core Features</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-cyan">
                  Live Sync
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-cyan">
                  Cached Search
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-cyan">
                  Progress Tracking
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/80 px-3 py-2 text-xs font-semibold text-cyan">
                  Split Filters
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-400">
                Searches return quickly from cached data while fresh ranked matches sync in the background.
              </p>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mt-8 rounded-3xl border border-slate-700/70 bg-slate-900/45 p-6 backdrop-blur">
          <h2 className="text-xl font-semibold">How To Use The App</h2>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-cyan">1. Search a Username</p>
              <p className="mt-2 text-sm text-slate-300">Enter a player name and click search to load cached data instantly.</p>
            </div>
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-cyan">2. Let Sync Fill Gaps</p>
              <p className="mt-2 text-sm text-slate-300">If data is outdated, background sync starts and progress updates live.</p>
            </div>
            <div className="rounded-2xl border border-slate-700/60 bg-slate-900/60 p-4">
              <p className="text-sm font-semibold text-cyan">3. Analyze Performance</p>
              <p className="mt-2 text-sm text-slate-300">Use records, trends, and filters to identify strengths and bottlenecks.</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

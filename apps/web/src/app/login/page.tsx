import { signIn } from "@/auth";

export default function LoginPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#080A12] text-[#F4F4F8]">
      <div className="pointer-events-none absolute inset-0 opacity-90">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,rgba(255,112,122,0.17),transparent_40%),radial-gradient(circle_at_82%_6%,rgba(76,121,255,0.2),transparent_42%),radial-gradient(circle_at_50%_100%,rgba(255,203,60,0.1),transparent_52%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:22px_22px]" />
        <svg viewBox="0 0 1440 900" className="absolute inset-0 h-full w-full" aria-hidden="true">
          <g stroke="rgba(255,255,255,0.09)" strokeWidth="1.6">
            <line x1="0" y1="880" x2="450" y2="500" />
            <line x1="120" y1="900" x2="520" y2="510" />
            <line x1="240" y1="900" x2="610" y2="520" />
            <line x1="360" y1="900" x2="700" y2="530" />
            <line x1="920" y1="900" x2="1320" y2="520" />
            <line x1="1040" y1="900" x2="1410" y2="540" />
          </g>

          <g fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M122 290l34-62 39 10 33-29 41 17 9 30 35 23-11 45-58 16-27 24-51-17z" />
            <path d="M394 250l22-58 42-8 26 16 33-10 42 21-7 51-47 34-40 10-28 28-36-26z" />
            <path d="M878 264l28-43 37-9 22 19 33-6 39 22-14 47-39 18-20 26-47 7-31-30z" />
            <path d="M1138 273l24-45 39-13 24 16 37 2 31 30-20 42-52 12-25 24-44 7-24-24z" />
            <path d="M694 206l34-74 56 34 60-7 46 40-18 54-52 18-22 40-56 11-34-41z" />
          </g>

          <g fill="none" stroke="rgba(255,203,60,0.32)" strokeWidth="1.5" strokeLinecap="round">
            <path d="M230 168q37-26 78 0" />
            <path d="M228 170q37 34 78 0" />
            <path d="M989 174q39-26 81 0" />
            <path d="M990 176q41 34 81 0" />
            <circle cx="738" cy="144" r="15" />
            <circle cx="776" cy="144" r="15" />
            <circle cx="814" cy="144" r="15" />
            <circle cx="757" cy="180" r="15" />
            <circle cx="795" cy="180" r="15" />
            <circle cx="776" cy="216" r="15" />
            <circle cx="776" cy="108" r="15" />
          </g>

          <g fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M112 648h216l37-31h132l-30 58H289l-39 28H94z" />
            <path d="M571 694h229l37-26h117l-23 52H755l-39 23H555z" />
            <path d="M1004 636h202l34-24h101l-25 55h-164l-35 25h-139z" />
          </g>

          <g fill="none" stroke="rgba(111,170,255,0.22)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M664 470c46-69 122-94 187-63" />
            <path d="M700 520c66-35 143-29 201 14" />
            <path d="M688 574c68 26 150 19 211-21" />
            <path d="M702 448l-15 40 23 26-19 39 33 20" />
            <path d="M850 431l18 29-13 37 22 28-14 29" />
          </g>

          <g fill="rgba(255,255,255,0.08)">
            <circle cx="166" cy="136" r="54" />
            <circle cx="1266" cy="144" r="62" />
          </g>
        </svg>
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-6 py-16">
        <div className="w-full max-w-lg rounded-3xl border border-[#2A3040] bg-[#111520]/85 p-8 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-md">
          <p className="font-mono text-xs uppercase tracking-[0.25em] text-[#FFCB3C]">ChudACO Access</p>
          <h1 className="mt-3 font-heading text-4xl font-bold leading-tight">Sign in to ChudACO</h1>
          <p className="mt-4 text-sm text-[#B8B8C7]">
            Continue with Discord to access your dashboard. This requires the Cop Access role in
            ChudACO HQ.
          </p>

          <form
            className="mt-8"
            action={async () => {
              "use server";
              await signIn("discord", { redirectTo: "/dashboard" });
            }}
          >
            <button
              type="submit"
              className="w-full rounded-xl bg-[#5865F2] px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110"
            >
              Continue with Discord
            </button>
          </form>

          <p className="mt-4 text-xs text-[#8C8CA2]">Role-gated login. Session is scoped to your Discord identity.</p>
        </div>
      </div>
    </main>
  );
}
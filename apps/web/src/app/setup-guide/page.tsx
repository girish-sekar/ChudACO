import Image from "next/image";
import Link from "next/link";

const sections = [
  { id: "how-it-works", label: "How it works" },
  { id: "getting-access", label: "1. Get access" },
  { id: "signing-in", label: "2. Sign in" },
  { id: "adding-account", label: "3. Add an ACO account" },
  { id: "name-account", label: "4. Name your account" },
  { id: "pricing", label: "Understanding pricing" },
  { id: "notifications", label: "Getting notified" },
  { id: "paying", label: "Paying your balance" },
  { id: "faq", label: "FAQ" },
];

export default function SetupGuidePage() {
  return (
    <main className="min-h-screen bg-[#101014] text-[#F2F1F6]">
      <header className="sticky top-0 z-20 border-b border-[#2C2D3A] bg-[rgba(16,16,20,0.92)] backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3 font-heading text-sm font-bold tracking-tight">
            <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[#2F5BFF] text-xs">C</span>
            <span>CHUDACO</span>
          </div>
          <div className="flex items-center gap-5 text-sm text-[#9C9AAE]">
            <Link href="/setup-guide" className="hover:text-[#F2F1F6]">
              Setup Guide
            </Link>
            <Link href="/login" className="rounded-md bg-[#2F5BFF] px-4 py-2 font-medium text-white hover:bg-[#274CE0]">
              Sign in
            </Link>
          </div>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 px-6 pb-12 pt-14 md:grid-cols-[1.1fr_0.9fr] md:items-center">
        <div>
          <h1 className="font-heading text-4xl font-bold leading-tight md:text-5xl">Get set up in about ten minutes.</h1>
          <p className="mt-4 max-w-[48ch] text-base text-[#9C9AAE]">
            This guide walks through joining, connecting an account, and understanding how you are billed. No login is needed to read it.
          </p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full border border-[#2C2D3A] bg-[#18181F] px-3 py-1 font-mono text-[#9C9AAE]">Target</span>
            <span className="rounded-full border border-[#2C2D3A] bg-[#18181F] px-3 py-1 font-mono text-[#9C9AAE]">Pokemon Center</span>
            <span className="rounded-full border border-[#2C2D3A] bg-[#18181F] px-3 py-1 font-mono text-[#9C9AAE]">Pay-After-Success</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#2C2D3A] bg-[#18181F]">
          <Image
            src="/images/setup-guide-header.png"
            alt="ChudACO setup guide"
            width={720}
            height={405}
            className="h-auto w-full"
            priority
          />
        </div>
      </section>

      <div className="mx-auto grid w-full max-w-6xl gap-14 px-6 pb-24 lg:grid-cols-[220px_1fr]">
        <nav className="top-20 self-start border-b border-[#2C2D3A] pb-4 lg:sticky lg:border-b-0 lg:border-r lg:pb-0 lg:pr-6">
          <p className="mb-3 font-mono text-[11px] text-[#605E72]">ON THIS PAGE</p>
          <ul className="space-y-1 text-sm text-[#9C9AAE]">
            {sections.map((section, idx) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className={`block border-l-2 py-1 pl-3 hover:text-[#F2F1F6] ${idx === 0 ? "border-[#2F5BFF] text-[#F2F1F6]" : "border-transparent"}`}
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-10">
          <section id="how-it-works" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">How this works</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">
              ChudACO runs automated checkouts on your behalf during product releases. You provide your account, shipping, and payment details ahead of time.
            </p>
            <p className="mt-4 max-w-[68ch]">
              You are only charged if checkout succeeds. This is the PAS fee (Pay After Success). Missed or failed attempts cost nothing.
            </p>
            <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#245139] bg-[#16301F] px-4 py-3 text-sm text-[#4ADE80]">
              <span className="font-mono">OK</span>
              <span>If a checkout does not go through, you are not billed for it.</span>
            </div>
          </section>

          <section id="getting-access" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">1. Get access</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">The dashboard is role-gated from Discord and checked live.</p>
            <p className="mt-4 max-w-[68ch]">
              Join the ChudACO Discord server and get the <strong>Cop Access</strong> role. Access is re-verified each login.
            </p>
          </section>

          <section id="signing-in" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">2. Sign in</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">No separate password is required.</p>
            <p className="mt-4 max-w-[68ch]">
              Click <strong>Continue with Discord</strong> on the sign-in page. Your ChudACO account maps directly to your Discord identity.
            </p>
          </section>

          <section id="adding-account" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">3. Add an ACO account</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">
              Each ACO account is one retailer login. We currently support Target and Pokemon Center only, with a limit of 2 accounts per user for now.
            </p>
            <p className="mt-4 max-w-[68ch]">This account limit will be increased later.</p>

            <h3 className="mt-6 font-heading text-lg font-semibold">Account basics</h3>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">Start with these top-level fields before moving to shipping and payment.</p>
            <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
              <li><strong>Account name:</strong> Enter your own label, such as Primary or Backup1, so you can identify the account later.</li>
              <li><strong>Retailer:</strong> Select the retailer for that login. Only Target and Pokemon Center are supported right now.</li>
              <li><strong>Retailer login email:</strong> Enter the email or username used on that retailer account.</li>
              <li><strong>Retailer login password:</strong> Enter the password for that retailer account.</li>
              <li><strong>One checkout only:</strong> Leave this enabled if you want one successful checkout per account.</li>
            </ul>

            <h3 className="mt-6 font-heading text-lg font-semibold">Email and IMAP</h3>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">Choose your email provider first so IMAP settings can auto-fill when available.</p>
            <div className="mt-3 max-w-[68ch] overflow-hidden rounded-lg border border-[#2C2D3A]">
              <table className="w-full border-collapse text-sm">
                <thead className="bg-[#18181F] text-left font-mono text-[11px] uppercase tracking-[0.05em] text-[#605E72]">
                  <tr>
                    <th className="px-3 py-2">Provider</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="text-[#9C9AAE]">
                  {[
                    ["Gmail", "Requires an app password, not your regular login password"],
                    ["Outlook / Microsoft 365", "Also covers Hotmail and Live addresses"],
                    ["Yahoo Mail", "Requires an app password"],
                    ["iCloud Mail", "Requires an app-specific password from Apple ID settings"],
                    ["Zoho Mail", "Use provider credentials"],
                    ["AOL Mail", "Use provider credentials"],
                    ["Other", "Enter host, port, and security manually"],
                  ].map(([provider, note]) => (
                    <tr key={provider} className="border-t border-[#2C2D3A]">
                      <td className="px-3 py-2 font-medium text-[#F2F1F6]">{provider}</td>
                      <td className="px-3 py-2">{note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
              <li><strong>Email address:</strong> Use the inbox that receives retailer order and verification emails.</li>
              <li><strong>IMAP host, port, security:</strong> If provider is Other, enter manually. Most providers use port 993 with SSL/TLS.</li>
              <li><strong>Email password:</strong> Use an app password if your provider requires one.</li>
              <li><strong>Test IMAP connection:</strong> After filling these fields, click <strong>Test IMAP connection</strong> to confirm the credentials and server settings are valid before saving.</li>
            </ul>
            <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#5C4A1A] bg-[#332B12] px-4 py-3 text-sm text-[#FFCB3C]">
              <span className="font-mono">!</span>
              <span><strong>Proton Mail is not supported.</strong> Proton requires its Bridge app running locally, which our system cannot access.</span>
            </div>

            <h3 className="mt-6 font-heading text-lg font-semibold">Shipping</h3>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">Each account can have its own shipping details.</p>
            <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
              <li><strong>Full name:</strong> Enter the recipient name exactly as it should appear on shipments.</li>
              <li><strong>Phone:</strong> Use a reachable number for delivery or order issues.</li>
              <li><strong>Address, city, state, zip:</strong> Fill all fields with a complete deliverable address.</li>
              <li><strong>Billing same as shipping:</strong> Keep enabled when both addresses match; disable only if billing is different.</li>
            </ul>

            <h3 className="mt-6 font-heading text-lg font-semibold">Payment</h3>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">
              Card details are relayed once during setup and are never stored on ChudACO servers. Only brand, last 4, and expiry are retained for display.
            </p>
            <ul className="mt-3 max-w-[68ch] list-disc space-y-2 pl-5 text-sm text-[#D7D6E4]">
              <li><strong>Card number:</strong> Enter the full number. Your browser may auto-format spacing.</li>
              <li><strong>Expiry month and year:</strong> Use the exact expiration values from your card.</li>
              <li><strong>CVV:</strong> Enter the security code.</li>
              <li><strong>Cardholder name:</strong> Enter the name exactly as printed on the card.</li>
            </ul>
          </section>

          <section id="name-account" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">4. Name your account</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">Enter a simple account name for your own reference.</p>
            <p className="mt-4 max-w-[68ch]">
              Enter only your desired account name, such as <span className="rounded border border-[#2C2D3A] bg-[#212230] px-1.5 py-0.5 font-mono text-sm">Primary</span> or <span className="rounded border border-[#2C2D3A] bg-[#212230] px-1.5 py-0.5 font-mono text-sm">Backup1</span>. ChudACO appends your Discord username automatically in the backend.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-lg border border-dashed border-[#2C2D3A] bg-[#18181F] px-4 py-2 font-mono text-sm">
              <span className="text-[#B9C6FF]">yourusername</span>
              <span>-</span>
              <span className="text-[#FFCB3C]">Primary</span>
            </div>
            <p className="mt-4 max-w-[68ch]">A ChudACO admin handles any required bot-side profile updates.</p>
          </section>

          <section id="pricing" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">Understanding pricing</h2>
            <p className="mt-2 max-w-[68ch] text-[#9C9AAE]">The PAS fee depends on successful checkouts, not attempts.</p>
            <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#33417D] bg-[#1B2650] px-4 py-3 text-sm text-[#B9C6FF]">
              <span className="font-mono">i</span>
              <span>The ranges and fees below are sample, indicative values only. Actual pricing is shown after you log in.</span>
            </div>
            <div className="mt-4 max-w-[68ch] space-y-2">
              {[
                ["Single packs and blisters", "under $15", "$3 flat"],
                ["Booster bundles", "$15-$60", "$9 flat"],
                ["Elite Trainer Boxes", "$40-$70", "$8 flat"],
                ["Booster boxes and cases", "$100+", "12%"],
                ["Special collections and tins", "any price", "$6 flat"],
              ].map(([category, range, fee]) => (
                <div key={category} className="flex items-center justify-between rounded-lg border border-[#2C2D3A] bg-[#18181F] px-4 py-3">
                  <p className="text-sm">
                    {category} <span className="ml-2 font-mono text-xs text-[#605E72]">{range}</span>
                  </p>
                  <p className="font-mono text-sm font-semibold text-[#B9C6FF]">{fee}</p>
                </div>
              ))}
            </div>
            <p className="mt-4 max-w-[68ch]">Your dashboard Pricing page shows the current rates that apply to your account after login.</p>
          </section>

          <section id="notifications" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">Getting notified</h2>
            <p className="mt-4 max-w-[68ch]">
              Successful checkouts are posted in the server success channel and include a user tag. Results also appear on Overview and Checkouts pages.
            </p>
            <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#33417D] bg-[#1B2650] px-4 py-3 text-sm text-[#B9C6FF]">
              <span className="font-mono">i</span>
              <span>At any time, run <strong>/balance</strong> in Discord to check your current PAS balance without opening the dashboard.</span>
            </div>
            <p className="mt-3 max-w-[68ch]">
              For a fast balance check in Discord, run <span className="rounded border border-[#2C2D3A] bg-[#212230] px-1.5 py-0.5 font-mono text-sm">/balance</span>.
            </p>
          </section>

          <section id="paying" className="border-b border-[#2C2D3A] pb-10">
            <h2 className="font-heading text-2xl font-semibold">Paying your balance</h2>
            <p className="mt-2 max-w-[68ch]">
              After paying outside the app, mark it paid on your Billing page. An admin confirms it and your balance updates.
            </p>
            <div className="mt-4 flex max-w-[68ch] gap-3 rounded-lg border border-[#33417D] bg-[#1B2650] px-4 py-3 text-sm text-[#B9C6FF]">
              <span className="font-mono">i</span>
              <span>
                The payment handles below are sample, indicative values only. Actual billing details are posted in your Billing section or communicated in Discord by a ChudACO admin.
              </span>
            </div>
            <div className="mt-4 flex max-w-[68ch] flex-wrap gap-2 text-sm">
              {[
                ["Venmo", "@chudaco-pas"],
                ["Zelle", "pay@chudaco.io"],
                ["Cash App", "$ChudACOPAS"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[#2C2D3A] bg-[#18181F] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#605E72]">{label}</p>
                  <p className="mt-1">{value}</p>
                </div>
              ))}
            </div>
          </section>

          <section id="faq" className="pb-4">
            <h2 className="font-heading text-2xl font-semibold">FAQ</h2>
            <div className="mt-6 space-y-5 text-[#9C9AAE]">
              <div>
                <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">What happens if a checkout fails?</h3>
                <p className="mt-1">Nothing gets billed. Failed and missed attempts never generate a PAS fee.</p>
              </div>
              <div>
                <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">Can I add more than one account for the same retailer?</h3>
                <p className="mt-1">Yes, as long as you stay within the current 2-account total limit.</p>
              </div>
              <div>
                <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">I changed my Discord username. Do I need to do anything?</h3>
                <p className="mt-1">Message an admin and they will handle any required bot-side profile updates.</p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
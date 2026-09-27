import Image from "next/image";
import { ExternalLink } from "lucide-react";

const recipients = [
  {
    name: "Girish Sekar",
    image: "/images/girish-zelle.webp",
    alt: "Zelle QR code for Girish Sekar",
  },
  {
    name: "Shun X Wang",
    image: "/images/shun-x-wang-zelle-v3.png",
    alt: "Zelle QR code for Shun X Wang",
  },
];

export default function TipPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-heading text-3xl font-bold">Tip the team</h1>
        <p className="mt-1 text-sm text-[#9C9AAE]">
          Choose a teammate and scan their Zelle QR code. Enter the tip amount in your banking app.
        </p>
      </header>

      <section aria-label="Team Zelle QR codes" className="grid gap-5 md:grid-cols-2">
        {recipients.map((recipient) => (
          <article key={recipient.name} className="rounded-lg border border-[#2C2D3A] bg-[#18181F] p-4">
            <div className="mb-4 flex items-baseline justify-between gap-3">
              <h2 className="font-heading text-lg font-semibold">{recipient.name}</h2>
              <span className="text-xs text-[#9C9AAE]">Zelle</span>
            </div>
            <div className="relative mx-auto aspect-[3/4] w-full max-w-sm overflow-hidden rounded-md bg-white">
              <Image
                src={recipient.image}
                alt={recipient.alt}
                fill
                unoptimized
                sizes="(max-width: 768px) 100vw, 40vw"
                className="object-contain"
              />
            </div>
            <a
              href={recipient.image}
              target="_blank"
              rel="noreferrer"
              className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#F2F1F6] transition hover:border-[#9C7BFF] hover:text-[#C6B5FF]"
            >
              <ExternalLink aria-hidden="true" className="h-4 w-4" />
              Open full-size QR
            </a>
          </article>
        ))}
      </section>
    </div>
  );
}
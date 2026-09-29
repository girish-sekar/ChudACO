export const EMAIL_PROVIDER_HOSTS = {
  Gmail: "imap.gmail.com",
  Outlook: "outlook.office365.com",
  Yahoo: "imap.mail.yahoo.com",
  iCloud: "imap.mail.me.com",
  AOL: "imap.aol.com",
  Proton: "imap.protonmail.ch",
  Other: "",
} as const;

export type EmailProvider = keyof typeof EMAIL_PROVIDER_HOSTS;

export function imapHostForProvider(provider: string | null | undefined): string {
  return EMAIL_PROVIDER_HOSTS[provider as EmailProvider] ?? "";
}

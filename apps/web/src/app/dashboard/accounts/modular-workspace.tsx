"use client";

import { useRef, useState, type FormEvent } from "react";
import useSWR from "swr";
import { CircleCheck, CircleX, Download, FileUp, LoaderCircle, Pencil, Plus, Trash2, Upload, X } from "lucide-react";
import { CARD_BRAND_OPTIONS } from "@/lib/card-brand";
import { EMAIL_PROVIDER_HOSTS, imapHostForProvider } from "@/lib/email-providers";
import {
  fetchJson,
  type AcoAccount,
  type AcoCardEntry,
  type AcoImapConfigEntry,
  type AcoProfileEntry,
  type CardOnFile,
  type LinkedAccountRef,
} from "@/lib/dashboard";

type Section = "accounts" | "profiles" | "cards" | "imap";
type LibrarySection = Exclude<Section, "accounts">;
type CsvRow = Record<string, string>;
type ImportState = { rows: CsvRow[]; error: string | null; fileName: string };
type Editor = { section: Section; id: string | null };
type LoginDraft = { retailer: string; loginEmail: string; loginPassword: string; enabled: boolean };
type LinkDraft = { profileId: string; cardId: string; imapConfigId: string; retailerCards: Record<string, string> };
type LinkKey = Exclude<keyof LinkDraft, "retailerCards">;

const emailProviders = Object.keys(EMAIL_PROVIDER_HOSTS);

const profileFields = [
  "shippingName", "shippingPhone", "shippingAddr", "shippingCity", "shippingState", "shippingZip",
  "billingName", "billingPhone", "billingAddr", "billingCity", "billingState", "billingZip",
] as const;

const csvColumns: Record<Section, string[]> = {
  accounts: ["accountNumber", "retailer", "loginEmail", "loginPassword", "enabled", "profileName", "defaultCardName", "retailerCardName", "imapEmail"],
  profiles: [
    "profileName", "shippingName", "shippingPhone", "shippingAddr", "shippingCity", "shippingState", "shippingZip",
    "billingSameAsShipping", "billingName", "billingPhone", "billingAddr", "billingCity", "billingState", "billingZip",
  ],
  cards: ["cardName", "cardholderName", "cardBrand", "cardNumber", "expMonth", "expYear", "cvv"],
  imap: ["email", "emailProvider", "imapHost", "imapPort", "imapSecurity", "password"],
};

const csvRequired: Record<Section, string[]> = {
  accounts: ["accountNumber", "retailer", "loginEmail"],
  profiles: ["profileName"],
  cards: ["cardName", "cardholderName", "cardBrand", "cardNumber", "expMonth", "expYear", "cvv"],
  imap: ["email", "imapPort", "imapSecurity"],
};

const csvExamples: Record<Section, string[]> = {
  accounts: [
    "REPLACE_ME_ACCOUNT_NUMBER", "Target", "REPLACE_ME_EMAIL@example.com", "REPLACE_ME_PASSWORD", "true",
    "REPLACE_ME_PROFILE_NAME", "REPLACE_ME_CARD_NAME", "", "REPLACE_ME_IMAP_EMAIL@example.com",
  ],
  profiles: [
    "REPLACE_ME_PROFILE_NAME", "REPLACE_ME_NAME", "REPLACE_ME_PHONE", "REPLACE_ME_ADDRESS", "REPLACE_ME_CITY",
    "REPLACE_ME_STATE", "REPLACE_ME_ZIP", "true", "", "", "", "", "", "",
  ],
  cards: ["REPLACE_ME_CARD_NAME", "REPLACE_ME_CARDHOLDER", "Visa", "REPLACE_ME_CARD_NUMBER", "12", "2030", "REPLACE_ME_CVV"],
  imap: ["REPLACE_ME_EMAIL@example.com", "Gmail", "imap.gmail.com", "993", "SSL/TLS", "REPLACE_ME_PASSWORD"],
};

const sectionLabels: Record<Section, string> = {
  accounts: "Account info",
  profiles: "Profiles",
  cards: "Cards",
  imap: "IMAP",
};

const itemLabels: Record<Section, string> = {
  accounts: "Account",
  profiles: "Profile",
  cards: "Card",
  imap: "IMAP inbox",
};

const sectionDescriptions: Record<Section, string> = {
  accounts: "Link each account to a profile, a default card, optional per-retailer cards, and an IMAP inbox. CSV rows reference an existing account by accountNumber; link columns use profile name, card name, and inbox email, and retailerCardName applies to that row's retailer.",
  profiles: "Reusable shipping and billing details. Link them to accounts from Account info.",
  cards: "Reusable payment cards. Link them to accounts from Account info.",
  imap: "Reusable IMAP inboxes. Link them to accounts from Account info.",
};

const libraryEndpoints: Record<LibrarySection, string> = {
  profiles: "/api/aco-profiles",
  cards: "/api/aco-cards",
  imap: "/api/aco-imap-configs",
};

function libraryUrl(section: LibrarySection, id?: string | null): string {
  return id ? `${libraryEndpoints[section]}/${id}` : libraryEndpoints[section];
}

function parseCsv(source: string): CsvRow[] {
  const matrix: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
    } else if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(field.trim());
      field = "";
    } else if (character === "\n") {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) matrix.push(row);
      row = [];
      field = "";
    } else if (character !== "\r") {
      field += character;
    }
  }

  row.push(field.trim());
  if (row.some((cell) => cell.length > 0)) matrix.push(row);
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  if (matrix.length < 2) throw new Error("Add a header row and at least one data row.");

  const headers = matrix[0].map((header) => header.trim());
  if (headers.some((header) => !header) || new Set(headers).size !== headers.length) {
    throw new Error("Headers must be present and unique.");
  }

  return matrix.slice(1).map((values, rowIndex) => {
    if (values.length !== headers.length) throw new Error(`Row ${rowIndex + 2} has a different number of columns than the header.`);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function clean(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function toNullable(value: string | null | undefined): string | null {
  return clean(value) || null;
}

function accountBasePayload(account: AcoAccount) {
  return {
    label: account.label,
    retailer: account.retailer,
    email: account.email,
    emailProvider: account.emailProvider,
    onlyOneCheckout: account.onlyOneCheckout,
    loginEmail: account.loginEmail ?? account.retailerLogins[0]?.loginEmail ?? account.email,
    shippingName: account.shippingName,
    shippingPhone: account.shippingPhone,
    shippingAddr: account.shippingAddr,
    shippingCity: account.shippingCity,
    shippingState: account.shippingState,
    shippingZip: account.shippingZip,
    billingSameAsShipping: account.billingSameAsShipping,
    billingName: account.billingName,
    billingPhone: account.billingPhone,
    billingAddr: account.billingAddr,
    billingCity: account.billingCity,
    billingState: account.billingState,
    billingZip: account.billingZip,
    imapHost: account.imapHost,
    imapPort: account.imapPort,
    imapSecurity: account.imapSecurity,
    status: account.status,
  };
}

function downloadTemplate(section: Section) {
  const escapeCsvCell = (value: string) => /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const csv = [csvColumns[section], csvExamples[section]]
    .map((row) => row.map(escapeCsvCell).join(","))
    .join("\n") + "\n";
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `chudaco-${section}-template.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function csvPreviewValue(key: string, value: string): string {
  if (key.toLowerCase().includes("password") || key.toLowerCase() === "cvv") return value ? "••••••" : "";
  if (key.toLowerCase() === "cardnumber" && value) return `•••• ${value.replace(/\D/g, "").slice(-4)}`;
  return value;
}

async function sendJson<T = unknown>(url: string, method: string, body?: unknown): Promise<{ data: T; warning?: string | null }> {
  const response = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error([payload?.error, payload?.detail].filter(Boolean).join(" ") || `Request failed (HTTP ${response.status}).`);
  }
  return payload;
}

function linkedAccountsLabel(accounts: LinkedAccountRef[]): string {
  return accounts.map((account) => `#${account.accountNumber} ${account.label}`).join(", ");
}

function cardSummary(card: AcoCardEntry): string {
  return `${card.label} · ${card.cardBrand} ···· ${card.last4}`;
}

function cardLinkLabels(card: AcoCardEntry): string[] {
  return [
    ...card.accounts.map((account) => `#${account.accountNumber} ${account.label} (default)`),
    ...card.retailerCards.map(({ retailer, acoAccount }) => `#${acoAccount.accountNumber} ${acoAccount.label} (${retailer})`),
  ];
}

export function ModularAccountsWorkspace({
  accounts,
  cardByAccount,
  onRefresh,
  modeSaving,
  onModeChange,
  loading,
  loadError,
  retailers,
}: {
  accounts: AcoAccount[];
  cardByAccount: Record<string, CardOnFile | null>;
  onRefresh: () => Promise<unknown>;
  modeSaving: boolean;
  onModeChange: (mode: "classic" | "modular") => void;
  loading: boolean;
  loadError: boolean;
  retailers: string[];
}) {
  const { data: profilesData, error: profilesError, mutate: mutateProfiles } = useSWR<{ data: AcoProfileEntry[] }>("/api/aco-profiles", fetchJson);
  const { data: cardsData, error: cardsError, mutate: mutateCards } = useSWR<{ data: AcoCardEntry[] }>("/api/aco-cards", fetchJson);
  const { data: imapData, error: imapError, mutate: mutateImap } = useSWR<{ data: AcoImapConfigEntry[] }>("/api/aco-imap-configs", fetchJson);
  const profiles = profilesData?.data ?? [];
  const cards = cardsData?.data ?? [];
  const imapConfigs = imapData?.data ?? [];
  const librariesLoaded = Boolean(profilesData && cardsData && imapData);
  const libraryError = Boolean(profilesError || cardsError || imapError);

  const [section, setSection] = useState<Section>("accounts");
  const [importState, setImportState] = useState<ImportState>({ rows: [], error: null, fileName: "" });
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [loginDrafts, setLoginDrafts] = useState<LoginDraft[]>([]);
  const [linkDraft, setLinkDraft] = useState<LinkDraft>({ profileId: "", cardId: "", imapConfigId: "", retailerCards: {} });
  const [importingCards, setImportingCards] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [testingImapId, setTestingImapId] = useState<string | null>(null);
  const [imapTestResults, setImapTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  const profileById = new Map(profiles.map((profile) => [profile.id, profile]));
  const cardById = new Map(cards.map((card) => [card.id, card]));
  const imapById = new Map(imapConfigs.map((config) => [config.id, config]));

  const editingAccount = editor?.section === "accounts" && editor.id ? accounts.find((account) => account.id === editor.id) ?? null : null;
  const editingProfile = editor?.section === "profiles" && editor.id ? profileById.get(editor.id) ?? null : null;
  const editingCard = editor?.section === "cards" && editor.id ? cardById.get(editor.id) ?? null : null;
  const editingImap = editor?.section === "imap" && editor.id ? imapById.get(editor.id) ?? null : null;
  const editingLinks = editingCard
    ? cardLinkLabels(editingCard)
    : (editingProfile?.accounts ?? editingImap?.accounts ?? []).map((account) => `#${account.accountNumber} ${account.label}`);
  const draftRetailers = Array.from(
    new Map(loginDrafts.map((login) => login.retailer.trim()).filter(Boolean).map((retailer) => [retailer.toLowerCase(), retailer])).values(),
  );
  const draftRetailerCard = (retailer: string) =>
    Object.entries(linkDraft.retailerCards).find(([key]) => key.toLowerCase() === retailer.toLowerCase())?.[1] ?? "";

  const retailerChoices = Array.from(new Set([
    ...retailers,
    ...accounts.flatMap((account) => [account.retailer, ...account.retailerLogins.map((login) => login.retailer), ...(account.retailerCards ?? []).map((card) => card.retailer)]),
  ]));
  const providerChoices = Array.from(new Set([
    ...emailProviders,
    ...imapConfigs.map((config) => config.emailProvider).filter((provider): provider is string => Boolean(provider)),
  ]));

  async function refreshAll() {
    await Promise.all([onRefresh(), mutateProfiles(), mutateCards(), mutateImap()]);
  }

  function field(label: string, name: string, defaultValue = "", type = "text", required = false) {
    return (
      <label className="grid gap-1 text-xs text-[#9C9AAE]">
        <span>{label}</span>
        <input
          name={name}
          type={type}
          defaultValue={defaultValue}
          required={required}
          className="min-w-0 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
        />
      </label>
    );
  }

  function linkSelect(label: string, key: LinkKey, options: Array<{ id: string; label: string }>) {
    return (
      <label className="grid gap-1 text-xs text-[#9C9AAE]">
        <span>{label}</span>
        <select
          value={linkDraft[key]}
          onChange={(event) => setLinkDraft((current) => ({ ...current, [key]: event.target.value }))}
          className="min-w-0 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
        >
          <option value="">Not linked</option>
          {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
        </select>
      </label>
    );
  }

  function selectSection(next: Section) {
    setSection(next);
    setImportState({ rows: [], error: null, fileName: "" });
    setStatus(null);
    setActionError(null);
    setEditor(null);
  }

  function openEditor(nextSection: Section, id?: string | null) {
    setEditor({ section: nextSection, id: id ?? null });
    setEditorError(null);
    setStatus(null);
    setActionError(null);
    if (nextSection === "accounts") {
      const account = id ? accounts.find((entry) => entry.id === id) : undefined;
      setLoginDrafts(account
        ? (account.retailerLogins.length ? account.retailerLogins : [{ id: account.id, retailer: account.retailer, loginEmail: account.loginEmail ?? "", enabled: true }])
            .map(({ retailer: loginRetailer, loginEmail, enabled }) => ({ retailer: loginRetailer, loginEmail, loginPassword: "", enabled }))
        : [{ retailer: "", loginEmail: "", loginPassword: "", enabled: true }]);
      setLinkDraft({
        profileId: account?.profileId ?? "",
        cardId: account?.cardId ?? "",
        imapConfigId: account?.imapConfigId ?? "",
        retailerCards: Object.fromEntries((account?.retailerCards ?? []).map((card) => [card.retailer, card.cardId ?? ""])),
      });
    }
  }

  function updateLoginDraft(index: number, field: keyof LoginDraft, value: string | boolean) {
    setLoginDrafts((current) => current.map((login, entryIndex) => entryIndex === index ? { ...login, [field]: value } : login));
  }

  async function testImapConnection(config: AcoImapConfigEntry) {
    setTestingImapId(config.id);
    setImapTestResults((current) => {
      const next = { ...current };
      delete next[config.id];
      return next;
    });

    try {
      const response = await fetch(`/api/aco-imap-configs/${config.id}/test`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      const success = response.ok && payload?.success === true;
      const message = success
        ? "IMAP connection succeeded."
        : payload?.error ?? `IMAP test failed (HTTP ${response.status}).`;
      setImapTestResults((current) => ({ ...current, [config.id]: { success, message } }));
    } catch (error) {
      setImapTestResults((current) => ({
        ...current,
        [config.id]: {
          success: false,
          message: error instanceof Error ? error.message : "Could not reach the IMAP test service.",
        },
      }));
    } finally {
      setTestingImapId(null);
    }
  }

  async function deleteAccount(account: AcoAccount) {
    const name = `#${account.accountNumber} ${account.label}`;
    if (!window.confirm(`Delete account ${name}? Linked profiles, cards, and IMAP inboxes stay in your library.`)) return;
    setDeletingId(account.id);
    setStatus(null);
    setActionError(null);
    try {
      await sendJson(`/api/aco-accounts/${account.id}`, "DELETE");
      if (editor?.section === "accounts" && editor.id === account.id) setEditor(null);
      await refreshAll();
      setStatus(`Account ${name} deleted.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Failed to delete account.");
    } finally {
      setDeletingId(null);
    }
  }

  async function deleteEntry(kind: LibrarySection, id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    setDeletingId(id);
    setStatus(null);
    setActionError(null);
    try {
      await sendJson(libraryUrl(kind, id), "DELETE");
      await refreshAll();
      setStatus(`${name} deleted.`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not delete.");
    } finally {
      setDeletingId(null);
    }
  }

  async function importExistingCards() {
    setImportingCards(true);
    setStatus(null);
    setActionError(null);
    try {
      const { data } = await sendJson<{ created: number; linked: number; skipped: string[] }>("/api/aco-cards/import", "POST");
      await refreshAll();
      setStatus(`Imported ${data.created} card${data.created === 1 ? "" : "s"} and linked ${data.linked} account card${data.linked === 1 ? "" : "s"}.`);
      if (data.skipped.length) setActionError(`Skipped: ${data.skipped.join(" ")}`);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : "Could not import existing cards.");
    } finally {
      setImportingCards(false);
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const formData = new FormData(event.currentTarget);
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const nullable = (name: string) => value(name) || null;
    const warnings: string[] = [];
    setSavingEditor(true);
    setEditorError(null);
    try {
      if (editor.section === "accounts") {
        const logins = loginDrafts.map((login) => ({
          retailer: login.retailer.trim(),
          loginEmail: login.loginEmail.trim(),
          loginPassword: login.loginPassword.trim() || undefined,
          enabled: login.enabled,
        }));
        if (logins.length === 0 || logins.some((login) => !login.retailer || !/^\S+@\S+\.\S+$/.test(login.loginEmail))) {
          throw new Error("Add at least one retailer login with a valid email.");
        }
        const accountFields = {
          label: value("label"),
          retailer: logins[0].retailer,
          email: editingAccount?.email ?? null,
          emailProvider: editingAccount?.emailProvider ?? null,
          onlyOneCheckout: formData.get("onlyOneCheckout") === "on",
          loginEmail: logins[0].loginEmail,
          retailerLogins: logins,
          imapHost: editingAccount?.imapHost ?? null,
          imapPort: editingAccount?.imapPort ?? 993,
          imapSecurity: editingAccount?.imapSecurity ?? "SSL/TLS",
          status: editingAccount?.status ?? "active",
        };
        if (!accountFields.label) throw new Error("Enter an account label.");
        const saved = await sendJson<{ id: string }>(
          editingAccount ? `/api/aco-accounts/${editingAccount.id}` : "/api/aco-accounts",
          editingAccount ? "PATCH" : "POST",
          { ...(editingAccount ? accountBasePayload(editingAccount) : {}), ...accountFields },
        );
        if (saved.warning) warnings.push(saved.warning);
        if (!editingAccount) {
          // Retrying after a failed link step must edit the new account, not create another.
          await onRefresh();
          setEditor((current) => current ? { ...current, id: saved.data.id } : current);
        }
        const linked = await sendJson(`/api/aco-accounts/${saved.data.id}/links`, "PUT", {
          profileId: linkDraft.profileId || null,
          cardId: linkDraft.cardId || null,
          imapConfigId: linkDraft.imapConfigId || null,
          retailerCards: Object.fromEntries(
            Array.from(new Set(logins.map((login) => login.retailer)))
              .map((retailer) => [retailer, draftRetailerCard(retailer) || null]),
          ),
        });
        if (linked.warning) warnings.push(linked.warning);
      } else if (editor.section === "profiles") {
        const sameBilling = formData.get("billingSameAsShipping") === "on";
        if (!value("name")) throw new Error("Enter a profile name.");
        const saved = await sendJson(libraryUrl("profiles", editor.id), editor.id ? "PATCH" : "POST", {
          name: value("name"),
          billingSameAsShipping: sameBilling,
          ...Object.fromEntries(profileFields.map((key) => [key, sameBilling && key.startsWith("billing") ? null : nullable(key)])),
        });
        if (saved.warning) warnings.push(saved.warning);
      } else if (editor.section === "imap") {
        const email = value("email");
        const port = Number(value("imapPort"));
        if (!/^\S+@\S+\.\S+$/.test(email) || !value("imapHost") || !value("imapSecurity") || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error("Enter a valid email, IMAP host, port, and security setting.");
        }
        const saved = await sendJson(libraryUrl("imap", editor.id), editor.id ? "PATCH" : "POST", {
          email,
          emailProvider: nullable("emailProvider"),
          imapHost: value("imapHost"),
          imapPort: port,
          imapSecurity: value("imapSecurity"),
          password: value("imapPassword") || undefined,
        });
        if (saved.warning) warnings.push(saved.warning);
      } else {
        const cardNumber = value("cardNumber").replace(/\D/g, "");
        const cvv = value("cvv");
        const expMonth = Number(value("expMonth"));
        const expYear = Number(value("expYear"));
        const replacingNumber = !editor.id || Boolean(cardNumber || cvv);
        if (!value("label") || !value("cardholderName") || !value("cardBrand") || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear)) {
          throw new Error("Enter a card name, cardholder, brand, and expiration.");
        }
        if (replacingNumber && (!/^\d{12,19}$/.test(cardNumber) || !/^\d{3,4}$/.test(cvv))) {
          throw new Error(editor.id ? "To replace the card number, enter both a valid card number and CVV." : "Enter a valid card number and CVV.");
        }
        const saved = await sendJson(libraryUrl("cards", editor.id), editor.id ? "PATCH" : "POST", {
          label: value("label"),
          cardholderName: value("cardholderName"),
          cardBrand: value("cardBrand"),
          expMonth,
          expYear,
          ...(replacingNumber ? { cardNumber, cvv } : {}),
        });
        if (saved.warning) warnings.push(saved.warning);
      }

      const savedSection = editor.section;
      const wasEdit = Boolean(editor.id);
      setEditor(null);
      await refreshAll();
      setStatus(`${itemLabels[savedSection]} ${wasEdit ? "updated" : "added"}.${warnings.length ? ` Warning: ${warnings.join(" ")}` : ""}`);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : "Could not save changes.");
    } finally {
      setSavingEditor(false);
    }
  }

  async function handleFile(file?: File) {
    setStatus(null);
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const headers = Object.keys(rows[0] ?? {});
      const missing = csvRequired[section].filter((column) => !headers.includes(column));
      const unknown = headers.filter((column) => !csvColumns[section].includes(column));
      if (missing.length || unknown.length) {
        throw new Error([
          missing.length ? `Missing columns: ${missing.join(", ")}.` : "",
          unknown.length ? `Unknown columns: ${unknown.join(", ")}.` : "",
        ].filter(Boolean).join(" "));
      }
      if (section === "profiles" && !headers.some((header) => header !== "profileName")) {
        throw new Error("Add at least one profile field to the CSV.");
      }
      setImportState({ rows, error: null, fileName: file.name });
    } catch (error) {
      setImportState({ rows: [], error: error instanceof Error ? error.message : "Could not read this CSV.", fileName: file.name });
    }
  }

  async function patchAccount(account: AcoAccount, fields: Record<string, unknown>) {
    return sendJson(`/api/aco-accounts/${account.id}`, "PATCH", { ...accountBasePayload(account), ...fields });
  }

  async function importRows() {
    setImporting(true);
    setStatus(null);
    const errors: string[] = [];
    const warnings: string[] = [];
    let imported = 0;
    const assertNoPlaceholders = (row: CsvRow) => {
      if (Object.values(row).some((value) => value.toUpperCase().includes("REPLACE_ME"))) {
        throw new Error("Replace all REPLACE_ME example values before importing this row.");
      }
    };
    const accountFor = (row: CsvRow) => {
      assertNoPlaceholders(row);
      const number = Number(row.accountNumber);
      if (!Number.isInteger(number) || number < 1) throw new Error("Account number must be a positive integer.");
      const account = accounts.find((entry) => entry.accountNumber === number);
      if (!account) throw new Error(`Account #${number} was not found.`);
      return account;
    };

    try {
      if (section === "accounts") {
        const grouped = new Map<number, { account: AcoAccount; rows: CsvRow[] }>();
        for (const row of importState.rows) {
          try {
            const account = accountFor(row);
            if (!clean(row.retailer) || !/^\S+@\S+\.\S+$/.test(clean(row.loginEmail))) throw new Error("Retailer and valid loginEmail are required.");
            const group = grouped.get(account.accountNumber) ?? { account, rows: [] };
            group.rows.push(row);
            grouped.set(account.accountNumber, group);
          } catch (error) {
            errors.push(`CSV row ${importState.rows.indexOf(row) + 2}: ${error instanceof Error ? error.message : "Invalid row."}`);
          }
        }
        const profileIds = new Map(profiles.map((profile) => [profile.name.toLowerCase(), profile.id]));
        const cardIds = new Map(cards.map((card) => [card.label.toLowerCase(), card.id]));
        const imapIds = new Map(imapConfigs.map((config) => [config.email.toLowerCase(), config.id]));

        for (const { account, rows } of grouped.values()) {
          const logins: Array<{ retailer: string; loginEmail: string; loginPassword?: string; enabled: boolean }> =
            account.retailerLogins.map(({ retailer, loginEmail, enabled }) => ({ retailer, loginEmail, enabled }));
          for (const row of rows) {
            const retailer = clean(row.retailer);
            const current = logins.find((entry) => entry.retailer.toLowerCase() === retailer.toLowerCase());
            const next = {
              retailer,
              loginEmail: clean(row.loginEmail),
              loginPassword: clean(row.loginPassword) || undefined,
              enabled: row.enabled ? row.enabled.toLowerCase() === "true" : current?.enabled ?? true,
            };
            if (current) Object.assign(current, next);
            else logins.push(next);
          }
          try {
            const links: Record<string, unknown> = {};
            const resolveLink = (column: string, ids: Map<string, string>, key: string, label: string) => {
              const name = rows.map((row) => clean(row[column])).find(Boolean);
              if (!name) return;
              const id = ids.get(name.toLowerCase());
              if (!id) throw new Error(`${label} "${name}" was not found. Create it in its tab first.`);
              links[key] = id;
            };
            resolveLink("profileName", profileIds, "profileId", "Profile");
            resolveLink("defaultCardName", cardIds, "cardId", "Card");
            resolveLink("imapEmail", imapIds, "imapConfigId", "IMAP inbox");
            const retailerCards: Record<string, string> = {};
            for (const row of rows) {
              const name = clean(row.retailerCardName);
              if (!name) continue;
              const id = cardIds.get(name.toLowerCase());
              if (!id) throw new Error(`Card "${name}" was not found. Create it in its tab first.`);
              retailerCards[clean(row.retailer)] = id;
            }
            if (Object.keys(retailerCards).length) links.retailerCards = retailerCards;

            await patchAccount(account, { retailerLogins: logins });
            if (Object.keys(links).length) {
              const linked = await sendJson(`/api/aco-accounts/${account.id}/links`, "PUT", links);
              if (linked.warning) warnings.push(`Account #${account.accountNumber}: ${linked.warning}`);
            }
            imported += rows.length;
          } catch (error) {
            errors.push(`Account #${account.accountNumber}: ${error instanceof Error ? error.message : "Could not update account."}`);
          }
        }
      } else {
        const knownProfiles = new Map(profiles.map((profile) => [profile.name.toLowerCase(), profile]));
        const knownCards = new Map(cards.map((card) => [card.label.toLowerCase(), card]));
        const knownImap = new Map(imapConfigs.map((config) => [config.email.toLowerCase(), config]));

        for (const [index, row] of importState.rows.entries()) {
          try {
            assertNoPlaceholders(row);
            let warning: string | null | undefined;
            if (section === "profiles") {
              const name = clean(row.profileName);
              if (!name) throw new Error("profileName is required.");
              const existing = knownProfiles.get(name.toLowerCase());
              const billingSameValue = clean(row.billingSameAsShipping).toLowerCase();
              const saved = await sendJson<AcoProfileEntry>(libraryUrl("profiles", existing?.id), existing ? "PATCH" : "POST", {
                name: existing?.name ?? name,
                billingSameAsShipping: billingSameValue ? billingSameValue === "true" : existing?.billingSameAsShipping ?? true,
                ...Object.fromEntries(profileFields.map((key) => [key, row[key] === undefined ? existing?.[key] ?? null : toNullable(row[key])])),
              });
              knownProfiles.set(name.toLowerCase(), saved.data);
              warning = saved.warning;
            } else if (section === "imap") {
              const email = clean(row.email);
              const port = Number(row.imapPort);
              if (!/^\S+@\S+\.\S+$/.test(email) || !Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error("Enter a valid email and IMAP port (1-65535).");
              }
              const existing = knownImap.get(email.toLowerCase());
              const emailProvider = row.emailProvider === undefined ? existing?.emailProvider ?? null : toNullable(row.emailProvider);
              const imapHost = clean(row.imapHost) || imapHostForProvider(emailProvider) || existing?.imapHost || "";
              if (!imapHost) throw new Error("Enter an imapHost, or a known emailProvider to fill it in.");
              const saved = await sendJson<AcoImapConfigEntry>(libraryUrl("imap", existing?.id), existing ? "PATCH" : "POST", {
                email,
                emailProvider,
                imapHost,
                imapPort: port,
                imapSecurity: clean(row.imapSecurity),
                password: clean(row.password) || undefined,
              });
              knownImap.set(email.toLowerCase(), saved.data);
              warning = saved.warning;
            } else {
              const name = clean(row.cardName);
              const expMonth = Number(row.expMonth);
              const expYear = Number(row.expYear);
              if (!name) throw new Error("cardName is required.");
              if (!/^\d{12,19}$/.test(row.cardNumber.replace(/\D/g, "")) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || !row.cvv.trim()) {
                throw new Error("Enter a valid card number, expiration, and CVV.");
              }
              const existing = knownCards.get(name.toLowerCase());
              const saved = await sendJson<AcoCardEntry>(libraryUrl("cards", existing?.id), existing ? "PATCH" : "POST", {
                label: existing?.label ?? name,
                cardholderName: clean(row.cardholderName),
                cardBrand: clean(row.cardBrand),
                cardNumber: row.cardNumber.replace(/\D/g, ""),
                expMonth,
                expYear,
                cvv: clean(row.cvv),
              });
              knownCards.set(name.toLowerCase(), saved.data);
              warning = saved.warning;
            }
            if (warning) warnings.push(`CSV row ${index + 2}: ${warning}`);
            imported += 1;
          } catch (error) {
            errors.push(`CSV row ${index + 2}: ${error instanceof Error ? error.message : "Import failed."}`);
          }
        }
      }

      await refreshAll();
      setStatus(`${imported} row${imported === 1 ? "" : "s"} imported${errors.length ? `; ${errors.length} row${errors.length === 1 ? "" : "s"} need attention` : " successfully"}.${warnings.length ? ` Warning: ${warnings.join(" ")}` : ""}`);
      setImportState((current) => ({ ...current, rows: [] }));
      if (fileRef.current) fileRef.current.value = "";
    } finally {
      setImporting(false);
    }
    if (errors.length) setImportState((current) => ({ ...current, error: errors.slice(0, 8).join("\n") }));
  }

  const modeToggle = (
    <div className="inline-flex rounded-md border border-[#2C2D3A] p-1" aria-label="Account management mode">
      <button type="button" disabled={modeSaving} className="rounded px-3 py-1.5 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]" onClick={() => onModeChange("classic")}>Classic</button>
      <button type="button" disabled={modeSaving} aria-pressed="true" className="rounded bg-[#2F5BFF] px-3 py-1.5 text-xs font-medium text-white">Modular</button>
    </div>
  );

  const setupIssues = accounts.flatMap((account) => {
    const issues: Array<{ section: Section; targetId: string; message: string }> = [];
    const validLogins = account.retailerLogins.filter((login) => login.enabled && /^\S+@\S+\.\S+$/.test(login.loginEmail));
    if (validLogins.length === 0) issues.push({ section: "accounts", targetId: account.id, message: "Add an enabled retailer login with a valid email." });

    const profile = account.profileId ? profileById.get(account.profileId) : undefined;
    if (!account.profileId) {
      issues.push({ section: "accounts", targetId: account.id, message: "Link a shipping profile." });
    } else if (profile) {
      const missingProfileFields = [
        [profile.shippingName, "shipping name"],
        [profile.shippingAddr, "shipping address"],
        [profile.shippingCity, "shipping city"],
        [profile.shippingState, "shipping state"],
        [profile.shippingZip, "shipping ZIP"],
      ].filter(([value]) => !value).map(([, label]) => label);
      if (missingProfileFields.length) {
        issues.push({ section: "profiles", targetId: profile.id, message: `Complete profile "${profile.name}": ${missingProfileFields.join(", ")}.` });
      }
    }

    const linkedRetailers = new Set((account.retailerCards ?? []).map((card) => card.retailer.toLowerCase()));
    const missingCardRetailers = (account.retailerLogins.length ? account.retailerLogins : [{ retailer: account.retailer, enabled: true }])
      .filter((login) => login.enabled && !linkedRetailers.has(login.retailer.toLowerCase()));
    if (!account.cardId && account.id in cardByAccount && !cardByAccount[account.id] && missingCardRetailers.length) {
      issues.push({ section: "accounts", targetId: account.id, message: "Link a card." });
    }

    const imap = account.imapConfigId ? imapById.get(account.imapConfigId) : undefined;
    if (!account.imapConfigId) {
      issues.push({ section: "accounts", targetId: account.id, message: "Link an IMAP inbox; IMAP sync and verification emails are unavailable." });
    } else if (imap && !imap.passwordSet) {
      issues.push({ section: "imap", targetId: imap.id, message: `IMAP inbox ${imap.email} has no saved password.` });
    }

    return issues.map((issue) => ({ ...issue, account }));
  });

  const notLinked = <span className="text-[#FFDB79]">Not linked</span>;
  const thClass = "bg-[#18181F] px-3 py-3 text-xs font-medium text-[#9C9AAE]";
  const iconButtonClass = "rounded border border-[#2C2D3A] p-2 text-[#9C9AAE] hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

  function libraryActions(kind: LibrarySection, id: string, name: string, linkedCount: number) {
    return (
      <div className="flex gap-2">
        <button type="button" aria-label={`Edit ${name}`} onClick={() => openEditor(kind, id)} className={iconButtonClass}><Pencil className="h-4 w-4" /></button>
        <button
          type="button"
          aria-label={`Delete ${name}`}
          title={linkedCount ? "Unlink from all accounts before deleting" : undefined}
          disabled={linkedCount > 0 || deletingId === id}
          onClick={() => void deleteEntry(kind, id, name)}
          className={iconButtonClass}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    );
  }

  function linkedAccountsCell(linked: LinkedAccountRef[]) {
    return linked.length ? linkedAccountsLabel(linked) : <span className="text-[#605E72]">None</span>;
  }

  const emptyMessage = section === "accounts"
    ? accounts.length === 0 ? "No accounts to display." : null
    : section === "profiles"
      ? profiles.length === 0 ? "No profiles yet." : null
      : section === "cards"
        ? cards.length === 0 ? "No cards yet." : null
        : imapConfigs.length === 0 ? "No IMAP inboxes yet." : null;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Account management</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Create profiles, cards, and IMAP inboxes once, then link them to accounts from Account info.</p>
        </div>
        {modeToggle}
      </header>

      {!loading && !loadError && librariesLoaded ? (
        <section aria-labelledby="setup-readiness-title" className={`rounded-md border p-4 ${setupIssues.length ? "border-[#FFCB3C]/40 bg-[#241F11]" : "border-[#4ADE80]/30 bg-[#102119]"}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="setup-readiness-title" className="font-heading text-base font-semibold">Setup readiness</h2>
            <p className={`text-xs ${setupIssues.length ? "text-[#FFDB79]" : "text-[#4ADE80]"}`}>
              {setupIssues.length ? `${setupIssues.length} item${setupIssues.length === 1 ? "" : "s"} need attention` : "All linked setup details are complete"}
            </p>
          </div>
          {setupIssues.length ? (
            <ul className="mt-3 divide-y divide-[#3A3320]">
              {setupIssues.map((issue, index) => (
                <li key={`${issue.account.id}-${issue.section}-${index}`} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-[#F2F1F6]"><span className="text-[#FFDB79]">#{issue.account.accountNumber} {issue.account.label}:</span> {issue.message}</p>
                  <button type="button" onClick={() => { setSection(issue.section); openEditor(issue.section, issue.targetId); }} className="shrink-0 rounded-md border border-[#6B5928] px-3 py-1.5 text-xs font-medium text-[#FFDB79] hover:bg-[#332A14]">
                    Resolve in {sectionLabels[issue.section]}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      <nav aria-label="Account sections" className="flex flex-wrap gap-2 border-b border-[#2C2D3A] pb-3">
        {(Object.keys(sectionLabels) as Section[]).map((key) => (
          <button key={key} type="button" aria-pressed={section === key} onClick={() => selectSection(key)} className={`rounded-md px-3 py-2 text-sm ${section === key ? "bg-[#2F5BFF] text-white" : "text-[#9C9AAE] hover:bg-[#18181F] hover:text-[#F2F1F6]"}`}>
            {sectionLabels[key]}
          </button>
        ))}
      </nav>

      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-heading text-xl font-semibold">{sectionLabels[section]}</h2>
            <p className="mt-1 text-xs text-[#9C9AAE]">{sectionDescriptions[section]}</p>
            <p className="mt-1 text-xs text-[#605E72]">The template includes an example row. Replace every REPLACE_ME value before importing.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openEditor(section)} className="inline-flex items-center gap-2 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-white hover:bg-[#2448D8]">
              <Plus aria-hidden="true" className="h-4 w-4" />
              Add {itemLabels[section].toLowerCase()}
            </button>
            {section === "cards" ? (
              <button type="button" disabled={importingCards} onClick={() => void importExistingCards()} className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60">
                {importingCards ? <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
                Import existing account cards
              </button>
            ) : null}
            <button type="button" onClick={() => downloadTemplate(section)} className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]">
              <Download aria-hidden="true" className="h-4 w-4" /> Template
            </button>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-white hover:bg-[#2448D8]">
              <FileUp aria-hidden="true" className="h-4 w-4" /> Upload CSV
              <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => void handleFile(event.target.files?.[0])} />
            </label>
          </div>
        </div>

        {section === "cards" || section === "imap" ? (
          <p className="rounded-md border border-[#FFCB3C]/30 bg-[#2B2411] px-3 py-2 text-xs text-[#FFDB79]">
            {section === "cards"
              ? "Card values are sent to the configured secure relay. Full card numbers and CVVs are not stored in the database."
              : "Passwords are encrypted before being saved. Leave password blank to keep the current password."}
          </p>
        ) : null}

        {status ? <p role="status" className="text-sm text-[#4ADE80]">{status}</p> : null}
        {actionError ? <p role="alert" className="text-sm text-[#FF5D5D]">{actionError}</p> : null}
        {loadError ? <p role="alert" className="text-sm text-[#FF5D5D]">Failed to load account data.</p> : null}
        {libraryError ? <p role="alert" className="text-sm text-[#FF5D5D]">Failed to load profiles, cards, or IMAP inboxes.</p> : null}
        {importState.error ? <pre role="alert" className="whitespace-pre-wrap rounded-md border border-[#FF5D5D]/30 bg-[#2A1317] p-3 text-xs text-[#FFC0C0]">{importState.error}</pre> : null}

        {editor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="modular-editor-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#2C2D3A] bg-[#18181F] p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 id="modular-editor-title" className="font-heading text-xl font-semibold">{editor.id ? "Edit" : "Add"} {itemLabels[editor.section].toLowerCase()}</h3>
                  <p className="mt-1 text-xs text-[#9C9AAE]">
                    {editor.section === "profiles"
                      ? "Reusable shipping and billing details."
                      : editor.section === "cards"
                        ? "Full card details are sent to the configured secure relay; only masked details are stored."
                        : editor.section === "imap"
                          ? "Leave the password blank to keep the saved password."
                          : "Retailer credentials are saved through the existing encrypted account API."}
                  </p>
                </div>
                <button type="button" aria-label="Close editor" onClick={() => setEditor(null)} className="rounded-md p-2 text-[#9C9AAE] hover:bg-[#101014] hover:text-white"><X className="h-4 w-4" /></button>
              </div>

              <form onSubmit={(event) => void submitEditor(event)} className="space-y-4">
                {editor.section !== "accounts" && editingLinks.length ? (
                  <p className="rounded-md border border-[#2F5BFF]/30 bg-[#111A33] px-3 py-2 text-xs text-[#AFC2FF]">
                    Linked to {editingLinks.join(", ")}. Saving updates every linked account.
                  </p>
                ) : null}

                {editor.section === "accounts" ? (
                  <>
                    {field("Account label", "label", editingAccount?.label ?? "", "text", true)}
                    <label className="flex items-center gap-2 text-sm text-[#9C9AAE]"><input type="checkbox" name="onlyOneCheckout" defaultChecked={editingAccount?.onlyOneCheckout ?? true} />Only one checkout</label>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between"><h4 className="text-sm font-medium">Retailer logins</h4><button type="button" onClick={() => setLoginDrafts((current) => [...current, { retailer: "", loginEmail: "", loginPassword: "", enabled: true }])} className="rounded border border-[#2C2D3A] px-2 py-1 text-xs text-[#9C9AAE] hover:text-white">Add retailer login</button></div>
                      {loginDrafts.map((login, index) => (
                        <div key={index} className="grid gap-2 rounded-md border border-[#2C2D3A] p-3 sm:grid-cols-2">
                          <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Retailer</span><select required value={login.retailer} onChange={(event) => updateLoginDraft(index, "retailer", event.target.value)} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"><option value="">Select retailer</option>{retailerChoices.map((retailer) => <option key={retailer} value={retailer}>{retailer}</option>)}</select></label>
                          <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Login email</span><input required type="email" value={login.loginEmail} onChange={(event) => updateLoginDraft(index, "loginEmail", event.target.value)} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]" /></label>
                          <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>{editingAccount ? "New password (blank keeps current)" : "Password (optional)"}</span><input type="password" value={login.loginPassword} onChange={(event) => updateLoginDraft(index, "loginPassword", event.target.value)} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]" /></label>
                          <div className="flex items-end justify-between gap-2"><label className="flex items-center gap-2 pb-2 text-xs text-[#9C9AAE]"><input type="checkbox" checked={login.enabled} onChange={(event) => updateLoginDraft(index, "enabled", event.target.checked)} />Enabled</label>{loginDrafts.length > 1 ? <button type="button" onClick={() => setLoginDrafts((current) => current.filter((_, rowIndex) => rowIndex !== index))} className="pb-2 text-xs text-[#FF9A9A]">Remove</button> : null}</div>
                        </div>
                      ))}
                    </div>
                    <div className="space-y-3 rounded-md border border-[#2C2D3A] p-3">
                      <div>
                        <h4 className="text-sm font-medium">Linked setup</h4>
                        <p className="mt-1 text-xs text-[#9C9AAE]">Create profiles, cards, and IMAP inboxes in their tabs, then link them here.</p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-3">
                        {linkSelect("Profile", "profileId", profiles.map((profile) => ({ id: profile.id, label: profile.name })))}
                        {linkSelect("Default card", "cardId", cards.map((card) => ({ id: card.id, label: cardSummary(card) })))}
                        {linkSelect("IMAP inbox", "imapConfigId", imapConfigs.map((config) => ({ id: config.id, label: config.email })))}
                      </div>
                      {draftRetailers.length ? (
                        <div className="space-y-2">
                          <h5 className="text-xs font-medium text-[#F2F1F6]">Retailer cards</h5>
                          <div className="grid gap-3 sm:grid-cols-2">
                            {draftRetailers.map((retailer) => {
                              const current = editingAccount?.retailerCards?.find((card) => card.retailer.toLowerCase() === retailer.toLowerCase());
                              const selected = draftRetailerCard(retailer);
                              return (
                                <label key={retailer.toLowerCase()} className="grid gap-1 text-xs text-[#9C9AAE]">
                                  <span>{retailer}</span>
                                  <select
                                    value={selected}
                                    onChange={(event) => setLinkDraft((draft) => ({
                                      ...draft,
                                      retailerCards: {
                                        ...Object.fromEntries(Object.entries(draft.retailerCards).filter(([key]) => key.toLowerCase() !== retailer.toLowerCase())),
                                        [retailer]: event.target.value,
                                      },
                                    }))}
                                    className="min-w-0 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
                                  >
                                    <option value="">{current && !current.cardId ? `Keep current (···· ${current.last4 ?? "----"}, not from library)` : "Use default card"}</option>
                                    {cards.map((card) => <option key={card.id} value={card.id}>{cardSummary(card)}</option>)}
                                  </select>
                                  {current?.cardId && !selected ? <span className="text-[#FFDB79]">Unlinking removes the {retailer} card; the default card is used instead.</span> : null}
                                </label>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {editingAccount && !editingAccount.cardId && cardByAccount[editingAccount.id] ? (
                        <p className="text-xs text-[#FFDB79]">
                          This account has a default card ending in {cardByAccount[editingAccount.id]?.last4 ?? "----"} that isn&apos;t in your card library. Linking a library card replaces it.
                        </p>
                      ) : null}
                      {editingAccount && ((editingAccount.profileId && !linkDraft.profileId) || (editingAccount.cardId && !linkDraft.cardId) || (editingAccount.imapConfigId && !linkDraft.imapConfigId)) ? (
                        <p className="text-xs text-[#FFDB79]">Unlinking clears those details from this account.</p>
                      ) : null}
                    </div>
                  </>
                ) : null}

                {editor.section === "profiles" ? (
                  <>
                    {field("Profile name", "name", editingProfile?.name ?? "", "text", true)}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("Shipping name", "shippingName", editingProfile?.shippingName ?? "")}
                      {field("Shipping phone", "shippingPhone", editingProfile?.shippingPhone ?? "", "tel")}
                      {field("Shipping address", "shippingAddr", editingProfile?.shippingAddr ?? "")}
                      {field("Shipping city", "shippingCity", editingProfile?.shippingCity ?? "")}
                      {field("Shipping state", "shippingState", editingProfile?.shippingState ?? "")}
                      {field("Shipping ZIP", "shippingZip", editingProfile?.shippingZip ?? "")}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#9C9AAE]"><input type="checkbox" name="billingSameAsShipping" defaultChecked={editingProfile?.billingSameAsShipping ?? true} />Billing same as shipping</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("Billing name", "billingName", editingProfile?.billingName ?? "")}
                      {field("Billing phone", "billingPhone", editingProfile?.billingPhone ?? "", "tel")}
                      {field("Billing address", "billingAddr", editingProfile?.billingAddr ?? "")}
                      {field("Billing city", "billingCity", editingProfile?.billingCity ?? "")}
                      {field("Billing state", "billingState", editingProfile?.billingState ?? "")}
                      {field("Billing ZIP", "billingZip", editingProfile?.billingZip ?? "")}
                    </div>
                  </>
                ) : null}

                {editor.section === "cards" ? (
                  <>
                    {field("Card name", "label", editingCard?.label ?? "", "text", true)}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("Cardholder name", "cardholderName", editingCard?.cardholderName ?? "", "text", true)}
                      <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Card brand</span><select name="cardBrand" required defaultValue={editingCard?.cardBrand ?? ""} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"><option value="">Select card brand</option>{CARD_BRAND_OPTIONS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
                      {field(editingCard ? "New card number (blank keeps current)" : "Card number", "cardNumber", "", "text", !editingCard)}
                      {field("Expiration month", "expMonth", editingCard ? String(editingCard.expMonth) : "", "number", true)}
                      {field("Expiration year", "expYear", editingCard ? String(editingCard.expYear) : "", "number", true)}
                      {field(editingCard ? "New CVV (blank keeps current)" : "CVV", "cvv", "", "password", !editingCard)}
                    </div>
                    {editingCard ? <p className="text-xs text-[#9C9AAE]">Current card: {editingCard.cardBrand} ending in {editingCard.last4}.</p> : null}
                  </>
                ) : null}

                {editor.section === "imap" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("Email", "email", editingImap?.email ?? "", "email", true)}
                    <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Email provider</span><select
                        name="emailProvider"
                        defaultValue={editingImap?.emailProvider ?? ""}
                        onChange={(event) => {
                          const host = imapHostForProvider(event.target.value);
                          const hostInput = event.currentTarget.form?.elements.namedItem("imapHost");
                          if (host && hostInput instanceof HTMLInputElement) hostInput.value = host;
                        }}
                        className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
                      ><option value="">Select provider</option>{providerChoices.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
                    {field("IMAP host", "imapHost", editingImap?.imapHost ?? "", "text", true)}
                    {field("Port", "imapPort", editingImap ? String(editingImap.imapPort) : "993", "number", true)}
                    {field("Security", "imapSecurity", editingImap?.imapSecurity ?? "SSL/TLS", "text", true)}
                    {field(editingImap ? "New password (blank keeps current)" : "Password", "imapPassword", "", "password")}
                  </div>
                ) : null}

                {editorError ? <p role="alert" className="rounded-md border border-[#FF5D5D]/30 bg-[#2A1317] p-3 text-sm text-[#FFC0C0]">{editorError}</p> : null}
                <div className="flex justify-end gap-2 border-t border-[#2C2D3A] pt-4">
                  <button type="button" onClick={() => setEditor(null)} className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE]">Cancel</button>
                  <button type="submit" disabled={savingEditor} className="rounded-md bg-[#2F5BFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingEditor ? "Saving..." : "Save changes"}</button>
                </div>
              </form>
            </section>
          </div>
        ) : null}

        {importState.rows.length ? (
          <div className="space-y-3 rounded-md border border-[#2C2D3A] bg-[#18181F] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-[#F2F1F6]">{importState.fileName}: {importState.rows.length} rows ready</p>
              <button type="button" disabled={importing} onClick={() => void importRows()} className="inline-flex items-center gap-2 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-white disabled:opacity-60">
                <Upload aria-hidden="true" className="h-4 w-4" /> {importing ? "Importing..." : "Import rows"}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[540px] text-left text-xs">
                <thead><tr>{Object.keys(importState.rows[0]).map((key) => <th key={key} className="border-b border-[#2C2D3A] px-2 py-2 text-[#9C9AAE]">{key}</th>)}</tr></thead>
                <tbody>{importState.rows.slice(0, 5).map((row, index) => <tr key={index}>{Object.keys(importState.rows[0]).map((key) => <td key={key} className="max-w-48 truncate border-b border-[#2C2D3A] px-2 py-2">{csvPreviewValue(key, row[key])}</td>)}</tr>)}</tbody>
              </table>
              {importState.rows.length > 5 ? <p className="pt-2 text-xs text-[#9C9AAE]">Showing first 5 rows.</p> : null}
            </div>
          </div>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-[#2C2D3A]">
          <table className="w-full min-w-[760px] text-left text-sm">
            {section === "accounts" ? (
              <>
                <thead><tr>{["Account", "Retailer logins", "Profile", "Card", "IMAP", "Status", ""].map((value) => <th key={value} className={thClass}>{value}</th>)}</tr></thead>
                <tbody>
                  {accounts.map((account) => {
                    const profile = account.profileId ? profileById.get(account.profileId) : undefined;
                    const card = account.cardId ? cardById.get(account.cardId) : undefined;
                    const imap = account.imapConfigId ? imapById.get(account.imapConfigId) : undefined;
                    const unmanagedCard = account.cardId ? null : cardByAccount[account.id];
                    const retailerCards = account.retailerCards ?? [];
                    const logins = account.retailerLogins.length
                      ? account.retailerLogins
                      : [{ id: account.id, retailer: account.retailer, loginEmail: account.loginEmail ?? "", enabled: true }];
                    return (
                      <tr key={account.id} className="border-t border-[#2C2D3A] align-top">
                        <td className="px-3 py-3">
                          <div>#{account.accountNumber} · {account.label}</div>
                          <div className="text-xs text-[#605E72]">{account.botProfileName}</div>
                        </td>
                        <td className="px-3 py-3">
                          <ul className="space-y-1">
                            {logins.map((login) => (
                              <li key={login.id} className={login.enabled ? "" : "text-[#605E72]"}>
                                {login.retailer} · <span className="text-xs text-[#9C9AAE]">{login.loginEmail}</span>{login.enabled ? "" : " (disabled)"}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="px-3 py-3">
                          {profile ? (
                            <>
                              <div>{profile.name}</div>
                              <div className="text-xs text-[#9C9AAE]">{[profile.shippingCity, profile.shippingState].filter(Boolean).join(", ") || "No shipping address"}</div>
                            </>
                          ) : notLinked}
                        </td>
                        <td className="px-3 py-3">
                          <div className="text-xs text-[#605E72]">Default</div>
                          {card ? (
                            <>
                              <div>{card.label}</div>
                              <div className="text-xs text-[#9C9AAE]">{card.cardBrand} ···· {card.last4} · {card.expMonth}/{card.expYear}</div>
                            </>
                          ) : unmanagedCard ? (
                            <>
                              <div className="text-[#9C9AAE]">Not from library</div>
                              <div className="text-xs text-[#9C9AAE]">{unmanagedCard.cardBrand ?? "Card"} ···· {unmanagedCard.last4 ?? "----"}</div>
                            </>
                          ) : notLinked}
                          {retailerCards.length ? (
                            <ul className="mt-2 space-y-1 border-t border-[#2C2D3A] pt-2 text-xs">
                              {retailerCards.map((retailerCard) => {
                                const linkedCard = retailerCard.cardId ? cardById.get(retailerCard.cardId) : undefined;
                                return (
                                  <li key={retailerCard.id}>
                                    <span className="text-[#605E72]">{retailerCard.retailer}:</span>{" "}
                                    {linkedCard
                                      ? <span>{linkedCard.label}</span>
                                      : <span className="text-[#9C9AAE]">{retailerCard.cardBrand ?? "Card"} ···· {retailerCard.last4 ?? "----"} (not from library)</span>}
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          {imap ? (
                            <>
                              <div>{imap.email}</div>
                              <div className={`text-xs ${imap.passwordSet ? "text-[#9C9AAE]" : "text-[#FFDB79]"}`}>{imap.passwordSet ? `${imap.imapHost}:${imap.imapPort}` : "No password saved"}</div>
                            </>
                          ) : notLinked}
                        </td>
                        <td className="px-3 py-3 capitalize">{account.status}</td>
                        <td className="px-3 py-3">
                          <div className="flex gap-2">
                            <button type="button" aria-label={`Edit ${account.label}`} onClick={() => openEditor("accounts", account.id)} className={iconButtonClass}><Pencil className="h-4 w-4" /></button>
                            <button type="button" aria-label={`Delete ${account.label}`} disabled={deletingId === account.id} onClick={() => void deleteAccount(account)} className={iconButtonClass}>
                              {deletingId === account.id ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            ) : null}
            {section === "profiles" ? (
              <>
                <thead><tr>{["Profile", "Shipping", "Billing", "Linked accounts", ""].map((value) => <th key={value} className={thClass}>{value}</th>)}</tr></thead>
                <tbody>
                  {profiles.map((profile) => (
                    <tr key={profile.id} className="border-t border-[#2C2D3A] align-top">
                      <td className="px-3 py-3">{profile.name}</td>
                      <td className="px-3 py-3">{[profile.shippingName, profile.shippingAddr, profile.shippingCity, profile.shippingState, profile.shippingZip].filter(Boolean).join(", ") || "Not set"}</td>
                      <td className="px-3 py-3">{profile.billingSameAsShipping ? "Same as shipping" : [profile.billingName, profile.billingAddr, profile.billingCity, profile.billingState, profile.billingZip].filter(Boolean).join(", ") || "Not set"}</td>
                      <td className="px-3 py-3">{linkedAccountsCell(profile.accounts)}</td>
                      <td className="px-3 py-3">{libraryActions("profiles", profile.id, profile.name, profile.accounts.length)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : null}
            {section === "cards" ? (
              <>
                <thead><tr>{["Card", "Details", "Expires", "Cardholder", "Linked accounts", ""].map((value) => <th key={value} className={thClass}>{value}</th>)}</tr></thead>
                <tbody>
                  {cards.map((card) => (
                    <tr key={card.id} className="border-t border-[#2C2D3A] align-top">
                      <td className="px-3 py-3">{card.label}</td>
                      <td className="px-3 py-3">{card.cardBrand} ···· {card.last4}</td>
                      <td className="px-3 py-3">{card.expMonth}/{card.expYear}</td>
                      <td className="px-3 py-3">{card.cardholderName}</td>
                      <td className="px-3 py-3">{cardLinkLabels(card).join(", ") || <span className="text-[#605E72]">None</span>}</td>
                      <td className="px-3 py-3">{libraryActions("cards", card.id, card.label, card.accounts.length + card.retailerCards.length)}</td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : null}
            {section === "imap" ? (
              <>
                <thead><tr>{["Email", "Provider", "Server", "Linked accounts", "Last sync", "Connection", ""].map((value) => <th key={value} className={thClass}>{value}</th>)}</tr></thead>
                <tbody>
                  {imapConfigs.map((config) => {
                    const result = imapTestResults[config.id];
                    const isTesting = testingImapId === config.id;
                    const lastSync = config.accounts
                      .map((account) => account.lastSyncAt)
                      .filter((value): value is string => Boolean(value))
                      .sort()
                      .at(-1);
                    return (
                      <tr key={config.id} className="border-t border-[#2C2D3A] align-top">
                        <td className="px-3 py-3">{config.email}</td>
                        <td className="px-3 py-3">{config.emailProvider ?? "Not set"}</td>
                        <td className="px-3 py-3">{config.imapHost}:{config.imapPort}</td>
                        <td className="px-3 py-3">{linkedAccountsCell(config.accounts)}</td>
                        <td className="px-3 py-3">{lastSync ? new Date(lastSync).toLocaleString() : "Never"}</td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <button
                              type="button"
                              disabled={isTesting || !config.passwordSet}
                              title={config.passwordSet ? undefined : "Save a password first"}
                              onClick={() => void testImapConnection(config)}
                              className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-1.5 text-xs text-[#F2F1F6] hover:border-[#4C79FF] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {isTesting ? <LoaderCircle aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : null}
                              {isTesting ? "Testing..." : "Test connection"}
                            </button>
                            {result ? (
                              <p role="status" aria-live="polite" className={`flex max-w-56 items-start gap-1 text-xs ${result.success ? "text-[#4ADE80]" : "text-[#FF9A9A]"}`}>
                                {result.success ? <CircleCheck aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <CircleX aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                                <span>{result.message}</span>
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-3 py-3">{libraryActions("imap", config.id, config.email, config.accounts.length)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            ) : null}
          </table>
          {loading || (section !== "accounts" && !librariesLoaded && !libraryError) ? <p className="p-5 text-sm text-[#9C9AAE]">Loading...</p> : null}
          {!loading && !loadError && librariesLoaded && emptyMessage ? <p className="p-5 text-sm text-[#9C9AAE]">{emptyMessage}</p> : null}
        </div>
      </section>
    </div>
  );
}

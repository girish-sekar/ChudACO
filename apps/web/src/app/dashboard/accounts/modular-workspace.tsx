"use client";

import { useRef, useState, type FormEvent } from "react";
import { CircleCheck, CircleX, Download, FileUp, LoaderCircle, Pencil, Plus, Upload, X } from "lucide-react";
import { CARD_BRAND_OPTIONS } from "@/lib/card-brand";
import type { AcoAccount, CardOnFile } from "@/lib/dashboard";

type Section = "accounts" | "profiles" | "cards" | "imap";
type CsvRow = Record<string, string>;
type ImportState = { rows: CsvRow[]; error: string | null; fileName: string };
type Editor = { section: Section; accountId: string | null; retailer?: string };
type LoginDraft = { retailer: string; loginEmail: string; loginPassword: string; enabled: boolean };

const emailProviders = ["Gmail", "Outlook", "Yahoo", "iCloud", "AOL", "Proton", "Other"] as const;

const csvColumns: Record<Section, string[]> = {
  accounts: ["accountNumber", "retailer", "loginEmail", "loginPassword", "enabled"],
  profiles: [
    "accountNumber", "shippingName", "shippingPhone", "shippingAddr", "shippingCity", "shippingState", "shippingZip",
    "billingSameAsShipping", "billingName", "billingPhone", "billingAddr", "billingCity", "billingState", "billingZip",
  ],
  cards: ["accountNumber", "retailer", "cardholderName", "cardBrand", "cardNumber", "expMonth", "expYear", "cvv"],
  imap: ["accountNumber", "email", "emailProvider", "imapHost", "imapPort", "imapSecurity", "password"],
};

const csvExamples: Record<Section, string[]> = {
  accounts: ["REPLACE_ME_ACCOUNT_NUMBER", "Target", "REPLACE_ME_EMAIL@example.com", "REPLACE_ME_PASSWORD", "true"],
  profiles: [
    "REPLACE_ME_ACCOUNT_NUMBER", "REPLACE_ME_NAME", "REPLACE_ME_PHONE", "REPLACE_ME_ADDRESS", "REPLACE_ME_CITY",
    "REPLACE_ME_STATE", "REPLACE_ME_ZIP", "true", "", "", "", "", "", "",
  ],
  cards: [
    "REPLACE_ME_ACCOUNT_NUMBER", "Target", "REPLACE_ME_CARDHOLDER", "Visa", "REPLACE_ME_CARD_NUMBER", "12", "2030", "REPLACE_ME_CVV",
  ],
  imap: [
    "REPLACE_ME_ACCOUNT_NUMBER", "REPLACE_ME_EMAIL@example.com", "Gmail", "imap.gmail.com", "993", "SSL/TLS", "REPLACE_ME_PASSWORD",
  ],
};

const sectionLabels: Record<Section, string> = {
  accounts: "Account info",
  profiles: "Profiles",
  cards: "Cards",
  imap: "IMAP",
};

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
  const [section, setSection] = useState<Section>("accounts");
  const [importState, setImportState] = useState<ImportState>({ rows: [], error: null, fileName: "" });
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [savingEditor, setSavingEditor] = useState(false);
  const [loginDrafts, setLoginDrafts] = useState<LoginDraft[]>([]);
  const [testingImapId, setTestingImapId] = useState<string | null>(null);
  const [imapTestResults, setImapTestResults] = useState<Record<string, { success: boolean; message: string }>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const editingAccount = editor?.accountId ? accounts.find((account) => account.id === editor.accountId) ?? null : null;
  const retailerChoices = Array.from(new Set([
    ...retailers,
    ...accounts.flatMap((account) => [account.retailer, ...account.retailerLogins.map((login) => login.retailer), ...(account.retailerCards ?? []).map((card) => card.retailer)]),
  ]));
  const providerChoices = Array.from(new Set([
    ...emailProviders,
    ...accounts.map((account) => account.emailProvider).filter((provider): provider is string => Boolean(provider)),
  ]));

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

  function selectSection(next: Section) {
    setSection(next);
    setImportState({ rows: [], error: null, fileName: "" });
    setStatus(null);
    setEditor(null);
  }

  function openEditor(nextSection: Section, account?: AcoAccount, retailer?: string) {
    setEditor({ section: nextSection, accountId: account?.id ?? null, retailer });
    setEditorError(null);
    setStatus(null);
    if (nextSection === "accounts") {
      setLoginDrafts(account
        ? (account.retailerLogins.length ? account.retailerLogins : [{ id: account.id, retailer: account.retailer, loginEmail: account.loginEmail ?? "", enabled: true }])
            .map(({ retailer: loginRetailer, loginEmail, enabled }) => ({ retailer: loginRetailer, loginEmail, loginPassword: "", enabled }))
        : [{ retailer: "", loginEmail: "", loginPassword: "", enabled: true }]);
    }
  }

  function updateLoginDraft(index: number, field: keyof LoginDraft, value: string | boolean) {
    setLoginDrafts((current) => current.map((login, entryIndex) => entryIndex === index ? { ...login, [field]: value } : login));
  }

  async function testImapConnection(account: AcoAccount) {
    setTestingImapId(account.id);
    setImapTestResults((current) => {
      const next = { ...current };
      delete next[account.id];
      return next;
    });

    try {
      const response = await fetch(`/api/aco-accounts/${account.id}/test`, { method: "POST" });
      const payload = (await response.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      const success = response.ok && payload?.success === true;
      const message = success
        ? "IMAP connection succeeded."
        : payload?.error ?? `IMAP test failed (HTTP ${response.status}).`;
      setImapTestResults((current) => ({ ...current, [account.id]: { success, message } }));
    } catch (error) {
      setImapTestResults((current) => ({
        ...current,
        [account.id]: {
          success: false,
          message: error instanceof Error ? error.message : "Could not reach the IMAP test service.",
        },
      }));
    } finally {
      setTestingImapId(null);
    }
  }

  async function submitEditor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor) return;
    const formData = new FormData(event.currentTarget);
    const value = (name: string) => String(formData.get(name) ?? "").trim();
    const nullable = (name: string) => value(name) || null;
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
        const response = await fetch(editingAccount ? `/api/aco-accounts/${editingAccount.id}` : "/api/aco-accounts", {
          method: editingAccount ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...(editingAccount ? accountBasePayload(editingAccount) : {}),
            ...accountFields,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.detail ?? body?.error ?? "Could not save account.");
        }
      } else if (editor.section === "profiles") {
        if (!editingAccount) throw new Error("Select an account for this profile.");
        const sameBilling = formData.get("billingSameAsShipping") === "on";
        await patchAccount(editingAccount, {
          shippingName: nullable("shippingName"),
          shippingPhone: nullable("shippingPhone"),
          shippingAddr: nullable("shippingAddr"),
          shippingCity: nullable("shippingCity"),
          shippingState: nullable("shippingState"),
          shippingZip: nullable("shippingZip"),
          billingSameAsShipping: sameBilling,
          billingName: sameBilling ? null : nullable("billingName"),
          billingPhone: sameBilling ? null : nullable("billingPhone"),
          billingAddr: sameBilling ? null : nullable("billingAddr"),
          billingCity: sameBilling ? null : nullable("billingCity"),
          billingState: sameBilling ? null : nullable("billingState"),
          billingZip: sameBilling ? null : nullable("billingZip"),
        });
      } else if (editor.section === "imap") {
        if (!editingAccount) throw new Error("Select an account to configure IMAP.");
        const email = value("email");
        const port = Number(value("imapPort"));
        if (!/^\S+@\S+\.\S+$/.test(email) || !value("imapHost") || !value("imapSecurity") || !Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error("Enter a valid email, IMAP host, port, and security setting.");
        }
        await patchAccount(editingAccount, {
          email,
          emailProvider: nullable("emailProvider"),
          imapHost: value("imapHost"),
          imapPort: port,
          imapSecurity: value("imapSecurity"),
          password: value("imapPassword") || undefined,
        });
      } else {
        if (!editingAccount) throw new Error("Select an account for this card.");
        const cardNumber = value("cardNumber").replace(/\D/g, "");
        const expMonth = Number(value("expMonth"));
        const expYear = Number(value("expYear"));
        if (!value("cardholderName") || !value("cardBrand") || !/^\d{12,19}$/.test(cardNumber) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || !value("cvv")) {
          throw new Error("Enter cardholder, brand, valid card number, expiration, and CVV to add or replace a card.");
        }
        const response = await fetch(`/api/aco-accounts/${editingAccount.id}/payment-info`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cardholderName: value("cardholderName"),
            cardBrand: value("cardBrand"),
            cardNumber,
            expMonth,
            expYear,
            cvv: value("cvv"),
            retailer: value("retailer") || undefined,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => null);
          throw new Error(body?.error ?? "Could not save card.");
        }
      }

      setEditor(null);
      await onRefresh();
      setStatus(`${sectionLabels[editor.section]} ${editingAccount ? "updated" : "added"}.`);
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
      const required = section === "accounts"
        ? ["accountNumber", "retailer", "loginEmail"]
        : section === "profiles"
          ? ["accountNumber"]
          : section === "cards"
            ? ["accountNumber", "cardholderName", "cardBrand", "cardNumber", "expMonth", "expYear", "cvv"]
            : ["accountNumber", "email", "imapHost", "imapPort", "imapSecurity"];
      const missing = required.filter((column) => !headers.includes(column));
      const unknown = headers.filter((column) => !csvColumns[section].includes(column));
      if (missing.length || unknown.length) {
        throw new Error([
          missing.length ? `Missing columns: ${missing.join(", ")}.` : "",
          unknown.length ? `Unknown columns: ${unknown.join(", ")}.` : "",
        ].filter(Boolean).join(" "));
      }
      if (section === "profiles" && !headers.some((header) => header !== "accountNumber")) {
        throw new Error("Add at least one profile field to the CSV.");
      }
      setImportState({ rows, error: null, fileName: file.name });
    } catch (error) {
      setImportState({ rows: [], error: error instanceof Error ? error.message : "Could not read this CSV.", fileName: file.name });
    }
  }

  async function patchAccount(account: AcoAccount, fields: Record<string, unknown>) {
    const response = await fetch(`/api/aco-accounts/${account.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...accountBasePayload(account), ...fields }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new Error(body?.error ?? `Could not update account #${account.accountNumber}.`);
    }
  }

  async function importRows() {
    setImporting(true);
    setStatus(null);
    const errors: string[] = [];
    let imported = 0;
    const accountFor = (row: CsvRow) => {
      if (Object.values(row).some((value) => value.toUpperCase().includes("REPLACE_ME"))) {
        throw new Error("Replace all REPLACE_ME example values before importing this row.");
      }
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
        for (const { account, rows } of grouped.values()) {
          const logins: Array<{ retailer: string; loginEmail: string; loginPassword?: string; enabled: boolean }> =
            account.retailerLogins.map(({ retailer, loginEmail, enabled }) => ({ retailer, loginEmail, enabled }));
          for (const row of rows) {
            const retailer = clean(row.retailer);
            const email = clean(row.loginEmail);
            const current = logins.find((entry) => entry.retailer.toLowerCase() === retailer.toLowerCase());
            const next = {
              retailer,
              loginEmail: email,
              loginPassword: clean(row.loginPassword) || undefined,
              enabled: row.enabled ? row.enabled.toLowerCase() === "true" : current?.enabled ?? true,
            };
            if (current) Object.assign(current, next);
            else logins.push(next);
          }
          try {
            await patchAccount(account, { retailerLogins: logins });
            imported += rows.length;
          } catch (error) {
            errors.push(error instanceof Error ? error.message : `Could not update account #${account.accountNumber}.`);
          }
        }
      } else {
        for (const [index, row] of importState.rows.entries()) {
          try {
            const account = accountFor(row);
            if (section === "profiles") {
              const billingSameValue = clean(row.billingSameAsShipping).toLowerCase();
              const billingSame = !billingSameValue
                ? account.billingSameAsShipping
                : billingSameValue === "true";
              await patchAccount(account, {
                shippingName: row.shippingName === undefined ? account.shippingName : toNullable(row.shippingName),
                shippingPhone: row.shippingPhone === undefined ? account.shippingPhone : toNullable(row.shippingPhone),
                shippingAddr: row.shippingAddr === undefined ? account.shippingAddr : toNullable(row.shippingAddr),
                shippingCity: row.shippingCity === undefined ? account.shippingCity : toNullable(row.shippingCity),
                shippingState: row.shippingState === undefined ? account.shippingState : toNullable(row.shippingState),
                shippingZip: row.shippingZip === undefined ? account.shippingZip : toNullable(row.shippingZip),
                billingSameAsShipping: billingSame,
                billingName: billingSame ? null : row.billingName === undefined ? account.billingName : toNullable(row.billingName),
                billingPhone: billingSame ? null : row.billingPhone === undefined ? account.billingPhone : toNullable(row.billingPhone),
                billingAddr: billingSame ? null : row.billingAddr === undefined ? account.billingAddr : toNullable(row.billingAddr),
                billingCity: billingSame ? null : row.billingCity === undefined ? account.billingCity : toNullable(row.billingCity),
                billingState: billingSame ? null : row.billingState === undefined ? account.billingState : toNullable(row.billingState),
                billingZip: billingSame ? null : row.billingZip === undefined ? account.billingZip : toNullable(row.billingZip),
              });
            } else if (section === "imap") {
              const port = Number(row.imapPort);
              if (!/^\S+@\S+\.\S+$/.test(clean(row.email)) || !Number.isInteger(port) || port < 1 || port > 65535) {
                throw new Error("Enter a valid email and IMAP port (1-65535).");
              }
              await patchAccount(account, {
                email: clean(row.email),
                emailProvider: toNullable(row.emailProvider),
                imapHost: clean(row.imapHost),
                imapPort: port,
                imapSecurity: clean(row.imapSecurity),
                password: clean(row.password) || undefined,
              });
            } else {
              const expMonth = Number(row.expMonth);
              const expYear = Number(row.expYear);
              if (!/^\d{12,19}$/.test(row.cardNumber.replace(/\D/g, "")) || expMonth < 1 || expMonth > 12 || !Number.isInteger(expYear) || !row.cvv.trim()) {
                throw new Error("Enter a valid card number, expiration, and CVV.");
              }
              const response = await fetch(`/api/aco-accounts/${account.id}/payment-info`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  cardholderName: row.cardholderName,
                  cardBrand: row.cardBrand,
                  cardNumber: row.cardNumber,
                  expMonth,
                  expYear,
                  cvv: row.cvv,
                  retailer: toNullable(row.retailer) ?? undefined,
                }),
              });
              if (!response.ok) {
                const body = await response.json().catch(() => null);
                throw new Error(body?.error ?? "Card relay failed.");
              }
            }
            imported += 1;
          } catch (error) {
            errors.push(`CSV row ${index + 2}: ${error instanceof Error ? error.message : "Import failed."}`);
          }
        }
      }

      await onRefresh();
      setStatus(`${imported} row${imported === 1 ? "" : "s"} imported${errors.length ? `; ${errors.length} row${errors.length === 1 ? "" : "s"} need attention` : " successfully"}.`);
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
    const issues: Array<{ section: Section; message: string }> = [];
    const validLogins = account.retailerLogins.filter((login) => login.enabled && /^\S+@\S+\.\S+$/.test(login.loginEmail));
    if (validLogins.length === 0) issues.push({ section: "accounts", message: "Add an enabled retailer login with a valid email." });

    const missingProfileFields = [
      [account.shippingName, "shipping name"],
      [account.shippingAddr, "shipping address"],
      [account.shippingCity, "shipping city"],
      [account.shippingState, "shipping state"],
      [account.shippingZip, "shipping ZIP"],
    ].filter(([value]) => !value).map(([, label]) => label);
    if (missingProfileFields.length) issues.push({ section: "profiles", message: `Complete profile: ${missingProfileFields.join(", ")}.` });

    const hasDefaultCard = Boolean(cardByAccount[account.id]);
    const linkedRetailers = new Set((account.retailerCards ?? []).map((card) => card.retailer.toLowerCase()));
    const missingCardRetailers = (account.retailerLogins.length ? account.retailerLogins : [{ retailer: account.retailer, enabled: true }])
      .filter((login) => login.enabled && !linkedRetailers.has(login.retailer.toLowerCase()))
      .map((login) => login.retailer);
    if (account.id in cardByAccount && !hasDefaultCard && missingCardRetailers.length) {
      issues.push({ section: "cards", message: `Add a default card or link retailer cards for: ${missingCardRetailers.join(", ")}.` });
    }
    if (!account.imapConfigured) issues.push({ section: "imap", message: "Inbox is not configured; IMAP sync and verification emails are unavailable." });

    return issues.map((issue) => ({ ...issue, account }));
  });

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Account management</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">Manage account-owned credentials and settings by section.</p>
        </div>
        {modeToggle}
      </header>

      {!loading && !loadError ? (
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
                  <button type="button" onClick={() => { setSection(issue.section); openEditor(issue.section, issue.account); }} className="shrink-0 rounded-md border border-[#6B5928] px-3 py-1.5 text-xs font-medium text-[#FFDB79] hover:bg-[#332A14]">
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
            <p className="mt-1 text-xs text-[#9C9AAE]">
              {section === "profiles"
                ? "Profiles are currently the shipping and billing details attached to each account."
                : "CSV rows reference an existing account by accountNumber."}
            </p>
            <p className="mt-1 text-xs text-[#605E72]">The template includes an example row. Replace every REPLACE_ME value before importing.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => openEditor(section)} className="inline-flex items-center gap-2 rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-white hover:bg-[#2448D8]">
              <Plus aria-hidden="true" className="h-4 w-4" />
              {section === "accounts" ? "Add account" : section === "profiles" ? "Add profile" : section === "cards" ? "Add card" : "Configure IMAP"}
            </button>
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
              ? "Card CSV values are sent to the configured secure relay. Full card numbers and CVVs are not stored in the database."
              : "Password values are encrypted by the existing account API. Leave password blank to keep the current password."}
          </p>
        ) : null}

        {status ? <p role="status" className="text-sm text-[#4ADE80]">{status}</p> : null}
        {loadError ? <p role="alert" className="text-sm text-[#FF5D5D]">Failed to load account data.</p> : null}
        {importState.error ? <pre role="alert" className="whitespace-pre-wrap rounded-md border border-[#FF5D5D]/30 bg-[#2A1317] p-3 text-xs text-[#FFC0C0]">{importState.error}</pre> : null}

        {editor ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}>
            <section role="dialog" aria-modal="true" aria-labelledby="modular-editor-title" className="my-auto max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[#2C2D3A] bg-[#18181F] p-5 shadow-2xl">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 id="modular-editor-title" className="font-heading text-xl font-semibold">{editor.accountId ? "Edit" : "Add"} {sectionLabels[editor.section]}</h3>
                  <p className="mt-1 text-xs text-[#9C9AAE]">
                    {editor.section === "profiles" ? "Shipping and billing details are attached to this account." : editor.section === "cards" ? "Full card details are sent to the configured secure relay; only masked details are stored." : editor.section === "imap" ? "Leave the password blank to keep the saved password." : "Retailer credentials are saved through the existing encrypted account API."}
                  </p>
                </div>
                <button type="button" aria-label="Close editor" onClick={() => setEditor(null)} className="rounded-md p-2 text-[#9C9AAE] hover:bg-[#101014] hover:text-white"><X className="h-4 w-4" /></button>
              </div>

              <form onSubmit={(event) => void submitEditor(event)} className="space-y-4">
                {editor.section !== "accounts" ? (
                  <label className="grid gap-1 text-xs text-[#9C9AAE]">
                    <span>Account</span>
                    <select
                      required
                      value={editor.accountId ?? ""}
                      disabled={Boolean(editor.accountId)}
                      onChange={(event) => setEditor((current) => current ? { ...current, accountId: event.target.value || null } : current)}
                      className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
                    >
                      <option value="">Choose an account</option>
                      {accounts.map((account) => <option key={account.id} value={account.id}>#{account.accountNumber} · {account.label}</option>)}
                    </select>
                  </label>
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
                    <p className="text-xs text-[#9C9AAE]">Inbox, shipping profile, and card setup are separate sections. Save this account first, then link those details from their sections.</p>
                  </>
                ) : null}

                {editor.section === "profiles" ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("Shipping name", "shippingName", editingAccount?.shippingName ?? "")}
                      {field("Shipping phone", "shippingPhone", editingAccount?.shippingPhone ?? "", "tel")}
                      {field("Shipping address", "shippingAddr", editingAccount?.shippingAddr ?? "")}
                      {field("Shipping city", "shippingCity", editingAccount?.shippingCity ?? "")}
                      {field("Shipping state", "shippingState", editingAccount?.shippingState ?? "")}
                      {field("Shipping ZIP", "shippingZip", editingAccount?.shippingZip ?? "")}
                    </div>
                    <label className="flex items-center gap-2 text-sm text-[#9C9AAE]"><input type="checkbox" name="billingSameAsShipping" defaultChecked={editingAccount?.billingSameAsShipping ?? true} />Billing same as shipping</label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {field("Billing name", "billingName", editingAccount?.billingName ?? "")}
                      {field("Billing phone", "billingPhone", editingAccount?.billingPhone ?? "", "tel")}
                      {field("Billing address", "billingAddr", editingAccount?.billingAddr ?? "")}
                      {field("Billing city", "billingCity", editingAccount?.billingCity ?? "")}
                      {field("Billing state", "billingState", editingAccount?.billingState ?? "")}
                      {field("Billing ZIP", "billingZip", editingAccount?.billingZip ?? "")}
                    </div>
                  </>
                ) : null}

                {editor.section === "cards" ? (() => {
                  const existingCard = editingAccount
                    ? editor.retailer === "Default"
                      ? cardByAccount[editingAccount.id]
                      : editingAccount.retailerCards?.find((card) => card.retailer === editor.retailer)
                    : null;
                  return (
                    <>
                      <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Use for retailer</span><select name="retailer" defaultValue={editor.retailer === "Default" ? "" : editor.retailer ?? ""} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"><option value="">Default account card</option>{retailerChoices.map((retailer) => <option key={retailer} value={retailer}>{retailer}</option>)}</select></label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        {field("Cardholder name", "cardholderName", existingCard?.cardholderName ?? "", "text", true)}
                        <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Card brand</span><select name="cardBrand" required defaultValue={existingCard?.cardBrand ?? ""} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"><option value="">Select card brand</option>{CARD_BRAND_OPTIONS.map((brand) => <option key={brand} value={brand}>{brand}</option>)}</select></label>
                        {field("Card number", "cardNumber", "", "text", true)}
                        {field("Expiration month", "expMonth", existingCard?.expMonth ? String(existingCard.expMonth) : "", "number", true)}
                        {field("Expiration year", "expYear", existingCard?.expYear ? String(existingCard.expYear) : "", "number", true)}
                        {field("CVV", "cvv", "", "password", true)}
                      </div>
                      {existingCard ? <p className="text-xs text-[#9C9AAE]">Current card: {existingCard.cardBrand ?? "Card"} ending in {existingCard.last4 ?? "----"}. Enter full details to replace it.</p> : null}
                    </>
                  );
                })() : null}

                {editor.section === "imap" ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {field("Email", "email", editingAccount?.email ?? "", "email", true)}
                    <label className="grid gap-1 text-xs text-[#9C9AAE]"><span>Email provider</span><select name="emailProvider" defaultValue={editingAccount?.emailProvider ?? ""} className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"><option value="">Select provider</option>{providerChoices.map((provider) => <option key={provider} value={provider}>{provider}</option>)}</select></label>
                    {field("IMAP host", "imapHost", editingAccount?.imapHost ?? "", "text", true)}
                    {field("Port", "imapPort", editingAccount ? String(editingAccount.imapPort) : "993", "number", true)}
                    {field("Security", "imapSecurity", editingAccount?.imapSecurity ?? "SSL/TLS", "text", true)}
                    {field("New password (blank keeps current)", "imapPassword", "", "password")}
                  </div>
                ) : null}

                {editorError ? <p role="alert" className="rounded-md border border-[#FF5D5D]/30 bg-[#2A1317] p-3 text-sm text-[#FFC0C0]">{editorError}</p> : null}
                <div className="flex justify-end gap-2 border-t border-[#2C2D3A] pt-4">
                  <button type="button" onClick={() => setEditor(null)} className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE]">Cancel</button>
                  <button type="submit" disabled={savingEditor || (editor.section !== "accounts" && !editingAccount)} className="rounded-md bg-[#2F5BFF] px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{savingEditor ? "Saving..." : "Save changes"}</button>
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
          <table className="w-full min-w-[680px] text-left text-sm">
            {section === "accounts" ? (
              <><thead><tr>{["Account", "Retailer login", "Email", "Status", ""].map((value) => <th key={value} className="bg-[#18181F] px-3 py-3 text-xs font-medium text-[#9C9AAE]">{value}</th>)}</tr></thead><tbody>{accounts.flatMap((account) => (account.retailerLogins.length ? account.retailerLogins : [{ id: account.id, retailer: account.retailer, loginEmail: account.loginEmail ?? "", enabled: true }]).map((login) => <tr key={`${account.id}-${login.id}`} className="border-t border-[#2C2D3A]"><td className="px-3 py-3">#{account.accountNumber} · {account.label}</td><td className="px-3 py-3">{login.retailer}</td><td className="px-3 py-3">{login.loginEmail}</td><td className="px-3 py-3">{login.enabled ? "Enabled" : "Disabled"}</td><td className="px-3 py-3"><button type="button" aria-label={`Edit ${account.label}`} onClick={() => openEditor("accounts", account)} className="rounded border border-[#2C2D3A] p-2 text-[#9C9AAE] hover:text-white"><Pencil className="h-4 w-4" /></button></td></tr>))}</tbody></>
            ) : null}
            {section === "profiles" ? (
              <><thead><tr>{["Account", "Shipping", "Billing", ""].map((value) => <th key={value} className="bg-[#18181F] px-3 py-3 text-xs font-medium text-[#9C9AAE]">{value}</th>)}</tr></thead><tbody>{accounts.map((account) => <tr key={account.id} className="border-t border-[#2C2D3A]"><td className="px-3 py-3">#{account.accountNumber} · {account.label}</td><td className="px-3 py-3">{[account.shippingName, account.shippingAddr, account.shippingCity, account.shippingState, account.shippingZip].filter(Boolean).join(", ") || "Not set"}</td><td className="px-3 py-3">{account.billingSameAsShipping ? "Same as shipping" : [account.billingName, account.billingAddr, account.billingCity, account.billingState, account.billingZip].filter(Boolean).join(", ") || "Not set"}</td><td className="px-3 py-3"><button type="button" aria-label={`Edit ${account.label}`} onClick={() => openEditor("profiles", account)} className="rounded border border-[#2C2D3A] p-2 text-[#9C9AAE] hover:text-white"><Pencil className="h-4 w-4" /></button></td></tr>)}</tbody></>
            ) : null}
            {section === "cards" ? (
              <><thead><tr>{["Account", "Card", "Expires", "Used for", ""].map((value) => <th key={value} className="bg-[#18181F] px-3 py-3 text-xs font-medium text-[#9C9AAE]">{value}</th>)}</tr></thead><tbody>{accounts.flatMap((account) => { const cards = [...(cardByAccount[account.id] ? [{ ...cardByAccount[account.id]!, retailer: "Default" }] : []), ...(account.retailerCards ?? [])]; return cards.map((card) => <tr key={`${account.id}-${card.retailer}`} className="border-t border-[#2C2D3A]"><td className="px-3 py-3">#{account.accountNumber} · {account.label}</td><td className="px-3 py-3">{card.cardBrand ?? "Card"} ···· {card.last4 ?? "----"}</td><td className="px-3 py-3">{card.expMonth ?? "--"}/{card.expYear ?? "----"}</td><td className="px-3 py-3">{card.retailer || "Default"}</td><td className="px-3 py-3"><button type="button" aria-label={`Edit card for ${account.label}`} onClick={() => openEditor("cards", account, card.retailer || "Default")} className="rounded border border-[#2C2D3A] p-2 text-[#9C9AAE] hover:text-white"><Pencil className="h-4 w-4" /></button></td></tr>); })}</tbody></>
            ) : null}
            {section === "imap" ? (
              <>
                <thead>
                  <tr>{["Account", "Email", "Provider", "Server", "Last sync", "Connection", ""].map((value) => <th key={value} className="bg-[#18181F] px-3 py-3 text-xs font-medium text-[#9C9AAE]">{value}</th>)}</tr>
                </thead>
                <tbody>
                  {accounts.map((account) => {
                    const result = imapTestResults[account.id];
                    const isTesting = testingImapId === account.id;
                    return (
                      <tr key={account.id} className="border-t border-[#2C2D3A]">
                        <td className="px-3 py-3">#{account.accountNumber} · {account.label}</td>
                        <td className="px-3 py-3">{account.email || "Not configured"}</td>
                        <td className="px-3 py-3">{account.emailProvider ?? "Not set"}</td>
                        <td className="px-3 py-3">{account.imapHost ? `${account.imapHost}:${account.imapPort}` : "Not configured"}</td>
                        <td className="px-3 py-3">{account.lastSyncAt ? new Date(account.lastSyncAt).toLocaleString() : "Never"}</td>
                        <td className="px-3 py-3">
                          <div className="space-y-1">
                            <button
                              type="button"
                              disabled={isTesting}
                              onClick={() => void testImapConnection(account)}
                              className="inline-flex items-center gap-2 rounded-md border border-[#2C2D3A] px-3 py-1.5 text-xs text-[#F2F1F6] hover:border-[#4C79FF] disabled:cursor-wait disabled:opacity-60"
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
                        <td className="px-3 py-3"><button type="button" aria-label={`Edit IMAP for ${account.label}`} onClick={() => openEditor("imap", account)} className="rounded border border-[#2C2D3A] p-2 text-[#9C9AAE] hover:text-white"><Pencil className="h-4 w-4" /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </>
            ) : null}
          </table>
          {loading ? <p className="p-5 text-sm text-[#9C9AAE]">Loading accounts...</p> : null}
          {!loading && !loadError && accounts.length === 0 ? <p className="p-5 text-sm text-[#9C9AAE]">No accounts to display.</p> : null}
        </div>
      </section>
    </div>
  );
}
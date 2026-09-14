"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  DEFAULT_RETAILERS,
  fetchJson,
  formatDate,
  type AcoAccount,
  type CardOnFile,
  type Retailer,
} from "@/lib/dashboard";

type AccountsResponse = {
  data: AcoAccount[];
  meta?: {
    maxAccountsPerUser: number;
    currentAccounts: number;
    remainingAccounts: number;
  };
};

type CardOnFileResponse = {
  data: CardOnFile | null;
};

type StatusBanner = {
  message: string;
  tone: "success" | "error" | "info";
  prefix?: string;
  pulse?: boolean;
};

type PaymentCardRow = {
  retailer: string;
  cardholderName: string;
  cardBrand: string;
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
};

type FormState = {
  label: string;
  email: string;
  emailProvider: string;
  onlyOneCheckout: boolean;
  retailerLogins: Array<{
    retailer: string;
    loginEmail: string;
    loginPassword: string;
  }>;
  shippingName: string;
  shippingPhone: string;
  shippingAddr: string;
  shippingAddr2: string;
  shippingAddr3: string;
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  billingSameAsShipping: boolean;
  billingName: string;
  billingPhone: string;
  billingAddr: string;
  billingAddr2: string;
  billingAddr3: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: string;
  password: string;
  status: "active" | "locked" | "banned";
  paymentCards: PaymentCardRow[];
  paymentRetailer: string;
};

function toSafeNumber(value: string): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

const EMAIL_PROVIDER_HOSTS = {
  Gmail: "imap.gmail.com",
  Outlook: "outlook.office365.com",
  Yahoo: "imap.mail.yahoo.com",
  iCloud: "imap.mail.me.com",
  AOL: "imap.aol.com",
  Proton: "imap.protonmail.ch",
  Other: "",
} as const;

const EMAIL_PROVIDER_OPTIONS = Object.keys(EMAIL_PROVIDER_HOSTS) as Array<
  keyof typeof EMAIL_PROVIDER_HOSTS
>;

const defaultFormState: FormState = {
  label: "",
  email: "",
  emailProvider: "",
  onlyOneCheckout: true,
  retailerLogins: [{ retailer: "", loginEmail: "", loginPassword: "" }],
  shippingName: "",
  shippingPhone: "",
  shippingAddr: "",
  shippingAddr2: "",
  shippingAddr3: "",
  shippingCity: "",
  shippingState: "",
  shippingZip: "",
  billingSameAsShipping: true,
  billingName: "",
  billingPhone: "",
  billingAddr: "",
  billingAddr2: "",
  billingAddr3: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  imapHost: "",
  imapPort: "993",
  imapSecurity: "SSL/TLS",
  password: "",
  status: "active",
  paymentCards: [
    {
      retailer: "",
      cardholderName: "",
      cardBrand: "",
      cardNumber: "",
      expMonth: "",
      expYear: "",
      cvv: "",
    },
  ],
  paymentRetailer: "",
};

function normalizeEmailProvider(value: string | null | undefined): keyof typeof EMAIL_PROVIDER_HOSTS | "" {
  if (!value) {
    return "";
  }

  return EMAIL_PROVIDER_OPTIONS.includes(value as keyof typeof EMAIL_PROVIDER_HOSTS)
    ? (value as keyof typeof EMAIL_PROVIDER_HOSTS)
    : "Other";
}

function isManualImapHostProvider(value: string): boolean {
  return value === "Other" || value === "";
}

function splitAddressLines(value: string | null | undefined) {
  const normalized = (value ?? "").replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return { line1: "", line2: "", line3: "" };
  }

  const lines = normalized.split("\n").map((line) => line.trim());
  return {
    line1: lines[0] ?? "",
    line2: lines[1] ?? "",
    line3: lines.slice(2).join("\n"),
  };
}

export default function AccountsPage() {
  const { data, error, mutate } = useSWR<AccountsResponse>("/api/aco-accounts", fetchJson);
  const { data: retailersData } = useSWR<{ data: Retailer[] }>("/api/retailers", fetchJson);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);

  const retailerOptions = useMemo(() => {
    if (retailersData?.data && retailersData.data.length > 0) {
      return retailersData.data.map((item) => item.name);
    }
    return Array.from(DEFAULT_RETAILERS);
  }, [retailersData]);

  const [cardByAccount, setCardByAccount] = useState<Record<string, CardOnFile | null>>({});

  const maxAccountsPerUser = data?.meta?.maxAccountsPerUser ?? 5;
  const currentAccounts = data?.meta?.currentAccounts ?? data?.data?.length ?? 0;
  const isCreateLimitReached = editingId === null && currentAccounts >= maxAccountsPerUser;

  useEffect(() => {
    if (!statusBanner?.pulse) {
      setShowSuccessPulse(false);
      return;
    }

    setShowSuccessPulse(true);
    const timeoutId = setTimeout(() => {
      setShowSuccessPulse(false);
    }, 2000);

    return () => clearTimeout(timeoutId);
  }, [statusBanner]);

  useEffect(() => {
    if (!data?.data) {
      return;
    }

    for (const account of data.data) {
      if (account.id in cardByAccount) {
        continue;
      }

      void fetchJson<CardOnFileResponse>(`/api/aco-accounts/${account.id}/payment-info`)
        .then((response) => {
          setCardByAccount((current) => ({ ...current, [account.id]: response.data }));
        })
        .catch(() => {
          setCardByAccount((current) => ({ ...current, [account.id]: null }));
        });
    }
  }, [cardByAccount, data]);

  function resetForm() {
    setFormState(defaultFormState);
    setEditingId(null);
    setShowForm(false);
  }

  function startCreate() {
    if (currentAccounts >= maxAccountsPerUser) {
      setStatusBanner({
        message: `Account limit reached. You can create up to ${maxAccountsPerUser} accounts.`,
        tone: "error",
      });
      return;
    }

    setStatusBanner(null);
    setEditingId(null);
    setFormState(defaultFormState);
    setShowForm((value) => !value || editingId !== null);
  }

  function startEdit(account: AcoAccount) {
    setStatusBanner(null);
    setEditingId(account.id);
    const normalizedProvider = normalizeEmailProvider(account.emailProvider);
    const card = cardByAccount[account.id];
    const retailerCards = (account.retailerCards ?? []).map((entry) => ({
      retailer: entry.retailer,
      cardholderName: entry.cardholderName ?? "",
      cardBrand: entry.cardBrand ?? "",
      cardNumber: "",
      expMonth: entry.expMonth ? String(entry.expMonth).padStart(2, "0") : "",
      expYear: entry.expYear ? String(entry.expYear) : "",
      cvv: "",
    }));

    const paymentCardRows = [
      ...(card
        ? [{
            retailer: "",
            cardholderName: card.cardholderName ?? "",
            cardBrand: card.cardBrand ?? "",
            cardNumber: "",
            expMonth: card.expMonth ? String(card.expMonth).padStart(2, "0") : "",
            expYear: card.expYear ? String(card.expYear) : "",
            cvv: "",
          }]
        : []),
      ...retailerCards,
    ];

    setFormState({
      label: account.label,
      email: account.email,
      emailProvider: normalizedProvider,
      onlyOneCheckout: account.onlyOneCheckout,
      retailerLogins:
        account.retailerLogins.length > 0
          ? account.retailerLogins.map((entry) => ({
              retailer: entry.retailer,
              loginEmail: entry.loginEmail,
              loginPassword: "",
            }))
          : [
              {
                retailer: account.retailer,
                loginEmail: account.loginEmail ?? "",
                loginPassword: "",
              },
            ],
      shippingName: account.shippingName ?? "",
      shippingPhone: account.shippingPhone ?? "",
      shippingAddr: splitAddressLines(account.shippingAddr).line1,
      shippingAddr2: splitAddressLines(account.shippingAddr).line2,
      shippingAddr3: splitAddressLines(account.shippingAddr).line3,
      shippingCity: account.shippingCity ?? "",
      shippingState: account.shippingState ?? "",
      shippingZip: account.shippingZip ?? "",
      billingSameAsShipping: account.billingSameAsShipping,
      billingName: account.billingName ?? "",
      billingPhone: account.billingPhone ?? "",
      billingAddr: splitAddressLines(account.billingAddr).line1,
      billingAddr2: splitAddressLines(account.billingAddr).line2,
      billingAddr3: splitAddressLines(account.billingAddr).line3,
      billingCity: account.billingCity ?? "",
      billingState: account.billingState ?? "",
      billingZip: account.billingZip ?? "",
      imapHost:
        normalizedProvider && normalizedProvider !== "Other"
          ? EMAIL_PROVIDER_HOSTS[normalizedProvider]
          : account.imapHost,
      imapPort: String(account.imapPort),
      imapSecurity: account.imapSecurity,
      password: "",
      status: account.status,
      paymentCards: paymentCardRows.length > 0 ? paymentCardRows : [
        {
          retailer: "",
          cardholderName: card?.cardholderName ?? "",
          cardBrand: card?.cardBrand ?? "",
          cardNumber: "",
          expMonth: card?.expMonth ? String(card.expMonth).padStart(2, "0") : "",
          expYear: card?.expYear ? String(card.expYear) : "",
          cvv: "",
        },
      ],
      paymentRetailer: "",
    });
    setShowForm(true);
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  function setRetailerLoginField(
    index: number,
    field: "retailer" | "loginEmail" | "loginPassword",
    value: string,
  ) {
    setFormState((current) => ({
      ...current,
      retailerLogins: current.retailerLogins.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function addRetailerLoginRow() {
    setFormState((current) => ({
      ...current,
      retailerLogins: [...current.retailerLogins, { retailer: "", loginEmail: "", loginPassword: "" }],
    }));
  }

  function addPaymentCardRow() {
    setFormState((current) => ({
      ...current,
      paymentCards: [
        ...current.paymentCards,
        {
          retailer: "",
          cardholderName: "",
          cardBrand: "",
          cardNumber: "",
          expMonth: "",
          expYear: "",
          cvv: "",
        },
      ],
    }));
  }

  function removePaymentCardRow(index: number) {
    setFormState((current) => {
      if (current.paymentCards.length <= 1) {
        return current;
      }

      return {
        ...current,
        paymentCards: current.paymentCards.filter((_, entryIndex) => entryIndex !== index),
      };
    });
  }

  function updatePaymentCardField(index: number, field: keyof PaymentCardRow, value: string) {
    setFormState((current) => ({
      ...current,
      paymentCards: current.paymentCards.map((entry, entryIndex) =>
        entryIndex === index ? { ...entry, [field]: value } : entry,
      ),
    }));
  }

  function removeRetailerLoginRow(index: number) {
    setFormState((current) => {
      if (current.retailerLogins.length <= 1) {
        return current;
      }

      return {
        ...current,
        retailerLogins: current.retailerLogins.filter((_, entryIndex) => entryIndex !== index),
      };
    });
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingId && currentAccounts >= maxAccountsPerUser) {
      setStatusBanner({
        message: `Account limit reached. You can create up to ${maxAccountsPerUser} accounts.`,
        tone: "error",
      });
      return;
    }

    setIsSubmitting(true);

    const cleanedRetailerLogins = formState.retailerLogins
      .map((entry) => ({
        retailer: entry.retailer.trim(),
        loginEmail: entry.loginEmail.trim(),
        loginPassword: entry.loginPassword,
      }))
      .filter((entry) => entry.retailer.length > 0 || entry.loginEmail.length > 0);

    if (cleanedRetailerLogins.length === 0) {
      setIsSubmitting(false);
      setStatusBanner({ message: "Add at least one retailer login entry.", tone: "error" });
      return;
    }

    const missingRetailer = cleanedRetailerLogins.some((entry) => !entry.retailer);
    if (missingRetailer) {
      setIsSubmitting(false);
      setStatusBanner({ message: "Please select a retailer from the dropdown for each login entry.", tone: "error" });
      return;
    }

    const paymentCards = formState.paymentCards.filter((entry) =>
      entry.retailer.trim() || entry.cardholderName.trim() || entry.cardBrand.trim() || entry.cardNumber.trim() || entry.expMonth.trim() || entry.expYear.trim() || entry.cvv.trim(),
    );

    const hasDefaultCard = paymentCards.some((entry) => !entry.retailer.trim());
    const retailersNeedingCards = cleanedRetailerLogins
      .map((entry) => entry.retailer.toLowerCase())
      .filter((retailer, index, arr) => arr.indexOf(retailer) === index);
    const uncoveredRetailers = retailersNeedingCards.filter(
      (retailer) =>
        !paymentCards.some((entry) => entry.retailer.trim().toLowerCase() === retailer),
    );

    if (paymentCards.length === 0) {
      setIsSubmitting(false);
      setStatusBanner({ message: "Add at least one payment card or leave the default card blank.", tone: "error" });
      return;
    }

    if (!hasDefaultCard && uncoveredRetailers.length > 0) {
      setIsSubmitting(false);
      setStatusBanner({
        message: `Add a default card or cover every retailer card entry: ${uncoveredRetailers.join(", ")}.`,
        tone: "error",
      });
      return;
    }

    for (const [index, row] of paymentCards.entries()) {
      const hasAnyCardInfo =
        row.cardholderName.trim() || row.cardBrand.trim() || row.cardNumber.trim() || row.expMonth.trim() || row.expYear.trim() || row.cvv.trim();
      const hasNewCardFields = row.cardNumber.trim().length > 0 || row.cvv.trim().length > 0;

      if (!hasAnyCardInfo || !hasNewCardFields) continue;

      if (!row.cardholderName.trim() || !row.cardBrand.trim() || !row.cardNumber.trim() || !row.expMonth.trim() || !row.expYear.trim() || !row.cvv.trim()) {
        setIsSubmitting(false);
        setStatusBanner({
          message: `Payment card ${index + 1} is incomplete. Fill in cardholder, brand, number, expiry, and CVV.`,
          tone: "error",
        });
        return;
      }
    }

    const firstRetailLogin = cleanedRetailerLogins[0];
    const shippingAddr = [formState.shippingAddr, formState.shippingAddr2, formState.shippingAddr3]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");
    const billingAddr = [formState.billingAddr, formState.billingAddr2, formState.billingAddr3]
      .map((value) => value.trim())
      .filter(Boolean)
      .join("\n");

    const payload = {
      label: formState.label,
      retailer: firstRetailLogin.retailer,
      email: formState.email,
      emailProvider: formState.emailProvider || null,
      onlyOneCheckout: formState.onlyOneCheckout,
      loginEmail: firstRetailLogin.loginEmail,
      retailerLogins: cleanedRetailerLogins,
      shippingName: formState.shippingName || null,
      shippingPhone: formState.shippingPhone || null,
      shippingAddr: shippingAddr || null,
      shippingCity: formState.shippingCity || null,
      shippingState: formState.shippingState || null,
      shippingZip: formState.shippingZip || null,
      billingSameAsShipping: formState.billingSameAsShipping,
      billingName: formState.billingSameAsShipping ? null : formState.billingName || null,
      billingPhone: formState.billingSameAsShipping ? null : formState.billingPhone || null,
      billingAddr: formState.billingSameAsShipping ? null : billingAddr || null,
      billingCity: formState.billingSameAsShipping ? null : formState.billingCity || null,
      billingState: formState.billingSameAsShipping ? null : formState.billingState || null,
      billingZip: formState.billingSameAsShipping ? null : formState.billingZip || null,
      imapHost: formState.imapHost,
      imapPort: Number(formState.imapPort),
      imapSecurity: formState.imapSecurity,
      password: formState.password,
      loginPassword: firstRetailLogin.loginPassword,
      status: formState.status,
    };

    const response = await fetch(editingId ? `/api/aco-accounts/${editingId}` : "/api/aco-accounts", {
      method: editingId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      setIsSubmitting(false);
      const errorBody = (await response.json().catch(() => null)) as
        | { error?: string; detail?: string }
        | null;

      setStatusBanner({
        message:
          errorBody?.detail
            ? `${errorBody?.error ?? (editingId ? "Failed to update account" : "Failed to create account")}: ${errorBody.detail}`
            : errorBody?.error ?? (editingId ? "Failed to update account." : "Failed to create account."),
        tone: "error",
      });
      return;
    }

    const body = (await response.json().catch(() => null)) as
      | { data?: { id?: string }; warning?: string }
      | null;

    const savedAccountId = editingId ?? body?.data?.id;

    if (savedAccountId) {
      const paymentRowsToSave = formState.paymentCards.filter(
        (entry) => entry.cardNumber.trim().length > 0 || entry.cvv.trim().length > 0,
      );

      for (const entry of paymentRowsToSave) {
        const paymentPayload = {
          cardNumber: entry.cardNumber,
          expMonth: toSafeNumber(entry.expMonth),
          expYear: toSafeNumber(entry.expYear),
          cvv: entry.cvv,
          cardholderName: entry.cardholderName,
          cardBrand: entry.cardBrand,
          retailer: entry.retailer || undefined,
        };

        try {
          const paymentResponse = await fetch(`/api/aco-accounts/${savedAccountId}/payment-info`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(paymentPayload),
          });

          const paymentBody = (await paymentResponse.json().catch(() => null)) as
            | { data?: CardOnFile; error?: string }
            | null;

          if (paymentResponse.ok && paymentBody?.data) {
            if (!entry.retailer.trim()) {
              setCardByAccount((current) => ({ ...current, [savedAccountId]: paymentBody.data ?? null }));
            }
          } else {
            throw new Error(paymentBody?.error ?? "Failed to save payment card.");
          }
        } catch (err) {
          setIsSubmitting(false);
          setStatusBanner({ message: err instanceof Error ? err.message : "Failed to save payment card.", tone: "error" });
          return;
        }
      }

      if (editingId) {
        const originalAccount = data?.data.find((account) => account.id === editingId);
        const savedScopes = [
          ...(cardByAccount[editingId] ? [""] : []),
          ...(originalAccount?.retailerCards ?? []).map((card) => card.retailer),
        ];
        const removedScopes = savedScopes.filter((scope) => !paymentCards.some(
          (card) => card.retailer.trim().toLowerCase() === scope.trim().toLowerCase(),
        ));

        try {
          for (const scope of removedScopes) {
            const deleteResponse = await fetch(`/api/aco-accounts/${savedAccountId}/payment-info`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ retailer: scope || null }),
            });
            if (!deleteResponse.ok) {
              const errorBody = await deleteResponse.json().catch(() => null);
              throw new Error(errorBody?.error ?? "Failed to remove payment card. Please retry saving.");
            }
            if (!scope) {
              setCardByAccount((current) => ({ ...current, [savedAccountId]: null }));
            }
          }
        } catch (err) {
          setIsSubmitting(false);
          setStatusBanner({ message: err instanceof Error ? err.message : "Failed to remove payment card.", tone: "error" });
          return;
        }
      }
    }

    setIsSubmitting(false);

    setStatusBanner({
      message:
        body?.warning ?? (editingId ? "Account updated." : "Account added."),
      tone: "success",
    });
    resetForm();
    await mutate();

    if (savedAccountId) {
      const shouldTest = window.confirm("Account saved successfully. Would you like to test the IMAP connection now?");
      if (shouldTest) {
        await testImapConnection(savedAccountId);
      }
    }
  }

  function updateEmailProvider(value: string) {
    const normalizedProvider = normalizeEmailProvider(value);
    setFormState((current) => ({
      ...current,
      emailProvider: normalizedProvider,
      imapHost:
        normalizedProvider && normalizedProvider !== "Other"
          ? EMAIL_PROVIDER_HOSTS[normalizedProvider]
          : current.imapHost,
    }));
  }

  async function deleteAccount(id: string) {
    setDeletingId(id);

    try {
      const response = await fetch(`/api/aco-accounts/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        setStatusBanner({ message: "Failed to delete account.", tone: "error" });
        return;
      }

      if (editingId === id) {
        resetForm();
      }

      setCardByAccount((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });

      setStatusBanner({ message: "Account deleted.", tone: "success" });
      await mutate();
    } finally {
      setDeletingId(null);
    }
  }

  async function testImapConnection(id: string) {
    setTestingId(id);

    try {
      const response = await fetch(`/api/aco-accounts/${id}/test`, {
        method: "POST",
      });

      const payload = (await response.json().catch(() => null)) as
        | { success?: boolean; error?: string }
        | null;

      if (!response.ok) {
        setStatusBanner({
          message: "IMAP test failed.",
          tone: "error",
          prefix: "IMAP TEST FAILED:",
        });
        return;
      }

      if (payload?.success) {
        setStatusBanner({
          message: "IMAP test succeeded.",
          tone: "success",
          prefix: "IMAP TEST PASSED:",
          pulse: true,
        });
        return;
      }

      setStatusBanner({
        message: payload?.error ? `IMAP test failed: ${payload.error}` : "IMAP test failed.",
        tone: "error",
        prefix: "IMAP TEST FAILED:",
      });
    } finally {
      setTestingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="font-heading text-3xl font-bold">Accounts</h1>
          <p className="mt-1 text-sm text-[#9C9AAE]">
            Manage IMAP inboxes, per-account shipping, and payment relay settings.
          </p>
          <p className="mt-1 text-xs text-[#72708A]">
            {currentAccounts}/{maxAccountsPerUser} accounts used.
          </p>
        </div>
        <button
          type="button"
          onClick={startCreate}
          disabled={isCreateLimitReached}
          className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCreateLimitReached
            ? `Limit reached (${maxAccountsPerUser})`
            : showForm && editingId === null
              ? "Close"
              : "Add account"}
        </button>
      </header>

      {showForm ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-2"
        >
          {/* 1. Account & IMAP Configuration at Top */}
          <div className="space-y-1 md:col-span-2">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">
                IMAP & Account Configuration
              </h3>
              <Link
                href="/setup-guide#imap-passwords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-[#4C79FF] hover:underline"
              >
                How to generate IMAP password &rarr;
              </Link>
            </div>
            <p className="text-xs text-[#9C9AAE]">
              Set up account identity, inbox provider, and IMAP credentials.
            </p>
          </div>
          <input
            value={formState.label}
            onChange={(event) =>
              setFormState((current) => ({ ...current, label: event.target.value }))
            }
            placeholder="Account label (e.g. Primary)"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.email}
            onChange={(event) =>
              setFormState((current) => ({ ...current, email: event.target.value }))
            }
            type="email"
            placeholder="IMAP email"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <select
            value={normalizeEmailProvider(formState.emailProvider)}
            onChange={(event) => updateEmailProvider(event.target.value)}
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#F2F1F6]"
          >
            <option value="">Select email provider</option>
            {EMAIL_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
          <input
            value={formState.imapHost}
            onChange={(event) =>
              setFormState((current) => ({ ...current, imapHost: event.target.value }))
            }
            placeholder="IMAP Host"
            required
            readOnly={!isManualImapHostProvider(formState.emailProvider)}
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.imapPort}
            onChange={(event) =>
              setFormState((current) => ({ ...current, imapPort: event.target.value }))
            }
            type="number"
            placeholder="IMAP port (993)"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.imapSecurity}
            onChange={(event) =>
              setFormState((current) => ({ ...current, imapSecurity: event.target.value }))
            }
            placeholder="IMAP security (SSL/TLS)"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <div className="space-y-1">
            <input
              value={formState.password}
              onChange={(event) =>
                setFormState((current) => ({ ...current, password: event.target.value }))
              }
              type="password"
              placeholder={
                editingId
                  ? "New IMAP password (leave blank to keep current)"
                  : "IMAP password (app password)"
              }
              required={!editingId}
              className="w-full rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-[#9C9AAE]">
              Need an App Password?{" "}
              <Link
                href="/setup-guide#imap-passwords"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#4C79FF] hover:underline"
              >
                View guide for your provider
              </Link>
            </p>
          </div>
          <label className="flex items-center gap-2 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#9C9AAE] md:col-span-2">
            <input
              type="checkbox"
              checked={formState.onlyOneCheckout}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  onlyOneCheckout: event.target.checked,
                }))
              }
            />
            Only one checkout
          </label>

          {/* 2. Retailer logins */}
          <div className="rounded-md border border-[#2C2D3A] bg-[#101014] p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Retailer logins</p>
                <p className="text-xs text-[#9C9AAE]">Select retailer and store login credentials.</p>
              </div>
              <button
                type="button"
                onClick={addRetailerLoginRow}
                className="rounded-md border border-[#2C2D3A] px-2 py-1 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]"
              >
                Add retailer
              </button>
            </div>
            <div className="space-y-2">
              {formState.retailerLogins.map((entry, index) => {
                const availableOptions =
                  retailerOptions.includes(entry.retailer) || !entry.retailer
                    ? retailerOptions
                    : [entry.retailer, ...retailerOptions];

                return (
                  <div key={index} className="grid gap-2 md:grid-cols-3">
                    <select
                      value={entry.retailer}
                      onChange={(event) =>
                        setRetailerLoginField(index, "retailer", event.target.value)
                      }
                      required
                      className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm text-[#F2F1F6]"
                    >
                      <option value="">Select retailer</option>
                      {availableOptions.map((retailerName) => (
                        <option key={retailerName} value={retailerName}>
                          {retailerName}
                        </option>
                      ))}
                    </select>
                    <input
                      value={entry.loginEmail}
                      onChange={(event) =>
                        setRetailerLoginField(index, "loginEmail", event.target.value)
                      }
                      type="email"
                      placeholder="Retail login email"
                      required
                      className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                    />
                    <div className="flex gap-2">
                      <input
                        value={entry.loginPassword}
                        onChange={(event) =>
                          setRetailerLoginField(index, "loginPassword", event.target.value)
                        }
                        type="password"
                        placeholder={
                          editingId
                            ? "Optional: leave blank to keep or no-password guest"
                            : "Optional: retail login password (guest checkout can be blank)"
                        }
                        className="w-full rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                      />
                      {formState.retailerLogins.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRetailerLoginRow(index)}
                          className="rounded-md border border-[#5A2323] px-2 py-2 text-xs text-[#FF9A9A] hover:text-[#FFD1D1]"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 3. Shipping Address */}
          <div className="space-y-1 pt-1 md:col-span-2">
            <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">Shipping Address</h3>
          </div>
          <input
            value={formState.shippingName}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingName: event.target.value }))
            }
            placeholder="Shipping name"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.shippingPhone}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingPhone: event.target.value }))
            }
            placeholder="Shipping phone"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.shippingAddr}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingAddr: event.target.value }))
            }
            placeholder="Shipping address line 1"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={formState.shippingAddr2}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingAddr2: event.target.value }))
            }
            placeholder="Shipping address line 2 (optional)"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={formState.shippingAddr3}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingAddr3: event.target.value }))
            }
            placeholder="Shipping address line 3 (optional)"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            value={formState.shippingCity}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingCity: event.target.value }))
            }
            placeholder="Shipping city"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.shippingState}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingState: event.target.value }))
            }
            placeholder="Shipping state"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.shippingZip}
            onChange={(event) =>
              setFormState((current) => ({ ...current, shippingZip: event.target.value }))
            }
            placeholder="Shipping ZIP"
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />

          {/* 4. Billing Address */}
          <label className="flex items-center gap-2 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#9C9AAE] md:col-span-2">
            <input
              type="checkbox"
              checked={formState.billingSameAsShipping}
              onChange={(event) =>
                setFormState((current) => ({
                  ...current,
                  billingSameAsShipping: event.target.checked,
                }))
              }
            />
            Billing and shipping addresses are the same
          </label>
          {!formState.billingSameAsShipping ? (
            <>
              <input
                value={formState.billingName}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingName: event.target.value }))
                }
                placeholder="Billing name"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
              />
              <input
                value={formState.billingPhone}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingPhone: event.target.value }))
                }
                placeholder="Billing phone"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
              />
              <input
                value={formState.billingAddr}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingAddr: event.target.value }))
                }
                placeholder="Billing address line 1"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={formState.billingAddr2}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingAddr2: event.target.value }))
                }
                placeholder="Billing address line 2 (optional)"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={formState.billingAddr3}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingAddr3: event.target.value }))
                }
                placeholder="Billing address line 3 (optional)"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
              />
              <input
                value={formState.billingCity}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingCity: event.target.value }))
                }
                placeholder="Billing city"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
              />
              <input
                value={formState.billingState}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingState: event.target.value }))
                }
                placeholder="Billing state"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
              />
              <input
                value={formState.billingZip}
                onChange={(event) =>
                  setFormState((current) => ({ ...current, billingZip: event.target.value }))
                }
                placeholder="Billing ZIP"
                className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
              />
            </>
          ) : null}

          {/* 5. Payment Method in the same panel at bottom */}
          <div className="space-y-1 pt-1 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-heading text-base font-semibold text-[#F2F1F6]">Payment Cards</h3>
              <button
                type="button"
                onClick={addPaymentCardRow}
                className="rounded-md border border-[#2C2D3A] px-2 py-1 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]"
              >
                Add card
              </button>
            </div>
            <p className="text-xs text-[#9C9AAE]">
              Add a default card or a retailer-specific override. At least one card must be default, or each retailer must have its own card row.
            </p>
          </div>

          {formState.paymentCards.map((card, index) => (
            <div key={index} className="space-y-2 rounded-md border border-[#2C2D3A] bg-[#101014] p-3 md:col-span-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs uppercase tracking-[0.08em] text-[#605E72]">
                    Use this card for
                  </label>
                  <select
                    value={card.retailer}
                    onChange={(event) => updatePaymentCardField(index, "retailer", event.target.value)}
                    className="w-full rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm text-[#F2F1F6]"
                  >
                    <option value="">Default account card</option>
                    {retailerOptions.map((retailerName) => (
                      <option key={retailerName} value={retailerName}>
                        {retailerName}
                      </option>
                    ))}
                  </select>
                </div>
                {formState.paymentCards.length > 1 ? (
                  <button
                    type="button"
                    onClick={() => removePaymentCardRow(index)}
                    className="rounded-md border border-[#5A2323] px-2 py-2 text-xs text-[#FF9A9A] hover:text-[#FFD1D1]"
                  >
                    Remove
                  </button>
                ) : null}
              </div>

              <div className="grid gap-2 md:grid-cols-2">
                <input
                  value={card.cardholderName}
                  onChange={(event) => updatePaymentCardField(index, "cardholderName", event.target.value)}
                  placeholder="Cardholder name"
                  autoComplete="cc-name"
                  className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                />
                <input
                  value={card.cardBrand}
                  onChange={(event) => updatePaymentCardField(index, "cardBrand", event.target.value)}
                  placeholder="Card brand (e.g. Visa, Mastercard, Amex)"
                  className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                />
              </div>

              <input
                value={card.cardNumber}
                onChange={(event) => updatePaymentCardField(index, "cardNumber", event.target.value)}
                placeholder={
                  editingId && cardByAccount[editingId]?.last4 && !card.retailer
                    ? `•••• •••• •••• ${cardByAccount[editingId]?.last4} (leave blank to keep current)`
                    : "Card number"
                }
                autoComplete="cc-number"
                className="w-full rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
              />

              <div className="grid grid-cols-3 gap-2">
                <input
                  value={card.expMonth}
                  onChange={(event) => updatePaymentCardField(index, "expMonth", event.target.value)}
                  placeholder="Exp Month (MM)"
                  autoComplete="cc-exp-month"
                  className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                />
                <input
                  value={card.expYear}
                  onChange={(event) => updatePaymentCardField(index, "expYear", event.target.value)}
                  placeholder="Exp Year (YYYY or YY)"
                  autoComplete="cc-exp-year"
                  className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                />
                <input
                  value={card.cvv}
                  onChange={(event) => updatePaymentCardField(index, "cvv", event.target.value)}
                  placeholder="CVV"
                  type="password"
                  autoComplete="cc-csc"
                  className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                />
              </div>
            </div>
          ))}

          <div className="flex flex-col gap-3 pt-2 md:col-span-2 md:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
            >
              {isSubmitting ? "Saving..." : editingId ? "Save changes" : "Save account"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {statusBanner ? (
        <div
          className={`rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition-all ${
            statusBanner.tone === "success"
              ? "border-[#4ADE80]/70 bg-[#10281A] text-[#9DFFBE]"
              : statusBanner.tone === "error"
                ? "border-[#FF5D5D]/70 bg-[#2A1317] text-[#FFC0C0]"
                : "border-[#4C79FF]/70 bg-[#111B38] text-[#C8D8FF]"
          } ${
            showSuccessPulse
              ? "animate-[pulse_1s_ease-in-out_2] shadow-[0_0_0_1px_rgba(74,222,128,0.2),0_0_22px_rgba(74,222,128,0.45)]"
              : ""
          }`}
          role="status"
          aria-live="polite"
        >
          {statusBanner.prefix ? `${statusBanner.prefix} ` : ""}
          {statusBanner.message}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[#FF5D5D]">Failed to load accounts.</p> : null}
      {!data ? <p className="text-sm text-[#9C9AAE]">Loading accounts...</p> : null}

      <section className="space-y-3">
        {data?.data.map((account) => {
          const card = cardByAccount[account.id];
          const retailerNames = account.retailerLogins.map((entry) => entry.retailer).join(", ");
          const retailerLoginEmails = account.retailerLogins
            .map((entry) => entry.loginEmail)
            .join(", ");
          const allCardSummaries = [
            card
              ? `Default: ${card.cardBrand ?? "Card"} •••• ${card.last4 ?? "----"} (${card.expMonth ?? "--"}/${card.expYear ?? "----"})`
              : null,
            ...(account.retailerCards ?? []).map((entry) =>
              `${entry.retailer}: ${entry.cardBrand ?? "Card"} •••• ${entry.last4 ?? "----"} (${entry.expMonth ?? "--"}/${entry.expYear ?? "----"})`,
            ),
          ].filter(Boolean);

          return (
            <article key={account.id} className="rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div>
                  <p className="font-heading text-xl font-semibold">{account.label}</p>
                  <p className="mt-1 text-sm text-[#9C9AAE]">
                    {account.email}
                  </p>
                </div>
                <span
                  className={`rounded-full border px-2 py-1 text-xs ${
                    account.status === "active"
                      ? "border-[#4ADE80]/40 text-[#4ADE80]"
                      : account.status === "locked"
                        ? "border-[#FFCB3C]/40 text-[#FFCB3C]"
                        : "border-[#FF5D5D]/40 text-[#FF5D5D]"
                  }`}
                >
                  {account.status}
                </span>
              </div>

              <div className="mt-3 grid gap-1 text-sm text-[#9C9AAE]">
                <p>Account number: #{account.accountNumber}</p>
                <p>
                  IMAP: {account.imapHost}:{account.imapPort} ({account.imapSecurity})
                </p>
                <p>Email provider: {account.emailProvider ?? "not set yet"}</p>
                <p>Checkout mode: {account.onlyOneCheckout ? "single checkout" : "multiple allowed"}</p>
                <p>IMAP login: {account.email}</p>
                <p>Retailers: {retailerNames || account.retailer}</p>
                <p>Retail logins: {retailerLoginEmails || account.loginEmail || "not set yet"}</p>
                <p>
                  Shipping: {account.shippingName ?? "N/A"} • {account.shippingAddr ?? "N/A"}
                </p>
                <p>
                  Billing: {account.billingSameAsShipping ? "same as shipping" : `${account.billingName ?? "N/A"} • ${account.billingAddr ?? "N/A"}`}
                </p>
                <p>
                  Cards on file: {allCardSummaries.length > 0 ? allCardSummaries.join(" | ") : "None"}
                </p>
                <p className="text-xs text-[#605E72]">
                  Last sync: {account.lastSyncAt ? formatDate(account.lastSyncAt) : "never"}
                </p>
              </div>

              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => testImapConnection(account.id)}
                  disabled={testingId === account.id}
                  className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6] disabled:opacity-60"
                >
                  {testingId === account.id ? "Testing..." : "Test IMAP connection"}
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(account)}
                  className="rounded-md border border-[#2C2D3A] px-3 py-2 text-sm text-[#9C9AAE] hover:text-[#F2F1F6]"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => deleteAccount(account.id)}
                  disabled={deletingId === account.id}
                  className="rounded-md border border-[#5A2323] px-3 py-2 text-sm text-[#FF9A9A] hover:text-[#FFD1D1] disabled:opacity-60"
                >
                  {deletingId === account.id ? "Deleting..." : "Delete"}
                </button>
              </div>
            </article>
          );
        })}
        {data && data.data.length === 0 ? (
          <p className="text-sm text-[#605E72]">No ACO accounts yet.</p>
        ) : null}
      </section>
    </div>
  );
}

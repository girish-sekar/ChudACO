"use client";

import { FormEvent, useEffect, useState } from "react";
import useSWR from "swr";
import {
  fetchJson,
  formatDate,
  type AcoAccount,
  type CardOnFile,
} from "@/lib/dashboard";

type AccountsResponse = {
  data: AcoAccount[];
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
  shippingCity: string;
  shippingState: string;
  shippingZip: string;
  billingSameAsShipping: boolean;
  billingName: string;
  billingPhone: string;
  billingAddr: string;
  billingCity: string;
  billingState: string;
  billingZip: string;
  imapHost: string;
  imapPort: string;
  imapSecurity: string;
  password: string;
  status: "active" | "locked" | "banned";
};

type PaymentFormState = {
  cardNumber: string;
  expMonth: string;
  expYear: string;
  cvv: string;
  cardholderName: string;
  cardBrand: string;
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
  shippingCity: "",
  shippingState: "",
  shippingZip: "",
  billingSameAsShipping: true,
  billingName: "",
  billingPhone: "",
  billingAddr: "",
  billingCity: "",
  billingState: "",
  billingZip: "",
  imapHost: "",
  imapPort: "993",
  imapSecurity: "SSL/TLS",
  password: "",
  status: "active",
};

const defaultPaymentForm: PaymentFormState = {
  cardNumber: "",
  expMonth: "",
  expYear: "",
  cvv: "",
  cardholderName: "",
  cardBrand: "",
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

export default function AccountsPage() {
  const { data, error, mutate } = useSWR<AccountsResponse>("/api/aco-accounts", fetchJson);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formState, setFormState] = useState<FormState>(defaultFormState);
  const [showSuccessPulse, setShowSuccessPulse] = useState(false);

  const [cardByAccount, setCardByAccount] = useState<Record<string, CardOnFile | null>>({});
  const [paymentForms, setPaymentForms] = useState<Record<string, PaymentFormState>>({});
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<Record<string, boolean>>({});

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
    setStatusBanner(null);
    setEditingId(null);
    setFormState(defaultFormState);
    setShowForm((value) => !value || editingId !== null);
  }

  function startEdit(account: AcoAccount) {
    setStatusBanner(null);
    setEditingId(account.id);
    const normalizedProvider = normalizeEmailProvider(account.emailProvider);
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
      shippingAddr: account.shippingAddr ?? "",
      shippingCity: account.shippingCity ?? "",
      shippingState: account.shippingState ?? "",
      shippingZip: account.shippingZip ?? "",
      billingSameAsShipping: account.billingSameAsShipping,
      billingName: account.billingName ?? "",
      billingPhone: account.billingPhone ?? "",
      billingAddr: account.billingAddr ?? "",
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
    });
    setShowForm(true);
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

    const firstRetailLogin = cleanedRetailerLogins[0];

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
      shippingAddr: formState.shippingAddr || null,
      shippingCity: formState.shippingCity || null,
      shippingState: formState.shippingState || null,
      shippingZip: formState.shippingZip || null,
      billingSameAsShipping: formState.billingSameAsShipping,
      billingName: formState.billingSameAsShipping ? null : formState.billingName || null,
      billingPhone: formState.billingSameAsShipping ? null : formState.billingPhone || null,
      billingAddr: formState.billingSameAsShipping ? null : formState.billingAddr || null,
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

    setIsSubmitting(false);

    if (!response.ok) {
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
      | { warning?: string }
      | null;

    setStatusBanner({
      message:
        body?.warning ?? (editingId ? "Account updated." : "Account added."),
      tone: "success",
    });
    resetForm();
    await mutate();
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
      setPaymentForms((current) => {
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

  function getPaymentForm(accountId: string): PaymentFormState {
    return paymentForms[accountId] ?? defaultPaymentForm;
  }

  function setPaymentFormField(accountId: string, field: keyof PaymentFormState, value: string) {
    setPaymentForms((current) => ({
      ...current,
      [accountId]: {
        ...getPaymentForm(accountId),
        [field]: value,
      },
    }));
  }

  async function submitPaymentInfo(accountId: string, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmittingPayment((current) => ({ ...current, [accountId]: true }));

    const form = getPaymentForm(accountId);

    const payload = {
      cardNumber: form.cardNumber,
      expMonth: toSafeNumber(form.expMonth),
      expYear: toSafeNumber(form.expYear),
      cvv: form.cvv,
      cardholderName: form.cardholderName,
      cardBrand: form.cardBrand,
    };

    try {
      const response = await fetch(`/api/aco-accounts/${accountId}/payment-info`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await response.json().catch(() => null)) as
        | { data?: CardOnFile; error?: string }
        | null;

      if (!response.ok || !body?.data) {
        const detailsText =
          body && typeof body === "object" && "details" in body
            ? JSON.stringify((body as { details?: unknown }).details)
            : undefined;
        setStatusBanner({
          message:
            body?.error && detailsText
              ? `${body.error}: ${detailsText}`
              : body?.error ?? "Failed to save payment method.",
          tone: "error",
        });
        return;
      }

      setCardByAccount((current) => ({ ...current, [accountId]: body.data ?? null }));
      setPaymentForms((current) => ({ ...current, [accountId]: defaultPaymentForm }));
      setStatusBanner({
        message: "Payment method relayed and display card saved.",
        tone: "success",
      });
    } finally {
      setIsSubmittingPayment((current) => ({ ...current, [accountId]: false }));
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
        </div>
        <button
          type="button"
          onClick={startCreate}
          className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6]"
        >
          {showForm && editingId === null ? "Close" : "Add account"}
        </button>
      </header>

      {showForm ? (
        <form
          onSubmit={submit}
          className="grid gap-3 rounded-xl border border-[#2C2D3A] bg-[#18181F] p-4 md:grid-cols-2"
        >
          <input
            value={formState.label}
            onChange={(event) =>
              setFormState((current) => ({ ...current, label: event.target.value }))
            }
            placeholder="Label"
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
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          >
            <option value="">Select email provider</option>
            {EMAIL_PROVIDER_OPTIONS.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm text-[#9C9AAE]">
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
          <div className="rounded-md border border-[#2C2D3A] bg-[#101014] p-3 md:col-span-2">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-medium">Retailer logins</p>
              <button
                type="button"
                onClick={addRetailerLoginRow}
                className="rounded-md border border-[#2C2D3A] px-2 py-1 text-xs text-[#9C9AAE] hover:text-[#F2F1F6]"
              >
                Add retailer
              </button>
            </div>
            <div className="space-y-2">
              {formState.retailerLogins.map((entry, index) => (
                <div key={index} className="grid gap-2 md:grid-cols-3">
                  <input
                    value={entry.retailer}
                    onChange={(event) => setRetailerLoginField(index, "retailer", event.target.value)}
                    placeholder="Retailer"
                    required
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <input
                    value={entry.loginEmail}
                    onChange={(event) => setRetailerLoginField(index, "loginEmail", event.target.value)}
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
              ))}
            </div>
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
            placeholder="Shipping address"
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
                placeholder="Billing address"
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
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <input
            value={formState.imapSecurity}
            onChange={(event) =>
              setFormState((current) => ({ ...current, imapSecurity: event.target.value }))
            }
            placeholder="IMAP security"
            required
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          />
          <select
            value={formState.status}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                status: event.target.value as FormState["status"],
              }))
            }
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm"
          >
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="banned">Banned</option>
          </select>
          <input
            value={formState.password}
            onChange={(event) =>
              setFormState((current) => ({ ...current, password: event.target.value }))
            }
            type="password"
            placeholder={
              editingId ? "New IMAP password (leave blank to keep current)" : "IMAP password"
            }
            required={!editingId}
            className="rounded-md border border-[#2C2D3A] bg-[#101014] px-3 py-2 text-sm md:col-span-2"
          />
          <div className="flex flex-col gap-3 md:col-span-2 md:flex-row">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6]"
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
          const paymentForm = getPaymentForm(account.id);
          const isSavingPayment = isSubmittingPayment[account.id] === true;
          const retailerNames = account.retailerLogins.map((entry) => entry.retailer).join(", ");
          const retailerLoginEmails = account.retailerLogins
            .map((entry) => entry.loginEmail)
            .join(", ");

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
                  Edit account + shipping
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

              <div className="mt-5 rounded-lg border border-[#2C2D3A] bg-[#101014] p-4">
                <p className="font-heading text-lg font-semibold">Payment method</p>
                {card ? (
                  <div className="mt-2 text-sm text-[#9C9AAE]">
                    <p>
                      {card.cardBrand ?? "Card"} •••• {card.last4 ?? "----"}
                    </p>
                    <p>
                      Expires {card.expMonth ?? "--"}/{card.expYear ?? "----"}
                    </p>
                    <p>Cardholder: {card.cardholderName ?? "N/A"}</p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-[#9C9AAE]">No card on file yet.</p>
                )}

                <form
                  onSubmit={(event) => void submitPaymentInfo(account.id, event)}
                  className="mt-3 grid gap-2 md:grid-cols-2"
                >
                  <input
                    value={paymentForm.cardholderName}
                    onChange={(event) =>
                      setPaymentFormField(account.id, "cardholderName", event.target.value)
                    }
                    placeholder="Cardholder name"
                    required
                    autoComplete="cc-name"
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <input
                    value={paymentForm.cardBrand}
                    onChange={(event) =>
                      setPaymentFormField(account.id, "cardBrand", event.target.value)
                    }
                    placeholder="Card brand"
                    required
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <input
                    value={paymentForm.cardNumber}
                    onChange={(event) =>
                      setPaymentFormField(account.id, "cardNumber", event.target.value)
                    }
                    placeholder="Card number"
                    required
                    autoComplete="cc-number"
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm md:col-span-2"
                  />
                  <input
                    value={paymentForm.expMonth}
                    onChange={(event) =>
                      setPaymentFormField(account.id, "expMonth", event.target.value)
                    }
                    placeholder="Expiry month"
                    required
                    type="number"
                    min={1}
                    max={12}
                    autoComplete="cc-exp-month"
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <input
                    value={paymentForm.expYear}
                    onChange={(event) =>
                      setPaymentFormField(account.id, "expYear", event.target.value)
                    }
                    placeholder="Expiry year"
                    required
                    type="number"
                    min={2024}
                    max={2100}
                    autoComplete="cc-exp-year"
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <input
                    value={paymentForm.cvv}
                    onChange={(event) => setPaymentFormField(account.id, "cvv", event.target.value)}
                    placeholder="CVV"
                    required
                    type="password"
                    autoComplete="cc-csc"
                    className="rounded-md border border-[#2C2D3A] bg-[#18181F] px-3 py-2 text-sm"
                  />
                  <button
                    type="submit"
                    disabled={isSavingPayment}
                    className="rounded-md bg-[#2F5BFF] px-3 py-2 text-sm font-medium text-[#F2F1F6] disabled:opacity-60"
                  >
                    {isSavingPayment ? "Saving..." : card ? "Update payment method" : "Add payment method"}
                  </button>
                </form>
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

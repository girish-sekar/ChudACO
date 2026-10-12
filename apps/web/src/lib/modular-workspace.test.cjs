const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function setup() {
  const state = { slots: [], cursor: 0, requests: [], confirm: false };
  const profile = {
    id: "profile-1", name: "Home", shippingName: "Sample User", shippingPhone: "5550100123",
    shippingAddr: "123 Example St", shippingCity: "Boston", shippingState: "MA", shippingZip: "02108",
    billingSameAsShipping: true, accounts: [], retailerProfiles: [],
  };
  const card = {
    id: "card-1", label: "Visa 4242", cardBrand: "Visa", last4: "4242", cardholderName: "Sample User",
    expMonth: 10, expYear: 2029, accounts: [], retailerCards: [],
  };
  const inbox = {
    id: "inbox-1", email: "sample@example.com", emailProvider: "Gmail", imapHost: "imap.gmail.com",
    imapPort: 993, imapSecurity: "SSL/TLS", passwordSet: true, accounts: [],
  };
  const account = {
    id: "account-1", accountNumber: 1, label: "Primary", botProfileName: "sample - ACO #1",
    retailer: "Target", status: "active", email: inbox.email, onlyOneCheckout: true,
    imapHost: inbox.imapHost, imapPort: 993, imapSecurity: "SSL/TLS",
    profileId: profile.id, cardId: card.id, imapConfigId: inbox.id,
    retailerLogins: [{ id: "login-1", retailer: "Target", loginEmail: "target@example.com", enabled: true }],
    retailerProfiles: [{ retailer: "Target", profileId: profile.id }],
    retailerCards: [{ id: "retailer-card-1", retailer: "Target", cardId: card.id, last4: card.last4 }],
  };
  const data = { "/api/aco-profiles": [profile], "/api/aco-cards": [card], "/api/aco-imap-configs": [inbox] };
  const hook = (initial) => {
    const index = state.cursor++;
    if (!(index in state.slots)) state.slots[index] = typeof initial === "function" ? initial() : initial;
    return [state.slots[index], (value) => { state.slots[index] = typeof value === "function" ? value(state.slots[index]) : value; }];
  };
  const dependencies = {
    react: { useState: hook, useRef: (initial) => hook({ current: initial })[0], useEffect() {} },
    "react/jsx-runtime": require("react/jsx-runtime"),
    swr: { default: (url) => ({ data: { data: data[url] }, mutate: async () => {} }) },
    "lucide-react": require("lucide-react"),
    "./modular-workspace.module.css": { default: new Proxy({}, { get: (_, key) => String(key) }) },
    "@/lib/card-brand": { CARD_BRAND_OPTIONS: ["Visa", "Mastercard"] },
    "@/lib/email-providers": { EMAIL_PROVIDER_HOSTS: { Gmail: "imap.gmail.com" }, imapHostForProvider: () => "imap.gmail.com" },
    "@/lib/dashboard": { fetchJson: async () => ({}) },
  };
  const source = fs.readFileSync(path.resolve(__dirname, "../app/dashboard/accounts/modular-workspace.tsx"), "utf8");
  const compiled = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports,
    require: (name) => { assert.ok(name in dependencies, `Unexpected dependency: ${name}`); return dependencies[name]; },
    window: { confirm: () => state.confirm },
    FormData: class { constructor(form) { this.values = form.values; } get(name) { return this.values[name] ?? null; } },
    requestAnimationFrame: (callback) => callback(),
    fetch: async (url, options) => {
      state.requests.push({ url, method: options.method, body: JSON.parse(options.body) });
      return { ok: true, json: async () => ({ data: { id: account.id } }) };
    },
  });
  const props = { accounts: [account], cardByAccount: {}, retailers: ["Target", "Costco"], onRefresh: async () => {}, loading: false, loadError: false, totalPokemonCenterProfiles: 1, maxPokemonCenterProfiles: 12, managedPokemonCenterLimit: 12, managedPokemonCenterProfiles: 1 };
  let tree;
  const render = () => { state.cursor = 0; tree = exports.ModularAccountsWorkspace(props); };
  const all = (predicate) => {
    const matches = [];
    function visit(node) {
      if (Array.isArray(node)) { node.forEach(visit); return; }
      if (!node || typeof node !== "object" || !node.props) return;
      if (predicate(node)) matches.push(node);
      visit(node.props.children);
    }
    visit(tree);
    return matches;
  };
  const find = (predicate) => { const found = all(predicate)[0]; assert.ok(found, "Expected element was not rendered"); return found; };
  const click = (element) => { element.props.onClick(); render(); };
  const open = () => click(find((node) => node.props["aria-label"] === "Edit Primary"));
  const tab = (id) => click(find((node) => node.props.id === id));
  render();
  return { state, props, account, render, all, find, click, open, tab };
}

test("workspace tabs and scoped search/filter controls expose matching records", () => {
  const harness = setup();
  assert.equal(harness.all((node) => node.props.role === "tab").length, 4);
  const search = harness.find((node) => node.props["aria-label"] === "Search Accounts");
  search.props.onChange({ target: { value: "no match" } });
  harness.render();
  assert.equal(harness.all((node) => node.type === "tr" && node.key === "account-1").length, 0);
  search.props.onChange({ target: { value: "TARGET@EXAMPLE.COM" } });
  harness.render();
  assert.equal(harness.all((node) => node.type === "tr" && node.key === "account-1").length, 1);
  harness.find((node) => node.props["aria-label"] === "Retailer filter").props.onChange({ target: { value: "Costco" } });
  harness.render();
  assert.equal(harness.all((node) => node.type === "tr" && node.key === "account-1").length, 0);
  for (const section of ["profiles", "cards", "imap"]) {
    harness.tab(`workspace-tab-${section}`);
    assert.ok(harness.find((node) => node.type === "table" && node.props["data-section"] === section));
    assert.equal(harness.find((node) => node.type === "input" && node.props.type === "search").props.value, "");
  }
});

test("editor panels remain mounted and account saves retain the existing credential and linking API contracts", async () => {
  const harness = setup();
  harness.open();
  harness.tab("editor-tab-logins");
  harness.find((node) => node.type === "input" && node.props.type === "email").props.onChange({ target: { value: "updated@example.com" } });
  harness.render();
  harness.tab("editor-tab-links");
  assert.equal(harness.all((node) => node.props["data-editor-panel"]).length, 3);
  assert.equal(harness.find((node) => node.props["data-editor-panel"] === "logins").props.hidden, true);
  assert.equal(harness.find((node) => node.type === "input" && node.props.type === "email").props.value, "updated@example.com");
  const form = harness.find((node) => node.type === "form");
  await form.props.onSubmit({ preventDefault() {}, currentTarget: { checkValidity: () => true, values: { label: "Updated label", onlyOneCheckout: "on" } } });
  await new Promise(setImmediate);
  assert.equal(harness.state.requests.length, 2);
  assert.equal(harness.state.requests[0].method, "PATCH");
  assert.equal(harness.state.requests[0].body.retailerLogins[0].loginEmail, "updated@example.com");
  assert.ok(!("loginPassword" in harness.state.requests[0].body.retailerLogins[0]));
  const linkRequest = harness.state.requests[1];
  assert.equal(linkRequest.url, "/api/aco-accounts/account-1/links");
  assert.equal(linkRequest.method, "PUT");
  assert.equal(linkRequest.body.profileId, "profile-1");
  assert.equal(linkRequest.body.cardId, "card-1");
  assert.equal(linkRequest.body.retailerCards.Target, "card-1");
  assert.equal(linkRequest.body.retailerProfiles.Target, "profile-1");
});

test("invalid hidden fields switch to their editor tab without sending API requests", async () => {
  const harness = setup();
  harness.open();
  let reported = false;
  const invalid = { closest: () => ({ dataset: { editorPanel: "logins" } }), reportValidity: () => { reported = true; } };
  await harness.find((node) => node.type === "form").props.onSubmit({ preventDefault() {}, currentTarget: { checkValidity: () => false, querySelector: () => invalid } });
  harness.render();
  assert.equal(harness.find((node) => node.props["data-editor-panel"] === "logins").props.hidden, false);
  assert.equal(reported, true);
  assert.equal(harness.state.requests.length, 0);
});

test("password visibility is opt-in and dirty editors require confirmation before discarding", () => {
  const harness = setup();
  harness.open();
  harness.tab("editor-tab-logins");
  harness.click(harness.find((node) => node.props["aria-label"] === "Show password"));
  assert.ok(harness.find((node) => node.props["aria-label"] === "Hide password"));
  harness.find((node) => node.type === "form").props.onChange();
  harness.render();
  harness.click(harness.find((node) => node.props["aria-label"] === "Close editor"));
  assert.equal(harness.all((node) => node.props.role === "dialog").length, 1);
  harness.state.confirm = true;
  harness.click(harness.find((node) => node.props["aria-label"] === "Close editor"));
  assert.equal(harness.all((node) => node.props.role === "dialog").length, 0);
});

test("retailer cards outside the library keep their existing-card option", () => {
  const harness = setup();
  harness.account.retailerCards[0].cardId = null;
  harness.render();
  harness.open();
  harness.tab("editor-tab-links");
  const select = harness.find((node) => node.props["aria-label"] === "Target payment card");
  const option = select.props.children[0];
  assert.match(option.props.children, /Keep current/);
  assert.equal(option.props.value, "");
});
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");
const ts = require("typescript");

function loadHelper(file) {
  const source = fs.readFileSync(path.resolve(__dirname, file), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const exports = {};
  vm.runInNewContext(outputText, { exports, crypto: require("node:crypto").webcrypto });
  return exports;
}

const helper = loadHelper("profile-convert.ts");

const valorProfile = (overrides = {}) => ({
  name: "test - Card",
  email: "user@example.com",
  phoneNumber: "4805551234",
  billingSameAsShipping: true,
  card: { holder: "Test User", number: "4100 3906 7605 6282", expiration: "09/29", cvv: "808", type: "visa" },
  shipping: {
    firstName: "Test", lastName: "User", addressLine1: "123 Main St", addressLine2: "",
    city: "Phoenix", countryName: "United States", countryCode: "US", state: "Arizona", zipCode: "85007",
  },
  billing: {},
  ...overrides,
});

const shikariCsv = [
  "profile_name,first_name,last_name,email,phone_num,cc_number,cc_exp_month,cc_exp_year,cc_cvv,shipping_street,shipping_street_2,shipping_city,shipping_state,shipping_zip_code,shipping_country,billing_first_name,billing_last_name,billing_street,billing_street_2,billing_city,billing_state,billing_zip_code,billing_country",
  'test - Card,Test,User,user@example.com,4805551234,4100390676056282,09,2029,808,123 Main St,,Phoenix,AZ,85007,US,Test,User,123 Main St,,Phoenix,AZ,85007,US',
  "other - Card,Other,Person,other@example.com,4805559999,378685336851003,07,2030,0335,9 Side St,,Tucson,AZ,85701,US,Other,Person,9 Side St,,Tucson,AZ,85701,US",
].join("\r\n");

test("parseValorProfiles accepts id-keyed objects and arrays", () => {
  const keyed = helper.parseValorProfiles(JSON.stringify({ "id-1": valorProfile() }));
  assert.equal(keyed.length, 1);
  assert.equal(keyed[0].email, "user@example.com");
  assert.equal(keyed[0].cardNumber, "4100390676056282");
  assert.equal(keyed[0].cardYear, "2029");

  const array = helper.parseValorProfiles(JSON.stringify([valorProfile(), valorProfile({ email: "b@example.com" })]));
  assert.equal(array.length, 2);
});

test("parseValorProfiles rejects invalid JSON", () => {
  assert.throws(() => helper.parseValorProfiles("not json"), /not valid JSON/);
});

test("parseShikariProfiles maps header columns and detects same billing", () => {
  const profiles = helper.parseShikariProfiles(shikariCsv);
  assert.equal(profiles.length, 2);
  assert.equal(profiles[0].name, "test - Card");
  assert.equal(profiles[0].shipping.city, "Phoenix");
  assert.equal(profiles[0].sameBilling, true);
  assert.equal(profiles[1].cardType, "amex");
  assert.equal(profiles[1].cardYear, "2030");
});

test("detectSourceFormat distinguishes valor, shikari, and polar", () => {
  assert.equal(helper.detectSourceFormat("profiles.json", '{"a":{}}'), "valor");
  assert.equal(helper.detectSourceFormat("profiles.csv", shikariCsv), "shikari");
  assert.equal(helper.detectSourceFormat("profiles.txt", shikariCsv), "shikari");
  assert.throws(
    () => helper.detectSourceFormat("polar.json", '{"polarExport":{}}'),
    /PolarAIO files are not supported/,
  );
});

test("filterProfilesByEmails keeps requested order and reports unmatched", () => {
  const profiles = helper.parseShikariProfiles(shikariCsv);
  const { matched, unmatchedEmails } = helper.filterProfilesByEmails(profiles, [
    "other@example.com",
    "missing@example.com",
    "user@example.com",
  ]);
  assert.deepEqual(Array.from(matched, (p) => p.email), ["other@example.com", "user@example.com"]);
  assert.deepEqual(Array.from(unmatchedEmails), ["missing@example.com"]);

  const all = helper.filterProfilesByEmails(profiles, []);
  assert.equal(all.matched.length, 2);
});

test("convertProfiles to shikari round-trips and skips invalid cards", () => {
  const profiles = helper.parseShikariProfiles(shikariCsv);
  const result = helper.convertProfiles(profiles, "shikari");
  assert.equal(result.filename, "shikari-profiles.csv");
  const rows = result.content.trim().split("\r\n");
  assert.equal(rows.length, 3);
  assert.equal(rows[0], "profile_name,first_name,last_name,email,phone_num,cc_number,cc_exp_month,cc_exp_year,cc_cvv,shipping_street,shipping_street_2,shipping_city,shipping_state,shipping_zip_code,shipping_country,billing_first_name,billing_last_name,billing_street,billing_street_2,billing_city,billing_state,billing_zip_code,billing_country");

  const bad = helper.convertProfiles(
    [helper.parseShikariProfiles(shikariCsv)[0], { ...profiles[0], email: "bad@example.com", cardCvv: "x" }],
    "shikari",
  );
  assert.equal(bad.content.trim().split("\r\n").length, 2);
  assert.equal(bad.issues.length, 1);
  assert.match(bad.issues[0], /bad@example\.com/);
});

test("convertProfiles to valor emits id-keyed object with full state names", () => {
  const profiles = helper.parseShikariProfiles(shikariCsv);
  const result = helper.convertProfiles(profiles, "valor");
  const payload = JSON.parse(result.content);
  const entries = Object.values(payload);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].email, "user@example.com");
  assert.equal(entries[0].shipping.state, "Arizona");
  assert.equal(entries[0].card.expiration, "09/29");
  assert.equal(entries[0].billingSameAsShipping, true);
  assert.equal(entries[1].card.number, "3786 853368 51003");
  assert.equal(entries[1].card.type, "amex");
});

test("convertProfiles to polar emits polarExport wrapper", () => {
  const profiles = helper.parseValorProfiles(JSON.stringify({ "id-1": valorProfile() }));
  const result = helper.convertProfiles(profiles, "polar");
  const payload = JSON.parse(result.content);
  assert.equal(payload.polarExport.kind, "profiles");
  assert.equal(payload.polarExport.profiles.length, 1);
  const profile = payload.polarExport.profiles[0];
  assert.equal(profile.shippingAddress.name, "Test User");
  assert.equal(profile.shippingAddress.state, "Arizona");
  assert.equal(profile.paymentDetails.cardNumber, "4100390676056282");
  assert.equal(profile.paymentDetails.cardExpYear, "2029");
  assert.equal(profile.sameBillingAndShippingAddress, true);
});

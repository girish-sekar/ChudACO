import assert from "node:assert/strict";
import test from "node:test";
import { classifyMemberAccessResponse } from "./member-cleanup";
import { parseSheetAccountId } from "./sheets-cleanup";

test("only confirmed missing-member and missing-role responses revoke access", () => {
  assert.equal(classifyMemberAccessResponse(404, undefined, "required"), "revoked");
  assert.equal(classifyMemberAccessResponse(200, ["required", "other"], "required"), "allowed");
  assert.equal(classifyMemberAccessResponse(200, ["other"], "required"), "revoked");
  assert.equal(classifyMemberAccessResponse(403, undefined, "required"), "unknown");
  assert.equal(classifyMemberAccessResponse(429, undefined, "required"), "unknown");
  assert.equal(classifyMemberAccessResponse(503, undefined, "required"), "unknown");
});

test("sheet ownership metadata supports current JSON rows and legacy raw account IDs", () => {
  assert.equal(parseSheetAccountId('{"acoAccountId":"account-1","retailer":"Target"}'), "account-1");
  assert.equal(parseSheetAccountId("account-2"), "account-2");
  assert.equal(parseSheetAccountId(""), null);
});
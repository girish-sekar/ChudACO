import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSuccessEmbed } from "./discord-success";

test("parses the product thumbnail from a successful checkout embed", () => {
  const parsed = parseSuccessEmbed({
    id: "message-1",
    timestamp: "2026-10-10T12:00:00.000Z",
    embeds: [{
      title: "Successful Checkout",
      fields: [
        { name: "Profile Name", value: "tester - Target 1" },
        { name: "Item", value: "Test item" },
        { name: "Quantity", value: "2" },
      ],
      thumbnail: { url: "https://cdn.example.test/product.png" },
    }],
  });

  assert.equal(parsed?.imageUrl, "https://cdn.example.test/product.png");
});

test("ignores non-http product image URLs", () => {
  const parsed = parseSuccessEmbed({
    id: "message-2",
    timestamp: "2026-10-10T12:00:00.000Z",
    embeds: [{
      title: "Successful Checkout",
      fields: [
        { name: "Profile Name", value: "tester - Target 1" },
        { name: "Item", value: "Test item" },
      ],
      image: { url: "javascript:alert(1)" },
    }],
  });

  assert.equal(parsed?.imageUrl, null);
});
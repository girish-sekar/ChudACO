import assert from "node:assert/strict";
import { test } from "node:test";
import { copySummaryPng, downloadSummaryPng } from "./drop-summary-image";

function overrideGlobal(name: string, value: unknown): () => void {
  const previous = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  return () => {
    if (previous) {
      Object.defineProperty(globalThis, name, previous);
    } else {
      Reflect.deleteProperty(globalThis, name);
    }
  };
}

test("starts clipboard writing with the pending image render", async () => {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const previousClipboardItem = Object.getOwnPropertyDescriptor(globalThis, "ClipboardItem");
  let resolveImage!: (blob: Blob) => void;
  const image = new Promise<Blob>((resolve) => { resolveImage = resolve; });
  let writeCalls = 0;

  class MockClipboardItem {
    constructor(readonly data: Record<string, Blob | Promise<Blob>>) {}
  }

  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      clipboard: {
        write: async (items: MockClipboardItem[]) => {
          writeCalls += 1;
          await items[0].data["image/png"];
        },
      },
    },
  });
  Object.defineProperty(globalThis, "ClipboardItem", { configurable: true, value: MockClipboardItem });

  try {
    const write = copySummaryPng(image);
    assert.equal(writeCalls, 1);
    resolveImage(new Blob(["png"], { type: "image/png" }));
    await write;
  } finally {
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (previousClipboardItem) Object.defineProperty(globalThis, "ClipboardItem", previousClipboardItem);
    else Reflect.deleteProperty(globalThis, "ClipboardItem");
  }
});

test("keeps an attached download URL alive until after the click", () => {
  const events: string[] = [];
  let revoke!: () => void;
  const link = {
    href: "",
    download: "",
    style: {} as CSSStyleDeclaration,
    click: () => events.push("click"),
    remove: () => events.push("remove"),
  };
  const restore = [
    overrideGlobal("document", {
      createElement: (tag: string) => {
        assert.equal(tag, "a");
        return link;
      },
      body: { appendChild: () => events.push("append") },
    }),
    overrideGlobal("window", {
      setTimeout: (callback: () => void, delay: number) => {
        events.push(`revoke-after-${delay}`);
        revoke = callback;
        return 1;
      },
    }),
  ];
  const previousCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const previousRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  let revokeCalls = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:recap" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: () => { revokeCalls += 1; } });

  try {
    downloadSummaryPng({} as Blob, "recap.png");
    assert.equal(link.href, "blob:recap");
    assert.equal(link.download, "recap.png");
    assert.deepEqual(events, ["append", "click", "remove", "revoke-after-1000"]);
    assert.equal(revokeCalls, 0);
    revoke();
    assert.equal(revokeCalls, 1);
  } finally {
    restore.reverse().forEach((restoreGlobal) => restoreGlobal());
    if (previousCreate) Object.defineProperty(URL, "createObjectURL", previousCreate);
    else Reflect.deleteProperty(URL, "createObjectURL");
    if (previousRevoke) Object.defineProperty(URL, "revokeObjectURL", previousRevoke);
    else Reflect.deleteProperty(URL, "revokeObjectURL");
  }
});
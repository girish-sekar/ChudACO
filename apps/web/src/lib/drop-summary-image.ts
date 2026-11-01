const TRANSPARENT_PIXEL = "data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=";

export async function renderSummaryPng(node: HTMLElement, backgroundColor: string): Promise<Blob> {
  const { toBlob } = await import("html-to-image");
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  const blob = await toBlob(node, {
    pixelRatio: 2,
    backgroundColor,
    width: node.scrollWidth,
    height: node.scrollHeight,
    imagePlaceholder: TRANSPARENT_PIXEL,
  });
  if (!blob) {
    throw new Error("Could not render the recap image.");
  }
  return blob;
}

export function copySummaryPng(image: Promise<Blob>): Promise<void> {
  void image.catch(() => undefined);
  if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
    throw new Error("Image clipboard is not supported by this browser.");
  }

  const item = new ClipboardItem({ "image/png": image });
  return navigator.clipboard.write([item]);
}

export function downloadSummaryPng(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.position = "fixed";
  link.style.left = "-9999px";
  document.body.appendChild(link);

  try {
    link.click();
  } finally {
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}
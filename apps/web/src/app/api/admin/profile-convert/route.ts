import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAdminDiscordIds, getAuthenticatedContext } from "@/lib/api-auth";
import {
  convertProfiles,
  detectSourceFormat,
  filterProfilesByEmails,
  parseEmailList,
  parseProfiles,
  type ConvertFormat,
} from "@/lib/profile-convert";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const formatSchema = z.enum(["shikari", "valor", "polar"]);

function countRows(result: { content: string; filename: string }): number {
  if (result.filename.endsWith(".csv")) {
    return Math.max(0, result.content.trim().split(/\r?\n/).length - 1);
  }
  try {
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    if (parsed && typeof parsed === "object" && "polarExport" in parsed) {
      const polar = parsed.polarExport as { profiles?: unknown[] };
      return Array.isArray(polar.profiles) ? polar.profiles.length : 0;
    }
    return Object.keys(parsed).length;
  } catch {
    return 0;
  }
}

export async function POST(request: NextRequest) {
  const authContext = await getAuthenticatedContext();
  if (!authContext) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!getAdminDiscordIds().has(authContext.discordId)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Upload a Valor JSON or Shikari CSV file." }, { status: 400 });
  }
  if (file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "File is too large (15 MB max)." }, { status: 400 });
  }

  const parsedFormat = formatSchema.safeParse(formData.get("format"));
  if (!parsedFormat.success) {
    return NextResponse.json({ error: "Invalid output format." }, { status: 400 });
  }
  const format: ConvertFormat = parsedFormat.data;

  const emails = parseEmailList(String(formData.get("emails") ?? ""));
  const text = await file.text();

  try {
    const sourceFormat = detectSourceFormat(file.name, text);
    const profiles = parseProfiles(text, sourceFormat);
    const { matched, unmatchedEmails } = filterProfilesByEmails(profiles, emails);
    if (matched.length === 0) {
      return NextResponse.json(
        { error: "None of the provided emails matched a profile in the uploaded file." },
        { status: 400 },
      );
    }

    const result = convertProfiles(matched, format);
    const written = countRows(result);
    const issues = [...result.issues];
    for (const email of unmatchedEmails) {
      issues.push(`${email}: no matching profile in the uploaded file`);
    }
    const summary =
      `Converted ${written} of ${matched.length} matched profile(s) from ${sourceFormat} to ${format}.` +
      (issues.length > 0 ? ` Issues: ${issues.join("; ")}` : "");

    return new NextResponse(result.content, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Content-Disposition": `attachment; filename=${result.filename}`,
        "X-Convert-Summary": encodeURIComponent(summary.slice(0, 3000)),
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conversion failed." },
      { status: 400 },
    );
  }
}

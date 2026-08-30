import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  // Delete all auth cookies
  const cookieStore = await cookies();
  const allCookies = cookieStore.getAll();
  
  const response = NextResponse.json({ 
    message: "Session cleared. Redirecting to login...",
    clearedCookies: allCookies.map(c => c.name)
  });
  
  // Delete all cookies by setting them to expire
  allCookies.forEach(cookie => {
    response.cookies.delete(cookie.name);
  });
  
  // Force redirect after 2 seconds
  return new NextResponse(
    `<!DOCTYPE html>
    <html>
      <head>
        <title>Session Cleared</title>
        <meta http-equiv="refresh" content="2;url=/login" />
      </head>
      <body style="font-family: system-ui; padding: 40px; text-align: center;">
        <h1>✓ Session Cleared</h1>
        <p>All cookies deleted. Redirecting to login page...</p>
        <p><a href="/login">Click here if not redirected automatically</a></p>
      </body>
    </html>`,
    {
      status: 200,
      headers: {
        "Content-Type": "text/html",
        "Set-Cookie": allCookies.map(c => `${c.name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`).join(", ")
      }
    }
  );
}

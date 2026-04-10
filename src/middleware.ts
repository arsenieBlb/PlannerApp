import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  // If there's a JWT decryption error (stale cookie / changed secret),
  // redirect to login and clear the bad session cookie.
  if (req.auth === null && req.nextUrl.pathname !== "/login") {
    const loginUrl = new URL("/login", req.url);
    const response = NextResponse.redirect(loginUrl);
    // Delete any stale next-auth session cookies
    response.cookies.delete("authjs.session-token");
    response.cookies.delete("__Secure-authjs.session-token");
    response.cookies.delete("next-auth.session-token");
    response.cookies.delete("__Secure-next-auth.session-token");
    return response;
  }
});

export const config = {
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.json|sw.js|icons|login).*)",
  ],
};

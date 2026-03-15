import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const protectedPaths = ["/dashboard", "/projects", "/record", "/studio"]

export default function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl

  // Check if the path is protected
  const isProtected = protectedPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  )

  if (!isProtected) return NextResponse.next()

  // Firebase auth is client-side — we check for the session cookie.
  // If absent, redirect to sign-in. The cookie is set by the AuthProvider
  // after Firebase auth state is established.
  const session = req.cookies.get("__firebase_auth")
  if (!session?.value) {
    const signInUrl = new URL("/sign-in", req.url)
    signInUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(signInUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
}

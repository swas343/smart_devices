import { withAuth } from "next-auth/middleware";

export const proxy = withAuth({
  pages: {
    signIn: "/login",
  },
});

export const config = {
  // Protect every route except /login, next-auth API routes, Next.js internals, and static files
  matcher: ["/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)"],
};

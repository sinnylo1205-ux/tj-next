import { NextResponse, type NextRequest } from "next/server";
import { AUTH_ACCESS_COOKIE, isAdminAppPath } from "@/lib/auth-session-cookie";

function redirectToLogin(request: NextRequest) {
  const url = request.nextUrl.clone();
  const dest = `${url.pathname}${url.search}`;
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("redirect", dest);
  return NextResponse.redirect(url);
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (!isAdminAppPath(pathname)) {
    return NextResponse.next();
  }

  const robotsHeaders = { "X-Robots-Tag": "noindex, nofollow" };
  const token = request.cookies.get(AUTH_ACCESS_COOKIE)?.value?.trim();
  if (!token) {
    return redirectToLogin(request);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anonKey) {
    return redirectToLogin(request);
  }

  const userRes = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });
  if (!userRes.ok) {
    return redirectToLogin(request);
  }

  const user = (await userRes.json()) as { id?: string };
  if (!user.id) {
    return redirectToLogin(request);
  }

  const roleUrl = new URL(`${supabaseUrl}/rest/v1/user_roles`);
  roleUrl.searchParams.set("select", "role");
  roleUrl.searchParams.set("user_id", `eq.${user.id}`);
  roleUrl.searchParams.set("role", "eq.admin");

  const roleRes = await fetch(roleUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: anonKey,
    },
  });
  if (!roleRes.ok) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  const roles = (await roleRes.json()) as unknown;
  const isAdmin = Array.isArray(roles) && roles.length > 0;
  if (!isAdmin) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }

  const res = NextResponse.next();
  Object.entries(robotsHeaders).forEach(([key, value]) => res.headers.set(key, value));
  return res;
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/admin-text", "/admin-text/:path*"],
};

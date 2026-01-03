import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // This will refresh the session if it's expired
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const url = request.nextUrl.clone()

  // Protected routes pattern
  const protectedRoutes = ['/dashboard', '/settings', '/todo', '/statistics', '/docs']
  const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route))

  // If user is NOT logged in and tries to access a protected route, redirect to home/auth
  if (!user && isProtectedRoute) {
    // Check if it's the owner bypass (for new signups/demos)
    // We already handle owner bypass in the page logic, but if they try to access dashboard directly
    // without a session, they should probably authenticate first.

    // We can preserve the destination to redirect back after login
    // BUT for security, let's just send them to the main page which acts as login
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // Optional: If user IS logged in and is on the landing page/auth page, redirect to dashboard?
  // Use your discretion. For now, strict protection of internal routes is the priority.

  return supabaseResponse
}

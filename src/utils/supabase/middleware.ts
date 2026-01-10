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

  // Protected routes pattern
  const url = request.nextUrl.clone()
  const protectedRoutes = ['/dashboard', '/settings', '/todo', '/statistics', '/docs']
  const isProtectedRoute = protectedRoutes.some(route => url.pathname.startsWith(route))

  try {
    // This will refresh the session if it's expired
    // We try-catch this to be lenient when offline/network fails
    const {
      data: { user },
      error
    } = await supabase.auth.getUser()

    // If user is NOT logged in (and we're sure) and tries to access a protected route
    if (!user && !error && isProtectedRoute) {
      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // Checking strictly for "Auth session missing!" error which implies token is gone/invalid
    // If it's a network error, we might want to let them through to the client (which has its own check)
    // but the safest default is strict.
    // However, specifically for offline support:
    // If getUser fails due to network, supabase auth might not return the user.
    // If we rely on cookies being present, we can do a fallback check.

    const hasAuthCookie = request.cookies.getAll().some(c => c.name.includes('sb-') && c.name.includes('auth-token'));

    if (!user && isProtectedRoute) {
      // If we have an auth cookie but getUser failed (possibly offline), let the client handle it.
      // The client-side supabase client can load the session from localStorage.
      // We only redirect if we are CERTAIN they are not logged in (no cookie).
      if (hasAuthCookie) {
        console.log('[Middleware] Verification failed but auth cookie exists. Allowing request (Offline Fallback).');
        return supabaseResponse;
      }

      url.pathname = '/'
      return NextResponse.redirect(url)
    }

    // If user is logged in, check for purchase (unless owner)
    if (user && isProtectedRoute) {
      const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL
      const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()

      if (!isOwner) {
        // Check if user has a completed purchase
        // We also want to be lenient here if offline
        try {
          const { data: purchase, error } = await supabase
            .from('purchases')
            .select('id')
            .eq('email', user.email)
            .eq('status', 'completed')
            .single()

          if (error || !purchase) {
            // Only redirect if we effectively CONFIRMED they have no purchase.
            // If it's a network error (e.g. timeout), 'error' will be present.
            // We shouldn't block access if DB is unreachable but they have a session.
            // BUT 'error' here could be "Row not found" (PGRST116) which means NO purchase.

            // If error code is 'PGRST116' (JSON object), it means not found = block.
            // If error is generic SupabaseError (network), we might want to allow.

            const isNotFoundError = error && error.code === 'PGRST116';
            const isNetworkError = error && !isNotFoundError;

            if (isNotFoundError || (!purchase && !error)) {
              console.log(`User ${user.email} has no purchase, redirecting to auth`)
              url.pathname = '/auth'
              return NextResponse.redirect(url)
            }

            if (isNetworkError) {
              console.log(`Purchase check failed due to network error, allowing access (Offline Fallback)`);
            }
          }
        } catch (err) {
          console.log(`Purchase check exception (Offline Fallback):`, err);
          // Allow access on crash/network fail
        }
      }
    }
  } catch (err) {
    // If supabase.auth.getUser() throws (e.g. complete network failure)
    // Check for cookie fallback
    const hasAuthCookie = request.cookies.getAll().some(c => c.name.includes('sb-') && c.name.includes('auth-token'));
    if (isProtectedRoute && !hasAuthCookie) {
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    // If we have cookie, proceed to client
    console.log('[Middleware] Auth check crashed, proceeding with client-side verification.');
  }

  return supabaseResponse
}

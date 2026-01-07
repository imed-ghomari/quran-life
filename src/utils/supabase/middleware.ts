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
    url.pathname = '/'
    return NextResponse.redirect(url)
  }

  // If user is logged in, check for purchase (unless owner)
  if (user && isProtectedRoute) {
    const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL
    const isOwner = OWNER_EMAIL && user.email?.toLowerCase() === OWNER_EMAIL.toLowerCase()

    if (!isOwner) {
      // Check if user has a completed purchase
      const { data: purchase, error } = await supabase
        .from('purchases')
        .select('id')
        .eq('email', user.email)
        .eq('status', 'completed')
        .single()

      if (error || !purchase) {
        console.log(`User ${user.email} has no purchase, redirecting to auth`)
        // Redirect to auth page with a flag to show they need to pay
        url.pathname = '/auth'
        return NextResponse.redirect(url)
      }
    }
  }

  return supabaseResponse
}

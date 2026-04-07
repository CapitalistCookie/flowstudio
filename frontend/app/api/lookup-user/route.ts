import { NextRequest, NextResponse } from 'next/server';
import { getAdminAuth, verifyAuthToken } from '@/lib/auth/firebase-admin';

export async function GET(request: NextRequest) {
  // Require authentication
  const caller = await verifyAuthToken(request);
  if (!caller) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const email = request.nextUrl.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'Email required' }, { status: 400 });
  }

  try {
    const user = await getAdminAuth().getUserByEmail(email);
    return NextResponse.json({
      uid: user.uid,
      displayName: user.displayName || '',
      email: user.email || '',
    });
  } catch {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }
}

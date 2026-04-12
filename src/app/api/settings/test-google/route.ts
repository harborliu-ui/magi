import { NextResponse } from 'next/server';
import { testGoogleConnection } from '@/lib/google-docs';

export async function POST() {
  const result = await testGoogleConnection();
  return NextResponse.json(result);
}

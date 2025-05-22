import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const { message } = await req.json();

  const response = `Thanks for sharing that. Our legal team will review your message: "${message}"`;

  return NextResponse.json({ message: response });
}
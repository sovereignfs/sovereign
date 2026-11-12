import { NextResponse } from 'next/server';
import { StorageError } from '@sovereignfs/storage';

/** A store's refusal as an answer a page can show: its code, its status, and a message a person can act on. */
export function storageErrorResponse(error: unknown): Response | undefined {
  if (!(error instanceof StorageError)) return undefined;
  return NextResponse.json({ error: error.code, message: error.message }, { status: error.status });
}

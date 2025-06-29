// app/api/export-rules/route.ts

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import type { WithId, Document } from 'mongodb';

// Define the shape of a rule document (partial, based on your usage)
type Rule = WithId<Document>;

/**
 * Utility to sanitize rule documents before exporting.
 * Removes _id and __v fields.
 */
const sanitizeRules = (rules: Rule[]): Record<string, any>[] =>
  rules.map(({ _id, __v, ...rest }) => rest);

export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const rulesCollection = db.collection('rules');

    const rawRules = (await rulesCollection.find({}).toArray()) as Rule[];
    const cleanedRules = sanitizeRules(rawRules);

    const json = JSON.stringify(cleanedRules, null, 2);
    const buffer = Buffer.from(json, 'utf-8');

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="rules.json"',
      },
    });

  } catch (error: any) {
    console.error('[Export Rules Error]:', error);
    return NextResponse.json(
      {
        message: 'Error exporting rules.',
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// app/api/data/[entity]/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { ObjectId } from 'mongodb';
import { validateData } from '@/lib/validators';

const VALID_ENTITIES = ['clients', 'workers', 'tasks'] as const;
type EntityType = typeof VALID_ENTITIES[number];

// Utility to validate entity param
const isValidEntity = (entity: string): entity is EntityType =>
  VALID_ENTITIES.includes(entity as EntityType);

// Shared response utility
const respond = (
  message: string,
  status = 200,
  extra: Record<string, any> = {}
): NextResponse => NextResponse.json({ message, ...extra }, { status });

// --------------------
// GET: Fetch documents
// --------------------
export async function GET(request: NextRequest, context: any) {
  const { entity } = context.params;

  if (!isValidEntity(entity)) {
    return respond('Invalid entity type specified. Must be clients, workers, or tasks.', 400);
  }

  try {
    const { db } = await connectToDatabase();
    const data = await db.collection(entity).find({}).toArray();
    return NextResponse.json({ data }, { status: 200 });
  } catch (error: any) {
    console.error(`Error fetching ${entity} data:`, error);
    return respond(`Error fetching ${entity} data.`, 500, { error: error.message });
  }
}

// ---------------------------
// PUT: Update single document
// ---------------------------
export async function PUT(request: NextRequest, context: any) {
  const { entity } = context.params;

  if (!isValidEntity(entity)) {
    return respond('Invalid entity type specified. Must be clients, workers, or tasks.', 400);
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(entity);
    const body = await request.json();
    const { _id, ...updatedFields } = body;

    if (!_id) return respond('Document ID (_id) is required for update.', 400);

    const existingDoc = await collection.findOne({ _id: new ObjectId(_id) });
    if (!existingDoc) return respond('Document not found for update.', 404);

    const docToValidate = { ...existingDoc, ...updatedFields };
    const validationErrors = validateData(entity, docToValidate);

    const finalUpdate = {
      ...updatedFields,
      _validationErrors: validationErrors.length > 0 ? validationErrors : null,
    };

    const result = await collection.updateOne(
      { _id: new ObjectId(_id) },
      { $set: finalUpdate }
    );

    return respond(
      result.matchedCount === 0
        ? 'Document found, but no changes were necessary (data was identical).'
        : `${entity} document updated successfully.`,
      200,
      { modifiedCount: result.modifiedCount }
    );
  } catch (error: any) {
    console.error(`Error updating ${entity} document:`, error);
    return respond(`Error updating ${entity} document.`, 500, { error: error.message });
  }
}

// ------------------------------
// DELETE: Delete single document
// ------------------------------
export async function DELETE(request: NextRequest, context: any) {
  const { entity } = context.params;

  if (!isValidEntity(entity)) {
    return respond('Invalid entity type specified. Must be clients, workers, or tasks.', 400);
  }

  try {
    const { db } = await connectToDatabase();
    const { _id } = await request.json();

    if (!_id) return respond('Document ID (_id) is required for deletion.', 400);

    const result = await db.collection(entity).deleteOne({ _id: new ObjectId(_id) });

    if (result.deletedCount === 0) return respond('Document not found.', 404);

    return respond(`${entity} document deleted successfully.`, 200, {
      deletedCount: result.deletedCount,
    });
  } catch (error: any) {
    console.error(`Error deleting ${entity} document:`, error);
    return respond(`Error deleting ${entity} document.`, 500, { error: error.message });
  }
}
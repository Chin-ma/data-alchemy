import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { ObjectId, Collection } from 'mongodb';

// --------------------------
// Interfaces
// --------------------------
interface Rule {
  _id?: string | ObjectId;
  type: string; // Enforce required fields
  payload: any;
  [key: string]: any; // For additional dynamic fields
}

// --------------------------
// GET: Fetch all rules
// --------------------------
export async function GET() {
  try {
    const { db } = await connectToDatabase();
    const collection: Collection<Rule> = db.collection('rules');
    const rules = await collection.find({}).toArray();

    return NextResponse.json({ rules }, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching rules:', error);
    return NextResponse.json({ message: 'Error fetching rules.', error: error.message }, { status: 500 });
  }
}

// --------------------------
// POST: Add new rule
// --------------------------
export async function POST(request: Request) {
  try {
    const { db } = await connectToDatabase();
    const collection: Collection<Rule> = db.collection('rules');

    const newRule: Rule = await request.json();
    if (!newRule.type || !newRule.payload) {
      return NextResponse.json({ message: 'Rule must have a type and payload.' }, { status: 400 });
    }

    const result = await collection.insertOne(newRule);
    return NextResponse.json({ message: 'Rule added successfully.', ruleId: result.insertedId }, { status: 201 });
  } catch (error: any) {
    console.error('Error adding rule:', error);
    return NextResponse.json({ message: 'Error adding rule.', error: error.message }, { status: 500 });
  }
}

// --------------------------
// PUT: Update existing rule
// --------------------------
export async function PUT(request: Request) {
  try {
    const { db } = await connectToDatabase();
    const collection: Collection<Rule> = db.collection('rules');

    const body: Rule = await request.json();
    const { _id, ...updatedFields } = body;

    if (!_id) {
      return NextResponse.json({ message: 'Rule ID (_id) is required for update.' }, { status: 400 });
    }

    const result = await collection.updateOne(
      { _id: new ObjectId(_id) },
      { $set: updatedFields }
    );

    if (result.matchedCount === 0) {
      return NextResponse.json({ message: 'Rule not found.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Rule updated successfully.', modifiedCount: result.modifiedCount }, { status: 200 });
  } catch (error: any) {
    console.error('Error updating rule:', error);
    return NextResponse.json({ message: 'Error updating rule.', error: error.message }, { status: 500 });
  }
}

// --------------------------
// DELETE: Delete a rule
// --------------------------
export async function DELETE(request: Request) {
  try {
    const { db } = await connectToDatabase();
    const collection: Collection<Rule> = db.collection('rules');

    const body: { _id?: string } = await request.json();

    if (!body._id) {
      return NextResponse.json({ message: 'Rule ID (_id) is required for deletion.' }, { status: 400 });
    }

    const result = await collection.deleteOne({ _id: new ObjectId(body._id) });

    if (result.deletedCount === 0) {
      return NextResponse.json({ message: 'Rule not found.' }, { status: 404 });
    }

    return NextResponse.json({ message: 'Rule deleted successfully.', deletedCount: result.deletedCount }, { status: 200 });
  } catch (error: any) {
    console.error('Error deleting rule:', error);
    return NextResponse.json({ message: 'Error deleting rule.', error: error.message }, { status: 500 });
  }
}
import { NextResponse } from 'next/server';
import { getStructuredAISuggestion } from '@/lib/gemini';
import { connectToDatabase } from '@/lib/mongo';
import type { Document } from 'mongodb';

// --------------------------
// Type Definitions
// --------------------------

interface Condition {
  field: string;
  operator: string;
  value: string | number | boolean | string[] | null;
  type?: string;
}

interface Action {
  type: string;
  field: string;
  value?: string | number | boolean | object | null;
  additionalFields?: Record<string, any>;
}

interface StructuredRule extends Document {
  ruleName?: string;
  description: string;
  entityType: 'clients' | 'workers' | 'tasks' | 'general';
  conditions: Condition[];
  actions: Action[];
  priority?: number;
  enabled?: boolean;
  createdAt?: Date;
  lastModified?: Date;
}

// --------------------------
// Rule Schema for Gemini
// --------------------------

const ruleSchema = {
  type: "object",
  properties: {
    ruleName: { type: "string", description: "A short, descriptive name for the rule." },
    description: { type: "string", description: "A detailed description of what the rule does." },
    entityType: {
      type: "string",
      enum: ["clients", "workers", "tasks", "general"],
      description: "The type of data this rule applies to."
    },
    conditions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          field: { type: "string" },
          operator: {
            type: "string",
            enum: [
              "eq", "ne", "gt", "lt", "gte", "lte", "contains",
              "startsWith", "endsWith", "in", "nin", "exists",
              "is_string", "is_not_json"
            ]
          },
          value: {
            type: ["string", "number", "boolean", "array", "null"]
          },
          type: {
            type: "string",
            enum: ["string", "number", "boolean", "array", "object", "null"]
          }
        },
        required: ["field", "operator", "value"]
      }
    },
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: {
            type: "string",
            enum: [
              "set_field", "mark_error", "transform_value",
              "filter_out", "wrap_string_in_json_message"
            ]
          },
          field: { type: "string" },
          value: {
            type: ["string", "number", "boolean", "array", "object", "null"]
          },
          additionalFields: {
            type: "object",
            description: "Optional extra fields for wrap_string_in_json_message.",
            additionalProperties: true
          }
        },
        required: ["type", "field"]
      }
    },
    priority: {
      type: "number",
      default: 0
    },
    enabled: {
      type: "boolean",
      default: true
    }
  },
  required: ["description", "conditions", "actions"]
};

// --------------------------
// POST Route
// --------------------------

export async function POST(request: Request) {
  try {
    const { naturalLanguageText } = await request.json();

    if (!naturalLanguageText || naturalLanguageText.trim() === '') {
      return NextResponse.json({ message: 'Natural language text is required.' }, { status: 400 });
    }

    const prompt = `Convert the following natural language rule into a structured JSON object based on the provided schema. Infer the 'entityType' based on keywords like 'client', 'worker', 'task', or use 'general' if ambiguous.

For conditions, use operators like 'eq', 'ne', 'gt', 'lt', 'gte', 'lte', 'contains', 'startsWith', 'endsWith', 'in', 'nin', 'exists', 'is_string', 'is_not_json'. For 'in'/'nin', value should be an array.

For actions, use 'set_field', 'mark_error', 'transform_value', 'filter_out', or 'wrap_string_in_json_message'. When using 'wrap_string_in_json_message', always include 'additionalFields' with placeholder defaults like:
  - location: "Unknown"
  - budget: 0
  - status: "pending"
  - type: "generic"

Ensure all required properties are included. If no rule name is specified, generate a short one.

Natural Language Rule:
"${naturalLanguageText}"

JSON Schema:
${JSON.stringify(ruleSchema, null, 2)}
`;

    console.log("Sending prompt to Gemini...");
    const structuredRule = await getStructuredAISuggestion(prompt, ruleSchema) as StructuredRule | null;
    console.log("Received structured response from Gemini:", structuredRule);

    if (!structuredRule) {
      return NextResponse.json({ message: 'Failed to get structured rule from AI.' }, { status: 500 });
    }

    if (!structuredRule.conditions?.length) {
      return NextResponse.json({ message: 'AI did not generate valid conditions for the rule.' }, { status: 400 });
    }

    if (!structuredRule.actions?.length) {
      return NextResponse.json({ message: 'AI did not generate valid actions for the rule.' }, { status: 400 });
    }

    const { db } = await connectToDatabase();
    const rulesCollection = db.collection('rules');

    const ruleToSave: StructuredRule = {
      ...structuredRule,
      createdAt: new Date(),
      lastModified: new Date(),
    };

    const result = await rulesCollection.insertOne(ruleToSave);

    return NextResponse.json({
      message: 'Rule successfully converted and saved.',
      rule: ruleToSave,
      ruleId: result.insertedId,
    }, { status: 200 });

  } catch (error: any) {
    console.error('Error in /api/ai-suggestions:', error);
    return NextResponse.json(
      { message: 'Internal server error during rule conversion.', error: error.message },
      { status: 500 }
    );
  }
}
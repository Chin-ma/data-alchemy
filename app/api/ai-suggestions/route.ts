// app/api/ai-suggestions/route.ts

import { NextResponse } from 'next/server';
import { getAISuggestions } from '@/lib/gemini';
import { validateData } from '@/lib/validators';

type EntityType = 'clients' | 'workers' | 'tasks';

type Suggestion = {
  field: string;
  value: string | number | boolean | null | object | any[];
};

type RequestBody = {
  entityType: EntityType;
  rowData: Record<string, any> & { _validationErrors?: string[] };
};

// Utility: Standard JSON response
const respond = (
  message: string,
  status: number = 200,
  extra: Record<string, any> = {}
) => NextResponse.json({ message, ...extra }, { status });

// Utility: Prompt generator
const buildPrompt = (
  entityType: EntityType,
  rowData: Record<string, any>,
  currentErrorsList: string[]
): string => {
  return `I have a data record of type '${entityType}' from a spreadsheet. The record's current fields and values are:
${JSON.stringify(rowData, null, 2)}

It has the following validation errors:
${JSON.stringify(currentErrorsList, null, 2)}

Please suggest corrections for the above errors **and** fill in any obvious data gaps.

Your response MUST be a JSON array of objects, where each object has:
- 'field': the name of the field to update (as string),
- 'value': the correct value to apply (of correct type: number, string, boolean, array, or JSON object).

Format example:
[
  { "field": "PriorityLevel", "value": 3 },
  { "field": "RequestedTaskIDs", "value": "TaskABC,TaskXYZ" },
  { "field": "AttributesJSON", "value": {"status": "active", "level": "gold"} }
]

If a field should be cleared or emptied, set it to "" or null. If no suggestion is needed, return an empty array. **Output only the JSON array. Do not explain or wrap in text.**`;
};

// -----------------------
// POST: Get AI Suggestions
// -----------------------
export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();

    const { entityType, rowData } = body;

    if (!entityType || !rowData) {
      return respond('Missing entityType or rowData.', 400);
    }

    const currentErrorsList = rowData._validationErrors || [];
    const prompt = buildPrompt(entityType, rowData, currentErrorsList);

    console.log('Sending prompt to Gemini:', prompt);
    const geminiResponseText = await getAISuggestions(prompt);
    console.log('Received response from Gemini:', geminiResponseText);

    if (!geminiResponseText) {
      return respond('No suggestions received from AI or AI service error.', 500);
    }

    // ----------------------
    // Parse AI JSON Response
    // ----------------------
    let suggestions: Suggestion[] = [];

    try {
      const cleaned = geminiResponseText.replace(/```json\n?|```/g, '').trim();
      const parsed = JSON.parse(cleaned);

      if (!Array.isArray(parsed)) {
        throw new Error('AI response is not a JSON array.');
      }

      suggestions = parsed;
    } catch (err: any) {
      console.error('Error parsing AI response:', err);
      return respond('Failed to parse AI suggestions. Response format unexpected.', 500, {
        rawResponse: geminiResponseText,
      });
    }

    // -------------------------------------
    // Validate AI Suggestions Before Return
    // -------------------------------------
    const validSuggestions = suggestions.filter(({ field, value }) => {
      if (!field || typeof value === 'undefined') return false;

      const testRow = { ...rowData, [field]: value };
      delete testRow._validationErrors;

      const errors = validateData(entityType, testRow);
      if (errors.length === 0) return true;

      console.warn(
        `Rejected AI suggestion: field=${field}, value=${JSON.stringify(
          value
        )}, errors=${errors.join(', ')}`
      );
      return false;
    });

    return NextResponse.json({ suggestions: validSuggestions }, { status: 200 });
  } catch (error: any) {
    console.error('API Error in /api/ai-suggestions:', error);
    return respond('Internal server error.', 500, { error: error.message });
  }
}

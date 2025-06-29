// lib/gemini.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.error('GEMINI_API_KEY is not set. Please set it in your .env.local file.');
  // Throwing an error here would prevent the app from starting if the key is missing,
  // which is often desirable for critical API keys.
  // For now, we'll log an error and let it proceed, but AI features won't work.
}

const genAI = API_KEY ? new GoogleGenerativeAI(API_KEY) : null;

export async function getAISuggestions(promptText) {
  if (!genAI) {
    console.error('Gemini AI client not initialized due to missing API key.');
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
    const result = await model.generateContent(promptText);
    const response = await result.response;
    const text = response.text();
    return text;
  } catch (error) {
    console.error('Error calling Gemini AI:', error);
    return null;
  }
}

/**
 * Sends a prompt to Gemini and requests a structured JSON response based on a schema.
 * @param {string} promptText - The natural language prompt.
 * @param {object} responseSchema - The JSON schema for the expected response.
 * @returns {Promise<object|null>} The parsed JSON object from Gemini, or null if error.
 */
export async function getStructuredAISuggestion(promptText, schema) {
  if (!genAI) {
    console.error('Gemini AI client not initialized due to missing API key.');
    return null;
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const fullPrompt = `
Respond ONLY with a valid JSON object. DO NOT wrap it in markdown or code blocks.

Schema:
${JSON.stringify(schema, null, 2)}

Prompt: ${promptText}
`;

    const result = await model.generateContent(fullPrompt);
    const response = await result.response;
    let text = await response.text();

    // ✅ Remove Markdown code block markers if present
    text = text.trim();
    if (text.startsWith("```json") || text.startsWith("```")) {
      text = text.replace(/^```(?:json)?/, "").replace(/```$/, "").trim();
    }

    console.log("🔍 Cleaned Gemini response:\n", text);

    try {
      return JSON.parse(text);
    } catch (err) {
      console.error('❌ Failed to parse JSON after cleaning:', err);
      return null;
    }
  } catch (err) {
    console.error('❌ Error calling Gemini API:', err);
    return null;
  }
}

import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import { determineEntityType, validateData } from '@/lib/validators';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import path from 'path';
import fs from 'fs';

// -----------------------------
// Types
// -----------------------------
interface RowData {
  [key: string]: any;
  _validationErrors?: string[];
}

// -----------------------------
// Utilities
// -----------------------------
const respond = (message: string, status = 200, extra: Record<string, any> = {}) =>
  NextResponse.json({ message, ...extra }, { status });

const ensureDirExists = (dir: string) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const parseCSV = async (buffer: Buffer): Promise<RowData[]> => {
  const csvString = buffer.toString('utf8');
  return new Promise((resolve, reject) => {
    Papa.parse<RowData>(csvString, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => resolve(results.data),
      error: (err) => reject(err),
    });
  });
};

const parseXLSX = (buffer: Buffer): RowData[] => {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const worksheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RowData>(worksheet);
};

// -----------------------------
// POST Handler: File Upload
// -----------------------------
export async function POST(req: Request) {
  const tempDir = path.join(process.cwd(), 'uploads_temp');
  ensureDirExists(tempDir);

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file) return respond('No file uploaded.', 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    const filename = file.name;
    const extension = path.extname(filename).toLowerCase();
    const tempPath = path.join(tempDir, filename);
    fs.writeFileSync(tempPath, buffer);

    // Parse the uploaded file
    let parsedData: RowData[] = [];
    if (extension === '.csv') {
      parsedData = await parseCSV(buffer);
    } else if (extension === '.xlsx') {
      parsedData = parseXLSX(buffer);
    } else {
      fs.unlinkSync(tempPath);
      return respond('Unsupported file type. Please upload CSV or XLSX.', 400);
    }

    if (parsedData.length === 0) {
      fs.unlinkSync(tempPath);
      return respond('Uploaded file is empty or could not be parsed.', 400);
    }

    // Detect entity type and validate
    const headers = Object.keys(parsedData[0]);
    const entityType = determineEntityType(headers);

    if (!entityType) {
      fs.unlinkSync(tempPath);
      return respond('Could not determine data type (clients, workers, or tasks) from file headers.', 400);
    }

    const { db } = await connectToDatabase();
    const collection = db.collection<RowData>(entityType);

    const validatedRows: RowData[] = parsedData.map((row) => {
      const errors = validateData(entityType, row);
      if (errors.length > 0) row._validationErrors = errors;
      else delete row._validationErrors;
      return row;
    });

    await collection.deleteMany({});
    await collection.insertMany(validatedRows);

    fs.unlinkSync(tempPath);

    return respond(
      `File "${filename}" uploaded, parsed, and saved to "${entityType}" collection successfully.`,
      200,
      {
        entityType,
        recordsInserted: validatedRows.length,
      }
    );
  } catch (error: any) {
    console.error('File upload/processing error:', error);
    return respond('Error processing file.', 500, { error: error.message });
  }
}

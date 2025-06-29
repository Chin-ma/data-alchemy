// app/api/export/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/mongo';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

type EntityType = 'clients' | 'workers' | 'tasks';
type ExportFormat = 'csv' | 'xlsx';

const VALID_ENTITIES: EntityType[] = ['clients', 'workers', 'tasks'];
const VALID_FORMATS: ExportFormat[] = ['csv', 'xlsx'];

interface RecordData {
  [key: string]: any;
}

// Clean and serialize data for flat formats like CSV/XLSX
const sanitizeData = (data: RecordData[]): RecordData[] =>
  data.map(({ _id, __v, _validationErrors, ...fields }) => {
    return Object.fromEntries(
      Object.entries(fields).map(([key, value]) => {
        if (Array.isArray(value)) return [key, value.join(',')];
        if (typeof value === 'object' && value !== null) return [key, JSON.stringify(value)];
        return [key, value];
      })
    );
  });

// Convert to CSV or XLSX
const generateFile = (
  data: RecordData[],
  format: ExportFormat,
  entityType: EntityType
): {
  buffer: Buffer;
  contentType: string;
  filename: string;
} => {
  if (format === 'csv') {
    const csv = Papa.unparse(data);
    return {
      buffer: Buffer.from(csv),
      contentType: 'text/csv',
      filename: `${entityType}_cleaned.csv`,
    };
  }

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, entityType);

  return {
    buffer: XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }),
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    filename: `${entityType}_cleaned.xlsx`,
  };
};

// ----------------------
// GET: Export data
// ----------------------
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const entityType = searchParams.get('entity') as EntityType;
  const format = searchParams.get('format') as ExportFormat;

  if (!VALID_ENTITIES.includes(entityType)) {
    return NextResponse.json(
      { message: 'Invalid entity type. Use clients, workers, or tasks.' },
      { status: 400 }
    );
  }

  if (!VALID_FORMATS.includes(format)) {
    return NextResponse.json(
      { message: 'Invalid format. Must be csv or xlsx.' },
      { status: 400 }
    );
  }

  try {
    const { db } = await connectToDatabase();
    const collection = db.collection(entityType);
    const rawData = await collection.find({}).toArray();
    const cleanedData = sanitizeData(rawData);

    const { buffer, contentType, filename } = generateFile(cleanedData, format, entityType);

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error: any) {
    console.error(`Export error for ${entityType}:`, error);
    return NextResponse.json(
      { message: `Error exporting ${entityType} data.`, error: error.message },
      { status: 500 }
    );
  }
}

// Text extraction for PDF, DOCX, TXT, MD
// Runs server-side only (API routes)

import { ExtractionError } from './errors';
import type { DocType } from '../types';

export interface ExtractionResult {
  text: string;
  pageCount?: number;
  metadata: {
    pageNumbers?: Map<number, number>; // char offset → page number
  };
}

/**
 * Extract text from a file with metadata preservation
 * @param file - The file to extract text from
 * @returns ExtractionResult with text content and metadata
 */
export async function extractText(file: File): Promise<ExtractionResult> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    switch (ext) {
      case 'pdf':
        return await extractPdf(buffer);
      case 'docx':
        return await extractDocx(buffer);
      case 'txt':
      case 'md':
        return extractPlainText(buffer);
      default:
        throw new ExtractionError(
          `Unsupported file type: .${ext}. Supported formats: PDF, DOCX, TXT, MD`,
          `File extension: ${ext}`
        );
    }
  } catch (error) {
    if (error instanceof ExtractionError) {
      throw error;
    }
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExtractionError(
      `Failed to extract text from ${ext?.toUpperCase() || 'unknown'} file: ${errorMessage}`,
      `File type: ${ext}, Error: ${errorMessage}`
    );
  }
}

/**
 * Extract text from PDF with page number preservation
 */
async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    // Dynamic import — avoids bundling in client components
    const pdfParse = (await import('pdf-parse')).default;
    const data = await pdfParse(buffer);
    
    // Build page number mapping
    const pageNumbers = new Map<number, number>();
    
    // pdf-parse doesn't provide per-page text, so we approximate
    // by dividing total text length by number of pages
    if (data.numpages > 0 && data.text.length > 0) {
      const avgCharsPerPage = Math.ceil(data.text.length / data.numpages);
      
      for (let page = 1; page <= data.numpages; page++) {
        const pageStartOffset = (page - 1) * avgCharsPerPage;
        pageNumbers.set(pageStartOffset, page);
      }
    }
    
    return {
      text: data.text,
      pageCount: data.numpages,
      metadata: {
        pageNumbers,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExtractionError(
      `Failed to parse PDF file: ${errorMessage}`,
      `PDF parsing error: ${errorMessage}`
    );
  }
}

/**
 * Extract text from DOCX file
 */
async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    
    return {
      text: result.value,
      metadata: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExtractionError(
      `Failed to parse DOCX file: ${errorMessage}`,
      `DOCX parsing error: ${errorMessage}`
    );
  }
}

/**
 * Extract text from plain text or Markdown files
 */
function extractPlainText(buffer: Buffer): ExtractionResult {
  try {
    const text = buffer.toString('utf-8');
    
    return {
      text,
      metadata: {},
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    throw new ExtractionError(
      `Failed to read text file: ${errorMessage}`,
      `Text decoding error: ${errorMessage}`
    );
  }
}

/**
 * Detect document type from filename patterns
 * @param filename - The name of the file
 * @returns Detected document type
 */
export function detectDocumentType(filename: string): DocType {
  const lowerName = filename.toLowerCase();
  
  // Check for Data Vault specific patterns
  if (lowerName.includes('hub')) {
    return 'hub';
  }
  if (lowerName.includes('link')) {
    return 'link';
  }
  if (lowerName.includes('satellite') || lowerName.includes('sat')) {
    return 'satellite';
  }
  if (lowerName.includes('pit') || lowerName.includes('bridge')) {
    return 'pit_bridge';
  }
  if (lowerName.includes('methodology') || lowerName.includes('guide') || lowerName.includes('best-practice')) {
    return 'methodology';
  }
  
  // Default to general
  return 'general';
}

/**
 * Get the page number for a given character offset
 * @param offset - Character offset in the document
 * @param pageNumbers - Map of offsets to page numbers
 * @returns Page number or undefined if not available
 */
export function getPageNumber(offset: number, pageNumbers?: Map<number, number>): number | undefined {
  if (!pageNumbers || pageNumbers.size === 0) {
    return undefined;
  }
  
  // Find the closest page start offset that is <= the given offset
  let closestPage: number | undefined;
  let closestOffset = -1;
  
  for (const [pageOffset, pageNum] of pageNumbers.entries()) {
    if (pageOffset <= offset && pageOffset > closestOffset) {
      closestOffset = pageOffset;
      closestPage = pageNum;
    }
  }
  
  return closestPage;
}

// Input validation utilities

import { ValidationError } from './errors';

const ALLOWED_FILE_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
const EXECUTABLE_EXTENSIONS = ['.exe', '.sh', '.bat', '.cmd', '.app', '.dmg', '.jar', '.msi', '.deb', '.rpm'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_QUERY_LENGTH = 500;
const MIN_QUERY_LENGTH = 1;

export function validateQuery(query: string): void {
  if (!query || query.trim().length < MIN_QUERY_LENGTH) {
    throw new ValidationError('Query cannot be empty');
  }

  if (query.length > MAX_QUERY_LENGTH) {
    throw new ValidationError(`Query exceeds maximum length of ${MAX_QUERY_LENGTH} characters`);
  }
}

export function validateFile(file: File): void {
  // Check file size
  if (file.size > MAX_FILE_SIZE) {
    throw new ValidationError(`File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Check file extension
  const extension = '.' + file.name.split('.').pop()?.toLowerCase();
  
  // Reject executable files
  if (EXECUTABLE_EXTENSIONS.includes(extension)) {
    throw new ValidationError('Executable files are not allowed for security reasons');
  }

  // Check if file type is supported
  if (!ALLOWED_FILE_EXTENSIONS.includes(extension)) {
    throw new ValidationError(
      `Unsupported file type. Allowed types: ${ALLOWED_FILE_EXTENSIONS.join(', ')}`
    );
  }
}

export function sanitizeInput(input: string): string {
  // Remove potential XSS vectors
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .trim();
}

export function validateDocumentId(id: string): void {
  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(id)) {
    throw new ValidationError('Invalid document ID format');
  }
}

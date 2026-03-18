// Error handling utilities for Data Vault Knowledge Assistant

export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public details?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 'VALIDATION_ERROR', 400, details);
    this.name = 'ValidationError';
  }
}

export class ExtractionError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 'EXTRACTION_FAILED', 500, details);
    this.name = 'ExtractionError';
  }
}

export class EmbeddingError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 'EMBEDDING_FAILED', 500, details);
    this.name = 'EmbeddingError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, details?: string) {
    super(message, 'DATABASE_ERROR', 500, details);
    this.name = 'DatabaseError';
  }
}

// Sanitize error messages for user display (remove sensitive info)
export function sanitizeError(error: unknown): { message: string; code: string } {
  if (error instanceof AppError) {
    return {
      message: error.message,
      code: error.code,
    };
  }

  if (error instanceof Error) {
    // Don't expose internal error details
    return {
      message: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    };
  }

  return {
    message: 'An unknown error occurred',
    code: 'UNKNOWN_ERROR',
  };
}

// Log error with context
export function logError(error: unknown, context: Record<string, unknown> = {}) {
  const timestamp = new Date().toISOString();
  const errorInfo = error instanceof Error ? {
    name: error.name,
    message: error.message,
    stack: error.stack,
  } : { error };

  console.error(JSON.stringify({
    timestamp,
    level: 'ERROR',
    ...errorInfo,
    context,
  }));
}

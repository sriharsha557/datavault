// Logging utilities for Data Vault Knowledge Assistant

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

class Logger {
  private isDevelopment = process.env.NODE_ENV === 'development';

  private log(level: LogLevel, message: string, context?: Record<string, unknown>, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
    };

    if (error) {
      entry.error = {
        name: error.name,
        message: error.message,
        stack: this.isDevelopment ? error.stack : undefined,
      };
    }

    if (this.isDevelopment) {
      // Pretty print in development
      const prefix = `[${entry.timestamp}] ${level}:`;
      console.log(prefix, message, context || '', error || '');
    } else {
      // JSON format for production
      console.log(JSON.stringify(entry));
    }
  }

  debug(message: string, context?: Record<string, unknown>) {
    if (this.isDevelopment) {
      this.log('DEBUG', message, context);
    }
  }

  info(message: string, context?: Record<string, unknown>) {
    this.log('INFO', message, context);
  }

  warn(message: string, context?: Record<string, unknown>) {
    this.log('WARN', message, context);
  }

  error(message: string, error?: Error, context?: Record<string, unknown>) {
    this.log('ERROR', message, context, error);
  }
}

export const logger = new Logger();

// Environment variable validation
// Run this at app startup to catch configuration issues early

export interface EnvConfig {
  // Supabase
  SUPABASE_URL: string;
  SUPABASE_SERVICE_KEY: string;
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  
  // AI Services
  GROQ_API_KEY: string;
  HF_TOKEN: string;
  
  // Admin
  ADMIN_PANEL_PASSWORD: string;
  
  // Optional
  NODE_ENV: string;
  USE_LOCAL_EMBEDDINGS?: string;
}

class EnvironmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvironmentError';
  }
}

/**
 * Validates that all required environment variables are present
 * Call this at app startup to fail fast if configuration is missing
 */
export function validateEnv(): EnvConfig {
  const missing: string[] = [];
  
  // Required server-side variables
  const required = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_KEY',
    'GROQ_API_KEY',
    'HF_TOKEN',
    'ADMIN_PANEL_PASSWORD',
  ];
  
  for (const key of required) {
    if (!process.env[key]) {
      missing.push(key);
    }
  }
  
  if (missing.length > 0) {
    throw new EnvironmentError(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      `Please check your .env.local file and ensure all required variables are set.`
    );
  }
  
  // Validate format of critical variables
  const supabaseUrl = process.env.SUPABASE_URL!;
  if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
    throw new EnvironmentError(
      `Invalid SUPABASE_URL format: ${supabaseUrl}\n` +
      `Expected format: https://your-project.supabase.co`
    );
  }
  
  const hfToken = process.env.HF_TOKEN!;
  if (!hfToken.startsWith('hf_')) {
    throw new EnvironmentError(
      `Invalid HF_TOKEN format. HuggingFace tokens should start with 'hf_'`
    );
  }
  
  return {
    SUPABASE_URL: process.env.SUPABASE_URL!,
    SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY!,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    GROQ_API_KEY: process.env.GROQ_API_KEY!,
    HF_TOKEN: process.env.HF_TOKEN!,
    ADMIN_PANEL_PASSWORD: process.env.ADMIN_PANEL_PASSWORD!,
    NODE_ENV: process.env.NODE_ENV || 'development',
    USE_LOCAL_EMBEDDINGS: process.env.USE_LOCAL_EMBEDDINGS,
  };
}

/**
 * Get validated environment config
 * Caches the result after first validation
 */
let cachedConfig: EnvConfig | null = null;

export function getEnv(): EnvConfig {
  if (!cachedConfig) {
    cachedConfig = validateEnv();
  }
  return cachedConfig;
}

// Validate on module load in development
if (process.env.NODE_ENV === 'development') {
  try {
    validateEnv();
    console.log('✅ Environment variables validated successfully');
  } catch (error) {
    if (error instanceof EnvironmentError) {
      console.error('❌ Environment validation failed:');
      console.error(error.message);
      console.error('\nPlease fix your .env.local file before starting the application.');
    }
  }
}

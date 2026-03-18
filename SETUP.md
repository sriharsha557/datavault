# Setup Guide - Data Vault Knowledge Assistant

This guide walks you through setting up the Data Vault Knowledge Assistant from scratch.

## Prerequisites

Before you begin, ensure you have:

- Node.js 18 or higher installed
- npm or yarn package manager
- A Supabase account (free tier works)
- A HuggingFace account (free tier works)
- A Groq account (free tier works)

## Step 1: Install Dependencies

```bash
npm install
```

This installs all required packages including:
- Next.js 14 with React and TypeScript
- Supabase client
- Testing frameworks (Jest, fast-check)
- UI libraries (Tailwind CSS, Lucide icons)
- Document processing libraries (pdf-parse, mammoth)

## Step 2: Set Up Supabase

### 2.1 Create a Supabase Project

1. Go to https://app.supabase.com
2. Click "New Project"
3. Choose a name and password
4. Wait for the project to be created (~2 minutes)

### 2.2 Run Database Migration

1. In your Supabase dashboard, go to the SQL Editor
2. Open the `schema.sql` file from this project
3. Copy the entire contents
4. Paste into the SQL Editor and click "Run"

This creates:
- `documents` table for file metadata
- `chunks` table for text chunks with vector embeddings
- `feedback` table for user ratings
- IVFFlat index for fast similarity search
- `match_chunks()` function for vector search

### 2.3 Get API Keys

1. Go to Project Settings → API
2. Copy the following values:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - `anon` public key
   - `service_role` key (keep this secret!)

## Step 3: Get AI Service API Keys

### 3.1 HuggingFace Token

1. Go to https://huggingface.co/settings/tokens
2. Create a new token with "Read" access
3. Copy the token (starts with `hf_`)

### 3.2 Groq API Key

1. Go to https://console.groq.com/keys
2. Create a new API key
3. Copy the key

## Step 4: Configure Environment Variables

1. Copy the example environment file:

```bash
cp .env.local.example .env.local
```

2. Edit `.env.local` and fill in all values:

```env
# Groq API key for LLM
GROQ_API_KEY=gsk_your_groq_api_key_here

# Supabase configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here

# Supabase public keys (for browser)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# HuggingFace API token
HF_TOKEN=hf_your_token_here
```

**Important**: Never commit `.env.local` to version control!

## Step 5: Verify Setup

### 5.1 Run Tests

```bash
npm test
```

All tests should pass. This verifies:
- TypeScript configuration is correct
- Dependencies are installed properly
- Core utilities work as expected

### 5.2 Start Development Server

```bash
npm run dev
```

Open http://localhost:3000 in your browser. You should see:
- The Quick Query interface
- A sidebar for document management
- A chat interface (disabled until documents are uploaded)

## Step 6: Upload Your First Document

1. Prepare a test document (PDF, DOCX, TXT, or MD)
2. Drag and drop it into the sidebar upload area
3. Select the document type (or let it auto-detect)
4. Click "Upload"
5. Wait for processing (10-30 seconds depending on file size)
6. Once status shows "ready", you can start querying!

## Step 7: Test Querying

Try these example queries:
- "What is a Hub in Data Vault 2.0?"
- "Explain the difference between a Link and a Satellite"
- "What are the loading patterns for Satellites?"

The system will:
1. Generate an embedding for your query
2. Search for similar document chunks
3. Stream a response from the LLM
4. Show source citations

## Troubleshooting

### "Missing environment variable" error

- Check that all variables in `.env.local` are filled in
- Restart the dev server after changing environment variables

### Document upload fails

- Check file size (must be under 10MB)
- Verify file format is supported (PDF, DOCX, TXT, MD)
- Check Supabase connection in the browser console

### Query returns no results

- Ensure documents are in "ready" status
- Check that the pgvector extension is enabled in Supabase
- Verify the `match_chunks()` function was created

### Slow embedding generation

- HuggingFace free tier has rate limits
- First request may take 20+ seconds (cold start)
- Subsequent requests are faster

### Tests fail

- Run `npm install` again to ensure all dependencies are installed
- Check that Node.js version is 18 or higher
- Clear Jest cache: `npx jest --clearCache`

## Next Steps

- Upload your Data Vault documentation
- Customize the UI in `app/components/`
- Add more test cases in `__tests__/`
- Deploy to Vercel (see README.md)

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Review the design document in `.kiro/specs/data-vault-knowledge-assistant/design.md`
3. Check API logs in Supabase dashboard
4. Review Vercel function logs (if deployed)

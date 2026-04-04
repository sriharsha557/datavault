# Data Vault Model Generator Integration Plan

## Project Overview

**Source**: Python Flask app (DVA folder)
**Target**: Next.js 14 app (current DV Assistant)
**Goal**: Add as `/modeler` route alongside existing `/admin` route

## Current DVA Features

1. **OCR Upload**: Extract text from ERD images/PDFs via OCR.space API
2. **AI Model Generation**: Convert schema to Data Vault 2.1 using GROQ API
3. **Knowledge-Grounded Mode**: Use uploaded DV methodology docs
4. **Visualization**: Interactive Cytoscape.js graph (Hubs, Links, Satellites)
5. **Export**: Draw.io XML, CSV, JSON formats
6. **Storage**: DuckDB database (ocr_results, dv_models, knowledge_docs)

## Integration Strategy: Option 1 (Recommended)

### Rewrite as Next.js with Shared Infrastructure

**Advantages**:
- ✅ Unified user experience and navigation
- ✅ Shared Supabase database (no DuckDB needed)
- ✅ Consistent styling with existing app
- ✅ Single deployment (Vercel)
- ✅ Shared authentication and session management

**Migration Steps**:

---

## Phase 1: Database Migration (Supabase)

### 1.1 Create New Tables in Supabase

```sql
-- OCR results table
CREATE TABLE ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Data Vault models table
CREATE TABLE dv_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_id UUID REFERENCES ocr_results(id) ON DELETE CASCADE,
  model_json JSONB NOT NULL,
  grounded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge documents table (for DV methodology)
CREATE TABLE knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_dv_models_ocr_id ON dv_models(ocr_id);
CREATE INDEX idx_dv_models_created_at ON dv_models(created_at DESC);
CREATE INDEX idx_knowledge_docs_uploaded_at ON knowledge_docs(uploaded_at DESC);
```

### 1.2 Add RLS Policies (Optional - for multi-user)

```sql
-- Enable RLS
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dv_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write (adjust as needed)
CREATE POLICY "Allow all for authenticated users" ON ocr_results
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON dv_models
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON knowledge_docs
  FOR ALL USING (auth.role() = 'authenticated');
```

---

## Phase 2: Backend API Routes (Next.js)

### 2.1 Create API Routes

**File Structure**:
```
app/api/modeler/
├── upload/route.ts          # OCR upload endpoint
├── generate/route.ts        # Model generation endpoint
├── models/route.ts          # List all models
├── models/[id]/route.ts     # Get specific model
└── knowledge/route.ts       # Upload knowledge docs
```

### 2.2 Install Dependencies

```bash
npm install @supabase/supabase-js
# OCR.space API - use fetch (built-in)
# GROQ API - use fetch (built-in)
```

### 2.3 Environment Variables

Add to `.env.local`:
```
OCR_SPACE_KEY=your_ocr_space_api_key
GROQ_API_KEY=your_groq_api_key
```

---

## Phase 3: Frontend Components (React)

### 3.1 Create Page Route

```
app/modeler/page.tsx         # Main modeler page
```

### 3.2 Create Components

```
app/components/modeler/
├── UploadSection.tsx        # File upload UI
├── ModelVisualization.tsx   # Cytoscape.js graph
├── ExportButtons.tsx        # Export to Draw.io/CSV/JSON
├── KnowledgeUpload.tsx      # Upload DV methodology
└── ModelHistory.tsx         # List of generated models
```

### 3.3 Install Frontend Dependencies

```bash
npm install cytoscape cytoscape-dom-node
npm install @types/cytoscape --save-dev
```

---

## Phase 4: Navigation Integration

### 4.1 Add Navigation Link

Update `app/components/ChatWindow.tsx` or create a shared navigation component:

```tsx
<nav>
  <Link href="/">Chat</Link>
  <Link href="/admin">Admin</Link>
  <Link href="/modeler">Modeler</Link>  {/* NEW */}
</nav>
```

### 4.2 Update Layout

Ensure `app/layout.tsx` includes navigation for all pages.

---

## Phase 5: Styling Consistency

### 5.1 Reuse Existing Tailwind Classes

- Use `dv-*` color variables from `app/globals.css`
- Match button styles from existing components
- Use same card/border styles

### 5.2 Cytoscape.js Styling

```tsx
const cytoscapeStyle = [
  {
    selector: 'node[type="hub"]',
    style: { 'background-color': '#3b82f6' } // Blue
  },
  {
    selector: 'node[type="link"]',
    style: { 'background-color': '#10b981' } // Green
  },
  {
    selector: 'node[type="satellite"]',
    style: { 'background-color': '#f59e0b' } // Orange
  }
];
```

---

## Phase 6: Testing & Deployment

### 6.1 Local Testing

1. Run database migrations in Supabase
2. Add API keys to `.env.local`
3. Test upload → OCR → generation → visualization → export flow
4. Test knowledge-grounded mode

### 6.2 Deployment

1. Add environment variables to Vercel
2. Push to GitHub
3. Vercel auto-deploys

---

## Implementation Checklist

### Database
- [ ] Create `ocr_results` table in Supabase
- [ ] Create `dv_models` table in Supabase
- [ ] Create `knowledge_docs` table in Supabase
- [ ] Add indexes
- [ ] Configure RLS policies (optional)

### Backend API Routes
- [ ] `/api/modeler/upload` - OCR upload
- [ ] `/api/modeler/generate` - Model generation
- [ ] `/api/modeler/models` - List models
- [ ] `/api/modeler/models/[id]` - Get model
- [ ] `/api/modeler/knowledge` - Upload knowledge

### Frontend Components
- [ ] `app/modeler/page.tsx` - Main page
- [ ] `UploadSection.tsx` - File upload
- [ ] `ModelVisualization.tsx` - Cytoscape graph
- [ ] `ExportButtons.tsx` - Export functionality
- [ ] `KnowledgeUpload.tsx` - Knowledge upload
- [ ] `ModelHistory.tsx` - Model list

### Navigation & Styling
- [ ] Add `/modeler` link to navigation
- [ ] Apply consistent Tailwind styling
- [ ] Configure Cytoscape.js colors

### Testing
- [ ] Test OCR upload
- [ ] Test model generation
- [ ] Test visualization
- [ ] Test export (Draw.io, CSV, JSON)
- [ ] Test knowledge-grounded mode

### Deployment
- [ ] Add `OCR_SPACE_KEY` to Vercel
- [ ] Add `GROQ_API_KEY` to Vercel
- [ ] Deploy to production

---

## Alternative: Quick Integration (Option 2)

If you want to integrate quickly without rewriting:

### Run Flask App on Different Port

1. Keep Flask app in `DVA/` folder
2. Run on port 5000: `python DVA/app.py`
3. Create Next.js wrapper page at `/modeler`
4. Embed Flask app in iframe:

```tsx
// app/modeler/page.tsx
export default function ModelerPage() {
  return (
    <div className="h-screen">
      <iframe 
        src="http://localhost:5000" 
        className="w-full h-full border-0"
      />
    </div>
  );
}
```

**Limitations**:
- Separate styling
- No shared navigation
- Requires running two servers
- CORS issues possible

---

## Recommendation

**Use Option 1 (Full Rewrite)** for:
- Professional, unified experience
- Single deployment
- Shared database and authentication
- Consistent styling

**Estimated Time**: 2-3 days for full migration

**Use Option 2 (iframe)** for:
- Quick demo/prototype
- Temporary solution
- Testing before full migration

**Estimated Time**: 1-2 hours

---

## Next Steps

1. **Decide on integration approach** (Option 1 or 2)
2. **If Option 1**: Start with database migration (Phase 1)
3. **If Option 2**: Create iframe wrapper page
4. **Test locally** before deploying

Would you like me to start implementing Option 1 (full rewrite) or Option 2 (quick iframe integration)?

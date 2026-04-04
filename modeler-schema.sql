-- Data Vault Model Generator Schema
-- Tables for OCR results, DV models, and knowledge documents

-- OCR results table
CREATE TABLE IF NOT EXISTS ocr_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  filename TEXT NOT NULL,
  extracted_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Data Vault models table
CREATE TABLE IF NOT EXISTS dv_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_id UUID REFERENCES ocr_results(id) ON DELETE CASCADE,
  model_json JSONB NOT NULL,
  grounded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Knowledge documents table (for DV methodology)
CREATE TABLE IF NOT EXISTS knowledge_docs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  content TEXT NOT NULL,
  uploaded_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_dv_models_ocr_id ON dv_models(ocr_id);
CREATE INDEX IF NOT EXISTS idx_dv_models_created_at ON dv_models(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_docs_uploaded_at ON knowledge_docs(uploaded_at DESC);

-- Enable RLS (Row Level Security)
ALTER TABLE ocr_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE dv_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_docs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Allow all authenticated users to read/write
-- Adjust these policies based on your security requirements

CREATE POLICY "Allow all for authenticated users" ON ocr_results
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON dv_models
  FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON knowledge_docs
  FOR ALL USING (auth.role() = 'authenticated');

-- Grant permissions to service role
GRANT ALL ON ocr_results TO service_role;
GRANT ALL ON dv_models TO service_role;
GRANT ALL ON knowledge_docs TO service_role;

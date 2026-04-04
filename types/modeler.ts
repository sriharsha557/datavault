// Data Vault Model Generator Types

export interface OCRResult {
  id: string;
  filename: string;
  extracted_text: string;
  created_at: string;
}

export interface DVModel {
  id: string;
  ocr_id: string;
  model_json: DVModelStructure;
  grounded: boolean;
  created_at: string;
}

export interface DVModelStructure {
  nodes: DVNode[];
  edges: DVEdge[];
}

export interface DVNode {
  id: string;
  type: 'hub' | 'link' | 'satellite';
  businessKey?: string;
  sourceTable?: string;
  attributes?: string[];
  parent?: string;
  connects?: string[];
  sourceRelationship?: string;
}

export interface DVEdge {
  from: string;
  to: string;
}

export interface KnowledgeDoc {
  id: string;
  name: string;
  content: string;
  uploaded_at: string;
}

export interface ModelListItem {
  id: string;
  ocr_id: string;
  filename: string;
  grounded: boolean;
  created_at: string;
}

// API Request/Response types
export interface UploadOCRRequest {
  file: File;
}

export interface UploadOCRResponse {
  success: boolean;
  ocr_id: string;
  extracted_text: string;
  error?: string;
}

export interface GenerateModelRequest {
  ocr_id: string;
  grounded: boolean;
}

export interface GenerateModelResponse {
  success: boolean;
  model: DVModelStructure;
  error?: string;
}

export interface UploadKnowledgeRequest {
  file: File;
}

export interface UploadKnowledgeResponse {
  success: boolean;
  message: string;
  error?: string;
}

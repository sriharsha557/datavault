import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';
import type { DVModelStructure } from '@/types/modeler';

export const maxDuration = 60;

// GROQ API endpoint
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

async function generateDVModel(
  ocrText: string,
  grounded: boolean,
  knowledgeContent: string
): Promise<DVModelStructure> {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new Error('GROQ_API_KEY not configured');
  }

  // Build system prompt
  let systemPrompt = 'You are an expert Data Vault 2.1 modeler. Follow standard Data Vault 2.1 best practices.';
  
  if (grounded && knowledgeContent) {
    systemPrompt = `You are an expert Data Vault 2.1 modeler.
Using the following DV2.1 methodology guidelines:
<<<
${knowledgeContent.slice(0, 3000)}
>>>

Follow these guidelines strictly when creating the model.`;
  }

  const userPrompt = `Convert the following source database schema into a Data Vault 2.1 model.

Source Schema (extracted from ERD):
<<<
${ocrText}
>>>

Instructions:
1. Identify all tables and their columns
2. Create Hubs for business entities (tables with natural business keys)
3. Create Links for relationships between Hubs
4. Create Satellites for descriptive attributes
5. Follow Data Vault 2.1 naming: Hub_EntityName, Link_Entity1_Entity2, Sat_EntityName_Context
6. Add proper hash keys and load timestamps

Return ONLY valid JSON (no markdown formatting) in this exact structure:
{
  "nodes": [
    {"id": "Hub_Customer", "type": "hub", "businessKey": "customer_id", "sourceTable": "customer", "attributes": ["customer_id"]},
    {"id": "Sat_Customer_Details", "type": "satellite", "parent": "Hub_Customer", "attributes": ["first_name", "last_name", "email"], "sourceTable": "customer"},
    {"id": "Link_Customer_Order", "type": "link", "connects": ["Hub_Customer", "Hub_Order"], "sourceRelationship": "fk_customer_order"}
  ],
  "edges": [
    {"from": "Hub_Customer", "to": "Sat_Customer_Details"},
    {"from": "Hub_Customer", "to": "Link_Customer_Order"},
    {"from": "Hub_Order", "to": "Link_Customer_Order"}
  ]
}`;

  const response = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'GROQ API error');
  }

  const result = await response.json();
  let content = result.choices[0].message.content.trim();

  // Clean markdown formatting if present
  content = content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

  // Parse and validate JSON
  const model: DVModelStructure = JSON.parse(content);

  if (!model.nodes || !Array.isArray(model.nodes)) {
    throw new Error('Invalid model structure: missing nodes array');
  }

  if (!model.edges || !Array.isArray(model.edges)) {
    throw new Error('Invalid model structure: missing edges array');
  }

  return model;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ocr_id, grounded = false } = body;

    if (!ocr_id) {
      return NextResponse.json(
        { error: 'OCR ID required' },
        { status: 400 }
      );
    }

    const supabase = createServerClient();

    // Get OCR text
    const { data: ocrData, error: ocrError } = await supabase
      .from('ocr_results')
      .select('extracted_text')
      .eq('id', ocr_id)
      .single();

    if (ocrError || !ocrData) {
      return NextResponse.json(
        { error: 'OCR result not found' },
        { status: 404 }
      );
    }

    // Get knowledge doc if grounded mode
    let knowledgeContent = '';
    if (grounded) {
      const { data: knowledgeData } = await supabase
        .from('knowledge_docs')
        .select('content')
        .order('uploaded_at', { ascending: false })
        .limit(1)
        .single();

      if (knowledgeData) {
        knowledgeContent = knowledgeData.content;
      }
    }

    // Generate model
    const model = await generateDVModel(
      ocrData.extracted_text,
      grounded,
      knowledgeContent
    );

    // Store model
    const { data: modelData, error: modelError } = await supabase
      .from('dv_models')
      .insert({
        ocr_id,
        model_json: model,
        grounded,
      })
      .select()
      .single();

    if (modelError) {
      console.error('[modeler/generate] Database error:', modelError);
      return NextResponse.json(
        { error: 'Failed to store model' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      model,
      model_id: modelData.id,
    });

  } catch (error: any) {
    console.error('[modeler/generate] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Model generation failed' },
      { status: 500 }
    );
  }
}

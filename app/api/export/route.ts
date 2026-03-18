import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';
import type { ExportRequest } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body: ExportRequest = await req.json();
    const { messages, options } = body;

    if (!messages || messages.length === 0) {
      return NextResponse.json({ success: false, error: 'Messages array is empty' }, { status: 400 });
    }

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    // Title
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Conversation Export', margin, y);
    y += 8;

    if (options.includeMetadata) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(`Date: ${new Date().toLocaleString()}  |  Messages: ${messages.length}`, margin, y);
      y += 10;
    }

    doc.setDrawColor(180, 180, 180);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    for (const msg of messages) {
      // Check if we need a new page
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(roleLabel, margin, y);
      y += 5;

      if (options.includeTimestamps && msg.timestamp) {
        const ts = msg.timestamp instanceof Date ? msg.timestamp : new Date(msg.timestamp);
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.text(ts.toLocaleTimeString(), margin, y);
        y += 5;
      }

      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      const contentLines = doc.splitTextToSize(msg.content, maxWidth);
      for (const line of contentLines) {
        if (y > 275) { doc.addPage(); y = 20; }
        doc.text(line, margin, y);
        y += 5;
      }

      if (options.includeSources && msg.sources && msg.sources.length > 0) {
        y += 2;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        for (const src of msg.sources) {
          if (y > 275) { doc.addPage(); y = 20; }
          const srcText = `Source: ${src.filename} (${Math.round(src.similarity * 100)}% match)`;
          doc.text(srcText, margin + 4, y);
          y += 4;
        }
      }

      y += 6;
      doc.setDrawColor(220, 220, 220);
      doc.line(margin, y, pageWidth - margin, y);
      y += 6;
    }

    const pdfOutput = doc.output('arraybuffer');
    const base64 = Buffer.from(pdfOutput).toString('base64');

    return NextResponse.json({
      success: true,
      data: base64,
      filename: 'conversation-export.pdf',
    });
  } catch (err) {
    console.error('PDF generation error:', err);
    return NextResponse.json({ success: false, error: 'PDF generation failed' }, { status: 500 });
  }
}

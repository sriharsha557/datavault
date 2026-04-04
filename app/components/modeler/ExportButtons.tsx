'use client';
import type { DVModelStructure } from '@/types/modeler';

interface ExportButtonsProps {
  model: DVModelStructure;
}

export default function ExportButtons({ model }: ExportButtonsProps) {
  const exportJSON = () => {
    const dataStr = JSON.stringify(model, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dv-model-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    // Convert nodes to CSV
    const headers = ['ID', 'Type', 'Business Key', 'Source Table', 'Attributes', 'Parent', 'Connects'];
    const rows = model.nodes.map((node) => [
      node.id,
      node.type,
      node.businessKey || '',
      node.sourceTable || '',
      node.attributes?.join('; ') || '',
      node.parent || '',
      node.connects?.join('; ') || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const dataBlob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dv-model-${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const exportDrawIO = () => {
    // Generate Draw.io XML format
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net" modified="${new Date().toISOString()}" agent="DataVault Assistant" version="21.0.0">
  <diagram name="Data Vault Model" id="dv-model">
    <mxGraphModel dx="1422" dy="794" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="827" pageHeight="1169" math="0" shadow="0">
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
`;

    // Add nodes
    model.nodes.forEach((node, idx) => {
      const x = 100 + (idx % 4) * 200;
      const y = 100 + Math.floor(idx / 4) * 150;
      const width = 120;
      const height = 60;
      
      let style = 'rounded=1;whiteSpace=wrap;html=1;';
      let fillColor = '';
      
      if (node.type === 'hub') {
        style += 'shape=ellipse;';
        fillColor = '#3b82f6';
      } else if (node.type === 'link') {
        style += 'shape=rhombus;';
        fillColor = '#10b981';
      } else if (node.type === 'satellite') {
        fillColor = '#f59e0b';
      }
      
      style += `fillColor=${fillColor};strokeColor=#000000;fontColor=#ffffff;`;

      xml += `        <mxCell id="node-${idx}" value="${node.id}" style="${style}" vertex="1" parent="1">
          <mxGeometry x="${x}" y="${y}" width="${width}" height="${height}" as="geometry" />
        </mxCell>
`;
    });

    // Add edges
    model.edges.forEach((edge, idx) => {
      const sourceIdx = model.nodes.findIndex((n) => n.id === edge.from);
      const targetIdx = model.nodes.findIndex((n) => n.id === edge.to);
      
      xml += `        <mxCell id="edge-${idx}" value="" style="endArrow=classic;html=1;rounded=0;" edge="1" parent="1" source="node-${sourceIdx}" target="node-${targetIdx}">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
`;
    });

    xml += `      </root>
    </mxGraphModel>
  </diagram>
</mxfile>`;

    const dataBlob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `dv-model-${Date.now()}.drawio`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={exportJSON}
        className="text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
        title="Export as JSON"
      >
        JSON
      </button>
      <button
        onClick={exportCSV}
        className="text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
        title="Export as CSV"
      >
        CSV
      </button>
      <button
        onClick={exportDrawIO}
        className="text-xs px-3 py-1.5 border border-dv-border rounded-lg text-dv-muted hover:border-dv-accent hover:text-dv-accent transition-colors"
        title="Export as Draw.io XML"
      >
        Draw.io
      </button>
    </div>
  );
}

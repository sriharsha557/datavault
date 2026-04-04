'use client';
import { useEffect, useRef } from 'react';
import cytoscape from 'cytoscape';
import type { DVModelStructure } from '@/types/modeler';

interface ModelVisualizationProps {
  model: DVModelStructure;
}

export default function ModelVisualization({ model }: ModelVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<cytoscape.Core | null>(null);

  useEffect(() => {
    if (!containerRef.current || !model) return;

    // Transform model data to Cytoscape format
    const elements = [
      // Nodes
      ...model.nodes.map((node) => ({
        data: {
          id: node.id,
          label: node.id,
          type: node.type,
          businessKey: node.businessKey,
          attributes: node.attributes?.join(', '),
        },
      })),
      // Edges
      ...model.edges.map((edge, idx) => ({
        data: {
          id: `edge-${idx}`,
          source: edge.from,
          target: edge.to,
        },
      })),
    ];

    // Initialize Cytoscape
    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        {
          selector: 'node',
          style: {
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'font-size': '10px',
            'font-weight': 'bold',
            'color': '#fff',
            'text-outline-width': 2,
            'text-outline-color': '#000',
            'width': 60,
            'height': 60,
          },
        },
        {
          selector: 'node[type="hub"]',
          style: {
            'background-color': '#3b82f6', // Blue
            'shape': 'ellipse',
          },
        },
        {
          selector: 'node[type="link"]',
          style: {
            'background-color': '#10b981', // Green
            'shape': 'diamond',
          },
        },
        {
          selector: 'node[type="satellite"]',
          style: {
            'background-color': '#f59e0b', // Orange
            'shape': 'rectangle',
          },
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#94a3b8',
            'target-arrow-color': '#94a3b8',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
          },
        },
      ],
      layout: {
        name: 'cose',
        animate: true,
        animationDuration: 500,
        nodeRepulsion: 8000,
        idealEdgeLength: 100,
        edgeElasticity: 100,
        nestingFactor: 1.2,
        gravity: 1,
        numIter: 1000,
        initialTemp: 200,
        coolingFactor: 0.95,
        minTemp: 1.0,
      },
      minZoom: 0.5,
      maxZoom: 2,
      wheelSensitivity: 0.2,
    });

    // Add tooltip on hover
    cy.on('tap', 'node', (evt) => {
      const node = evt.target;
      const data = node.data();
      
      alert(`${data.label}\n\nType: ${data.type}\nBusiness Key: ${data.businessKey || 'N/A'}\nAttributes: ${data.attributes || 'N/A'}`);
    });

    cyRef.current = cy;

    // Cleanup
    return () => {
      cy.destroy();
    };
  }, [model]);

  return (
    <div
      ref={containerRef}
      className="w-full h-[600px] bg-white rounded-lg border border-dv-border"
    />
  );
}

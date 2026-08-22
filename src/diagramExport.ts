import type { FlowGraph, FlowNode } from './types';
import { taskColors } from './taskMeta';

export interface DiagramExportOptions {
  title?: string;
  backgroundColor?: string;
  scale?: number;
}

const TASK_HEX_COLORS: Record<string, { bg: string; border: string; text: string; accent: string }> = {
  blue: { bg: '#ffffff', border: '#7097df', text: '#303c4e', accent: '#376FE1' },
  violet: { bg: '#ffffff', border: '#987bd8', text: '#303c4e', accent: '#8061cb' },
  amber: { bg: '#ffffff', border: '#e8b261', text: '#303c4e', accent: '#E5A13A' },
  green: { bg: '#ffffff', border: '#5ab88b', text: '#303c4e', accent: '#31A47C' },
  cyan: { bg: '#ffffff', border: '#4fc3d0', text: '#303c4e', accent: '#2196F3' },
  rose: { bg: '#ffffff', border: '#e8738a', text: '#303c4e', accent: '#E91E63' },
  orange: { bg: '#ffffff', border: '#f0965a', text: '#303c4e', accent: '#FF9800' },
  teal: { bg: '#ffffff', border: '#4db6ac', text: '#303c4e', accent: '#009688' },
  red: { bg: '#ffffff', border: '#e27367', text: '#303c4e', accent: '#D47759' },
  slate: { bg: '#ffffff', border: '#8b98a9', text: '#303c4e', accent: '#607D8B' },
  indigo: { bg: '#ffffff', border: '#7986cb', text: '#303c4e', accent: '#3F51B5' },
  purple: { bg: '#ffffff', border: '#ba68c8', text: '#303c4e', accent: '#9C27B0' },
};

export function exportFlowToSvg(flow: FlowGraph, options: DiagramExportOptions = {}): string {
  const { title = 'Workflow Diagram', backgroundColor = '#F9FBFD' } = options;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  flow.nodes.forEach((node) => {
    const w = node.type === 'port' ? 83 : 208;
    const h = node.type === 'port' ? 42 : 62;
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + w);
    maxY = Math.max(maxY, node.position.y + h);
  });

  if (minX === Infinity) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 300;
  }

  const padding = 40;
  const viewBoxX = minX - padding;
  const viewBoxY = minY - padding;
  const viewBoxWidth = maxX - minX + padding * 2;
  const viewBoxHeight = maxY - minY + padding * 2;

  const nodeMap = new Map<string, FlowNode>(flow.nodes.map((n) => [n.id, n]));

  // Build edge path elements
  const edgeSvg = flow.edges
    .map((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (!source || !target) return '';

      const sw = source.type === 'port' ? 83 : 208;
      const sh = source.type === 'port' ? 42 : 62;
      const tw = target.type === 'port' ? 83 : 208;

      const sx = source.position.x + sw / 2;
      const sy = source.position.y + sh;
      const tx = target.position.x + tw / 2;
      const ty = target.position.y;

      const midY = (sy + ty) / 2;
      const pathData = `M ${sx} ${sy} C ${sx} ${midY}, ${tx} ${midY}, ${tx} ${ty}`;

      const labelSvg = edge.label
        ? `<rect x="${(sx + tx) / 2 - 24}" y="${midY - 9}" width="48" height="18" rx="4" fill="#FFFFFF" stroke="#DFE4EB" stroke-width="1"/>
           <text x="${(sx + tx) / 2}" y="${midY + 3}" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="9" fill="#7D8796">${edge.label}</text>`
        : '';

      return `<g class="edge">
        <path d="${pathData}" fill="none" stroke="#7097DF" stroke-width="2" marker-end="url(#arrowhead)"/>
        ${labelSvg}
      </g>`;
    })
    .join('\n');

  // Build node elements
  const nodeSvg = flow.nodes
    .map((node) => {
      const isPort = node.type === 'port';
      const x = node.position.x;
      const y = node.position.y;

      if (isPort) {
        const isStart = node.data?.portType === 'root-entry-node' || node.data?.label === 'Start';
        return `<g class="port-node" transform="translate(${x}, ${y})">
          <rect width="83" height="42" rx="21" fill="#FFFFFF" stroke="#C9D3E0" stroke-width="1.5"/>
          <circle cx="21" cy="21" r="10" fill="${isStart ? '#E4EDFF' : '#EEF1F5'}" stroke="${isStart ? '#376FE1' : '#97A5B8'}" stroke-width="1.5"/>
          <text x="48" y="25" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="11" font-weight="600" fill="#687383">${node.data?.label || (isStart ? 'Start' : 'End')}</text>
        </g>`;
      }

      const taskType = node.data?.taskType || 'set';
      const colorName = taskColors[taskType as keyof typeof taskColors] || 'blue';
      const color = TASK_HEX_COLORS[colorName] || TASK_HEX_COLORS.blue;
      const label = node.data?.label || node.id;

      return `<g class="task-node" transform="translate(${x}, ${y})">
        <rect width="208" height="62" rx="9" fill="${color.bg}" stroke="#DFE4EB" stroke-width="1" filter="url(#shadow)"/>
        <rect x="0" y="0" width="5" height="62" rx="2" fill="${color.accent}"/>
        <rect x="12" y="14" width="34" height="34" rx="7" fill="${color.accent}18"/>
        <text x="29" y="36" text-anchor="middle" font-family="DM Sans, system-ui, sans-serif" font-size="14" font-weight="700" fill="${color.accent}">${taskType.slice(0, 2).toUpperCase()}</text>
        <text x="56" y="30" font-family="DM Sans, system-ui, sans-serif" font-size="12" font-weight="700" fill="${color.text}">${label}</text>
        <text x="56" y="46" font-family="DM Sans, system-ui, sans-serif" font-size="10" fill="#9AA3AF">${taskType} task</text>
      </g>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}" width="${viewBoxWidth}" height="${viewBoxHeight}">
  <defs>
    <filter id="shadow" x="-5%" y="-10%" width="110%" height="130%">
      <feDropShadow dx="0" dy="4" stdDeviation="6" flood-color="#263b59" flood-opacity="0.08"/>
    </filter>
    <marker id="arrowhead" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
      <polygon points="0 0, 8 3, 0 6" fill="#7097DF"/>
    </marker>
  </defs>
  <rect x="${viewBoxX}" y="${viewBoxY}" width="${viewBoxWidth}" height="${viewBoxHeight}" fill="${backgroundColor}"/>
  <text x="${viewBoxX + 24}" y="${viewBoxY + 28}" font-family="DM Sans, system-ui, sans-serif" font-size="14" font-weight="700" fill="#182231">${title}</text>
  <g class="edges">
    ${edgeSvg}
  </g>
  <g class="nodes">
    ${nodeSvg}
  </g>
</svg>`;
}

export function downloadSvgDiagram(flow: FlowGraph, filename: string, options?: DiagramExportOptions): void {
  const svgContent = exportFlowToSvg(flow, options);
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${filename}.svg`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function downloadPngDiagram(
  flow: FlowGraph,
  filename: string,
  options?: DiagramExportOptions,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const svgContent = exportFlowToSvg(flow, options);
    const img = new Image();
    const svgBlob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    img.onload = () => {
      try {
        const scale = options?.scale || 2;
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Could not obtain canvas 2D rendering context');

        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);

        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error('Could not encode canvas as PNG blob'));
            return;
          }
          const pngUrl = URL.createObjectURL(blob);
          const anchor = document.createElement('a');
          anchor.href = pngUrl;
          anchor.download = `${filename}.png`;
          anchor.click();
          URL.revokeObjectURL(pngUrl);
          URL.revokeObjectURL(url);
          resolve();
        }, 'image/png');
      } catch (err) {
        URL.revokeObjectURL(url);
        reject(err);
      }
    };

    img.onerror = (err) => {
      URL.revokeObjectURL(url);
      reject(err);
    };

    img.src = url;
  });
}

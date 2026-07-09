/**
 * @fileoverview Download the blocks on a workspace as a PNG image. Ported from
 * Block-based-MNL/src/core/ui/screenshot.ts (workspaceToSvg/svgToPng/downloadScreenshot),
 * with the MnL-specific start-hat handling dropped since this renderer has no start hat.
 */

import * as Blockly from 'blockly';

/** Rasterize an SVG data URI to a PNG object URL (up to 10x pixel density). */
function svgToPng(data: string, width: number, height: number, callback: (uri: string) => void): void {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d')!;
  const img = new Image();

  // 10x gives crisp, paper-ready captures, but browsers cap canvases (Chrome/Safari:
  // ~268M px² area, 32767px per side — beyond either the canvas silently stops
  // encoding: toBlob yields null, toDataURL yields "data:,"). Reduction traces can grow
  // arbitrarily tall, so clamp the density to keep the canvas inside the limits instead
  // of downloading a broken file. The area cap sits well under the browser maximum
  // because PNG encoding runs on the UI thread — ~64M px already costs a couple of
  // seconds of freeze; the browser limit would cost close to a minute. The per-side cap
  // hugs its browser maximum.
  const MAX_AREA = 64e6;
  const MAX_DIM = 32000;
  const pixelDensity = Math.min(10, Math.sqrt(MAX_AREA / (width * height)), MAX_DIM / width, MAX_DIM / height);
  canvas.width = Math.floor(width * pixelDensity);
  canvas.height = Math.floor(height * pixelDensity);
  img.onload = () => {
    context.drawImage(img, 0, 0, width, height, 0, 0, canvas.width, canvas.height);
    // A Blob object URL, not toDataURL: multi-MB data: URIs make Chrome's download
    // navigation stall for over a minute.
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          console.warn('[BlockLambda] error converting the workspace svg to a png');
          callback('');
          return;
        }
        callback(URL.createObjectURL(blob));
      }, 'image/png');
    } catch {
      // toBlob throws (rather than yielding null) on a tainted canvas
      console.warn('[BlockLambda] error converting the workspace svg to a png');
      callback('');
    }
  };
  img.onerror = () => {
    console.warn('[BlockLambda] error loading the workspace svg image');
    callback('');
  };
  img.src = data;
}

/** Build an SVG of the blocks on a workspace, with the page's blockly styles inlined. */
function workspaceToSvg(workspace: Blockly.WorkspaceSvg, callback: (uri: string) => void): void {
  const textAreas = document.getElementsByTagName('textarea');
  for (let i = 0; i < textAreas.length; i++) textAreas[i].innerHTML = textAreas[i].value;

  const bBox = workspace.getBlocksBoundingBox() as any;
  const x0 = bBox.x ?? bBox.left;
  const y0 = bBox.y ?? bBox.top;
  const w0 = bBox.width ?? bBox.right - x0;
  const h0 = bBox.height ?? bBox.bottom - y0;

  // Pad the capture box by a uniform margin so output tabs, notches, and antialiasing
  // at the edges are not clipped.
  const MARGIN = 12;
  const x = x0 - MARGIN;
  const y = y0 - MARGIN;
  const width = w0 + MARGIN * 2;
  const height = h0 + MARGIN * 2;

  const clone = workspace.getCanvas().cloneNode(true) as SVGElement;
  clone.removeAttribute('transform');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.appendChild(clone);
  svg.setAttribute('viewBox', x + ' ' + y + ' ' + width + ' ' + height);
  svg.setAttribute(
    'class',
    'blocklySvg ' + ((workspace.options as any).renderer || 'geras') + '-renderer ' +
      (workspace.getTheme ? workspace.getTheme().name + '-theme' : '')
  );
  svg.setAttribute('width', String(width));
  svg.setAttribute('height', String(height));
  svg.style.backgroundColor = 'transparent';

  const css = ([] as HTMLElement[]).slice
    .call(document.head.querySelectorAll('style'))
    .filter((el: any) => /\.blocklySvg/.test(el.innerText) || el.id.startsWith('blockly-'))
    .map((el: any) => el.innerText)
    .join('\n');
  const style = document.createElement('style');
  style.innerHTML = css;
  svg.insertBefore(style, svg.firstChild);

  let svgAsXML = new XMLSerializer().serializeToString(svg);
  svgAsXML = svgAsXML.replace(/&nbsp/g, '&#160');
  svgToPng('data:image/svg+xml,' + encodeURIComponent(svgAsXML), width, height, callback);
}

/** Download a screenshot (PNG) of the blocks on a workspace. */
export function downloadScreenshot(workspace: Blockly.WorkspaceSvg, filename = 'lambda_screenshot.png'): void {
  if (!workspace || workspace.getTopBlocks(false).length === 0) return;
  workspaceToSvg(workspace, (url) => {
    if (!url) return;
    const a = document.createElement('a');
    a.download = filename;
    a.target = '_self';
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.parentNode!.removeChild(a);
    // Free the blob once the download has had time to grab it.
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  });
}

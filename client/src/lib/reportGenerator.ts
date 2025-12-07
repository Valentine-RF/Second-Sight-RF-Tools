/**
 * Report Generator
 * 
 * Generates professional PDF and HTML analysis reports from Forensic Cockpit data.
 */

import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

export interface ReportData {
  captureName: string;
  description?: string;
  sampleRate: number;
  centerFrequency?: number;
  datatype: string;
  hardware?: string;
  captureDate: string;
  fileSize: number;
  duration?: number;
  
  // Visualizations (canvas elements or data URLs)
  spectrogramImage?: string;
  famPlotImage?: string;
  
  // Metrics
  metrics?: {
    snr?: number;
    peakPower?: number;
    avgPower?: number;
    dynamicRange?: number;
    bandwidth?: number;
  };
  
  // Annotations
  annotations?: Array<{
    id: string;
    timestamp: number;
    frequency: number;
    label: string;
    notes?: string;
  }>;
  
  // Analysis notes
  analysisNotes?: string;
}

export class ReportGenerator {
  /**
   * Generate PDF report
   */
  static async generatePDF(data: ReportData): Promise<Blob> {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 20;
    let yPos = margin;

    // Cover Page
    pdf.setFontSize(24);
    pdf.setFont('helvetica', 'bold');
    pdf.text('RF Signal Analysis Report', pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 15;
    pdf.setFontSize(16);
    pdf.setFont('helvetica', 'normal');
    pdf.text(data.captureName, pageWidth / 2, yPos, { align: 'center' });
    
    yPos += 10;
    pdf.setFontSize(10);
    pdf.setTextColor(128, 128, 128);
    pdf.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' });
    pdf.setTextColor(0, 0, 0);
    
    // Metadata Section
    yPos = 60;
    pdf.setFontSize(14);
    pdf.setFont('helvetica', 'bold');
    pdf.text('Capture Metadata', margin, yPos);
    
    yPos += 10;
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'normal');
    
    const metadata = [
      ['Sample Rate', `${(data.sampleRate / 1e6).toFixed(2)} MSps`],
      ['Center Frequency', data.centerFrequency ? `${(data.centerFrequency / 1e6).toFixed(2)} MHz` : 'N/A'],
      ['Datatype', data.datatype],
      ['Hardware', data.hardware || 'Unknown'],
      ['Capture Date', data.captureDate],
      ['File Size', `${(data.fileSize / 1024 / 1024).toFixed(2)} MB`],
      ['Duration', data.duration ? `${data.duration.toFixed(2)} seconds` : 'N/A'],
    ];
    
    metadata.forEach(([key, value]) => {
      pdf.setFont('helvetica', 'bold');
      pdf.text(`${key}:`, margin, yPos);
      pdf.setFont('helvetica', 'normal');
      pdf.text(value, margin + 50, yPos);
      yPos += 7;
    });
    
    if (data.description) {
      yPos += 5;
      pdf.setFont('helvetica', 'bold');
      pdf.text('Description:', margin, yPos);
      yPos += 7;
      pdf.setFont('helvetica', 'normal');
      const descLines = pdf.splitTextToSize(data.description, pageWidth - 2 * margin);
      pdf.text(descLines, margin, yPos);
      yPos += descLines.length * 7;
    }
    
    // Signal Metrics
    if (data.metrics) {
      yPos += 10;
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Signal Metrics', margin, yPos);
      
      yPos += 10;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      
      const metrics = [
        ['SNR', data.metrics.snr !== undefined ? `${data.metrics.snr.toFixed(1)} dB` : 'N/A'],
        ['Peak Power', data.metrics.peakPower !== undefined ? `${data.metrics.peakPower.toFixed(1)} dB` : 'N/A'],
        ['Average Power', data.metrics.avgPower !== undefined ? `${data.metrics.avgPower.toFixed(1)} dB` : 'N/A'],
        ['Dynamic Range', data.metrics.dynamicRange !== undefined ? `${data.metrics.dynamicRange.toFixed(1)} dB` : 'N/A'],
        ['Bandwidth', data.metrics.bandwidth !== undefined ? `${(data.metrics.bandwidth / 1e6).toFixed(2)} MHz` : 'N/A'],
      ];
      
      metrics.forEach(([key, value]) => {
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${key}:`, margin, yPos);
        pdf.setFont('helvetica', 'normal');
        pdf.text(value, margin + 50, yPos);
        yPos += 7;
      });
    }
    
    // Spectrogram
    if (data.spectrogramImage) {
      pdf.addPage();
      yPos = margin;
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Spectrogram', margin, yPos);
      
      yPos += 10;
      const imgWidth = pageWidth - 2 * margin;
      const imgHeight = (imgWidth * 9) / 16; // 16:9 aspect ratio
      
      try {
        pdf.addImage(data.spectrogramImage, 'PNG', margin, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      } catch (error) {
        console.error('Failed to add spectrogram image:', error);
        pdf.setFont('helvetica', 'italic');
        pdf.text('Spectrogram image unavailable', margin, yPos);
        yPos += 10;
      }
    }
    
    // FAM Plot
    if (data.famPlotImage) {
      if (yPos > pageHeight - 100) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Cyclostationary Analysis (FAM)', margin, yPos);
      
      yPos += 10;
      const imgWidth = pageWidth - 2 * margin;
      const imgHeight = (imgWidth * 9) / 16;
      
      try {
        pdf.addImage(data.famPlotImage, 'PNG', margin, yPos, imgWidth, imgHeight);
        yPos += imgHeight + 10;
      } catch (error) {
        console.error('Failed to add FAM plot image:', error);
        pdf.setFont('helvetica', 'italic');
        pdf.text('FAM plot image unavailable', margin, yPos);
        yPos += 10;
      }
    }
    
    // Annotations
    if (data.annotations && data.annotations.length > 0) {
      pdf.addPage();
      yPos = margin;
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Annotations', margin, yPos);
      
      yPos += 10;
      pdf.setFontSize(10);
      
      data.annotations.forEach((annotation, index) => {
        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = margin;
        }
        
        pdf.setFont('helvetica', 'bold');
        pdf.text(`${index + 1}. ${annotation.label}`, margin, yPos);
        yPos += 7;
        
        pdf.setFont('helvetica', 'normal');
        pdf.text(`Time: ${annotation.timestamp.toFixed(3)} s`, margin + 5, yPos);
        yPos += 7;
        pdf.text(`Frequency: ${(annotation.frequency / 1e6).toFixed(2)} MHz`, margin + 5, yPos);
        yPos += 7;
        
        if (annotation.notes) {
          const noteLines = pdf.splitTextToSize(`Notes: ${annotation.notes}`, pageWidth - 2 * margin - 5);
          pdf.text(noteLines, margin + 5, yPos);
          yPos += noteLines.length * 7;
        }
        
        yPos += 5;
      });
    }
    
    // Analysis Notes
    if (data.analysisNotes) {
      if (yPos > pageHeight - 60) {
        pdf.addPage();
        yPos = margin;
      }
      
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Analysis Notes', margin, yPos);
      
      yPos += 10;
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      const notesLines = pdf.splitTextToSize(data.analysisNotes, pageWidth - 2 * margin);
      pdf.text(notesLines, margin, yPos);
    }
    
    // Footer on all pages
    const totalPages = pdf.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
      pdf.setPage(i);
      pdf.setFontSize(8);
      pdf.setTextColor(128, 128, 128);
      pdf.text(
        `Page ${i} of ${totalPages}`,
        pageWidth / 2,
        pageHeight - 10,
        { align: 'center' }
      );
      pdf.text(
        'Second Sight RF Analysis Platform',
        pageWidth - margin,
        pageHeight - 10,
        { align: 'right' }
      );
    }
    
    return pdf.output('blob');
  }

  /**
   * Generate HTML report
   */
  static generateHTML(data: ReportData): string {
    const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RF Signal Analysis Report - ${data.captureName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #e0e0e0;
      background: #0a0e1a;
      padding: 40px 20px;
    }
    .container { max-width: 1200px; margin: 0 auto; background: #111827; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .header { text-align: center; border-bottom: 2px solid #1e40af; padding-bottom: 30px; margin-bottom: 40px; }
    .header h1 { font-size: 32px; color: #60a5fa; margin-bottom: 10px; }
    .header h2 { font-size: 24px; color: #93c5fd; margin-bottom: 10px; }
    .header .meta { font-size: 14px; color: #9ca3af; }
    .section { margin-bottom: 40px; }
    .section-title { font-size: 20px; color: #60a5fa; border-bottom: 1px solid #374151; padding-bottom: 10px; margin-bottom: 20px; }
    .metadata-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 15px; }
    .metadata-item { background: #1f2937; padding: 15px; border-radius: 8px; border-left: 3px solid #3b82f6; }
    .metadata-label { font-size: 12px; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.5px; }
    .metadata-value { font-size: 16px; color: #e0e0e0; font-weight: 600; margin-top: 5px; }
    .description { background: #1f2937; padding: 20px; border-radius: 8px; color: #d1d5db; line-height: 1.8; }
    .metrics-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 15px; }
    .metric-card { background: #1f2937; padding: 20px; border-radius: 8px; text-align: center; }
    .metric-label { font-size: 12px; color: #9ca3af; text-transform: uppercase; }
    .metric-value { font-size: 24px; color: #60a5fa; font-weight: bold; margin-top: 5px; }
    .visualization { background: #1f2937; padding: 20px; border-radius: 8px; text-align: center; }
    .visualization img { max-width: 100%; height: auto; border-radius: 4px; }
    .visualization-title { font-size: 16px; color: #93c5fd; margin-bottom: 15px; }
    .annotation { background: #1f2937; padding: 15px; border-radius: 8px; margin-bottom: 15px; border-left: 3px solid #10b981; }
    .annotation-header { font-size: 16px; color: #e0e0e0; font-weight: 600; margin-bottom: 10px; }
    .annotation-detail { font-size: 14px; color: #9ca3af; margin-bottom: 5px; }
    .annotation-notes { font-size: 14px; color: #d1d5db; margin-top: 10px; font-style: italic; }
    .notes { background: #1f2937; padding: 20px; border-radius: 8px; color: #d1d5db; line-height: 1.8; white-space: pre-wrap; }
    .footer { text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #374151; color: #6b7280; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>RF Signal Analysis Report</h1>
      <h2>${data.captureName}</h2>
      <div class="meta">Generated: ${new Date().toLocaleString()}</div>
    </div>

    <div class="section">
      <div class="section-title">Capture Metadata</div>
      <div class="metadata-grid">
        <div class="metadata-item">
          <div class="metadata-label">Sample Rate</div>
          <div class="metadata-value">${(data.sampleRate / 1e6).toFixed(2)} MSps</div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Center Frequency</div>
          <div class="metadata-value">${data.centerFrequency ? `${(data.centerFrequency / 1e6).toFixed(2)} MHz` : 'N/A'}</div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Datatype</div>
          <div class="metadata-value">${data.datatype}</div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Hardware</div>
          <div class="metadata-value">${data.hardware || 'Unknown'}</div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">Capture Date</div>
          <div class="metadata-value">${data.captureDate}</div>
        </div>
        <div class="metadata-item">
          <div class="metadata-label">File Size</div>
          <div class="metadata-value">${(data.fileSize / 1024 / 1024).toFixed(2)} MB</div>
        </div>
        ${data.duration ? `
        <div class="metadata-item">
          <div class="metadata-label">Duration</div>
          <div class="metadata-value">${data.duration.toFixed(2)} seconds</div>
        </div>
        ` : ''}
      </div>
      ${data.description ? `
      <div style="margin-top: 20px;">
        <div class="metadata-label" style="margin-bottom: 10px;">Description</div>
        <div class="description">${data.description}</div>
      </div>
      ` : ''}
    </div>

    ${data.metrics ? `
    <div class="section">
      <div class="section-title">Signal Metrics</div>
      <div class="metrics-grid">
        ${data.metrics.snr !== undefined ? `
        <div class="metric-card">
          <div class="metric-label">SNR</div>
          <div class="metric-value">${data.metrics.snr.toFixed(1)} dB</div>
        </div>
        ` : ''}
        ${data.metrics.peakPower !== undefined ? `
        <div class="metric-card">
          <div class="metric-label">Peak Power</div>
          <div class="metric-value">${data.metrics.peakPower.toFixed(1)} dB</div>
        </div>
        ` : ''}
        ${data.metrics.avgPower !== undefined ? `
        <div class="metric-card">
          <div class="metric-label">Average Power</div>
          <div class="metric-value">${data.metrics.avgPower.toFixed(1)} dB</div>
        </div>
        ` : ''}
        ${data.metrics.dynamicRange !== undefined ? `
        <div class="metric-card">
          <div class="metric-label">Dynamic Range</div>
          <div class="metric-value">${data.metrics.dynamicRange.toFixed(1)} dB</div>
        </div>
        ` : ''}
        ${data.metrics.bandwidth !== undefined ? `
        <div class="metric-card">
          <div class="metric-label">Bandwidth</div>
          <div class="metric-value">${(data.metrics.bandwidth / 1e6).toFixed(2)} MHz</div>
        </div>
        ` : ''}
      </div>
    </div>
    ` : ''}

    ${data.spectrogramImage ? `
    <div class="section">
      <div class="section-title">Spectrogram</div>
      <div class="visualization">
        <img src="${data.spectrogramImage}" alt="Spectrogram" />
      </div>
    </div>
    ` : ''}

    ${data.famPlotImage ? `
    <div class="section">
      <div class="section-title">Cyclostationary Analysis (FAM)</div>
      <div class="visualization">
        <img src="${data.famPlotImage}" alt="FAM Plot" />
      </div>
    </div>
    ` : ''}

    ${data.annotations && data.annotations.length > 0 ? `
    <div class="section">
      <div class="section-title">Annotations (${data.annotations.length})</div>
      ${data.annotations.map((annotation, index) => `
        <div class="annotation">
          <div class="annotation-header">${index + 1}. ${annotation.label}</div>
          <div class="annotation-detail">Time: ${annotation.timestamp.toFixed(3)} s</div>
          <div class="annotation-detail">Frequency: ${(annotation.frequency / 1e6).toFixed(2)} MHz</div>
          ${annotation.notes ? `<div class="annotation-notes">Notes: ${annotation.notes}</div>` : ''}
        </div>
      `).join('')}
    </div>
    ` : ''}

    ${data.analysisNotes ? `
    <div class="section">
      <div class="section-title">Analysis Notes</div>
      <div class="notes">${data.analysisNotes}</div>
    </div>
    ` : ''}

    <div class="footer">
      <p>Second Sight RF Analysis Platform</p>
      <p>Professional RF Signal Analysis with GPU-Accelerated Processing</p>
    </div>
  </div>
</body>
</html>
    `;
    
    return html;
  }

  /**
   * Capture canvas element as data URL
   */
  static async captureCanvas(canvas: HTMLCanvasElement): Promise<string> {
    return canvas.toDataURL('image/png');
  }

  /**
   * Capture DOM element as data URL using html2canvas
   */
  static async captureElement(element: HTMLElement): Promise<string> {
    const canvas = await html2canvas(element, {
      backgroundColor: '#0a0e1a',
      scale: 2,
    });
    return canvas.toDataURL('image/png');
  }

  /**
   * Download blob as file
   */
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Download HTML string as file
   */
  static downloadHTML(html: string, filename: string): void {
    const blob = new Blob([html], { type: 'text/html' });
    this.downloadBlob(blob, filename);
  }
}

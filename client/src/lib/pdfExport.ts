/**
 * Comprehensive PDF Export Utility for Forensic Signal Analysis
 * 
 * Generates professional reports with embedded visualizations, metadata,
 * measurements, and analysis findings for forensic documentation.
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Signal capture metadata
 */
export interface CaptureMetadata {
  name: string;
  hardware?: string;
  author?: string;
  sampleRate?: number;
  datatype?: string;
  centerFrequency?: number;
  description?: string;
  uploadedAt: Date;
}

/**
 * Signal measurements
 */
export interface SignalMeasurements {
  snr?: number;
  cfo?: number;
  baudRate?: number;
  bandwidth?: number;
  power?: number;
}

/**
 * Classification result
 */
export interface ClassificationResult {
  label: string;
  probability: number;
}

/**
 * Annotation
 */
export interface Annotation {
  id: number;
  label?: string;
  sampleStart: number;
  sampleEnd: number;
  freqLower?: number;
  freqUpper?: number;
  color: string;
  notes?: string;
}

/**
 * PDF export configuration
 */
export interface PDFExportConfig {
  /** Capture metadata */
  metadata: CaptureMetadata;
  /** Signal measurements */
  measurements?: SignalMeasurements;
  /** Classification results */
  classifications?: ClassificationResult[];
  /** Annotations */
  annotations?: Annotation[];
  /** Analysis notes */
  notes?: string;
  /** Analyst name */
  analyst?: string;
  /** Captured visualizations as data URLs */
  visualizations?: {
    spectrogram?: string;
    constellation?: string;
    scf?: string;
    waterfall?: string;
  };
}

/**
 * Capture canvas as data URL
 */
export function captureCanvas(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/png');
}

/**
 * Capture WebGL canvas with proper context preservation
 */
export function captureWebGLCanvas(canvas: HTMLCanvasElement): string {
  // Create temporary canvas
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = canvas.width;
  tempCanvas.height = canvas.height;
  
  const ctx = tempCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context for capture');
  }
  
  // Draw WebGL canvas to 2D canvas
  ctx.drawImage(canvas, 0, 0);
  
  return tempCanvas.toDataURL('image/png');
}

/**
 * Generate comprehensive PDF report
 */
export async function generateForensicReport(config: PDFExportConfig): Promise<void> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  let yPos = margin;
  
  // Helper to add new page if needed
  const checkPageBreak = (requiredSpace: number) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };
  
  // ===== HEADER =====
  doc.setFillColor(0, 0, 0);
  doc.rect(0, 0, pageWidth, 40, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('FORENSIC SIGNAL ANALYSIS REPORT', pageWidth / 2, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleString()}`, pageWidth / 2, 30, { align: 'center' });
  
  yPos = 50;
  
  // ===== SIGNAL INFORMATION =====
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('Signal Information', margin, yPos);
  yPos += 10;
  
  const metadataRows = [
    ['Capture Name', config.metadata.name],
    ['Hardware', config.metadata.hardware || 'N/A'],
    ['Author', config.metadata.author || 'N/A'],
    ['Sample Rate', config.metadata.sampleRate ? `${(config.metadata.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'],
    ['Datatype', config.metadata.datatype || 'N/A'],
    ['Center Frequency', config.metadata.centerFrequency ? `${(config.metadata.centerFrequency / 1e6).toFixed(2)} MHz` : 'N/A'],
    ['Upload Date', config.metadata.uploadedAt.toLocaleDateString()],
  ];
  
  if (config.metadata.description) {
    metadataRows.push(['Description', config.metadata.description]);
  }
  
  autoTable(doc, {
    startY: yPos,
    head: [['Parameter', 'Value']],
    body: metadataRows,
    theme: 'grid',
    headStyles: { fillColor: [0, 188, 212], textColor: 255, fontStyle: 'bold' },
    margin: { left: margin, right: margin },
    styles: { fontSize: 10, cellPadding: 3 }
  });
  
  yPos = (doc as any).lastAutoTable.finalY + 10;
  
  // ===== MEASUREMENTS =====
  if (config.measurements) {
    checkPageBreak(40);
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Signal Measurements', margin, yPos);
    yPos += 10;
    
    const measurementRows = [];
    if (config.measurements.snr !== undefined) {
      measurementRows.push(['Estimated SNR', `${config.measurements.snr.toFixed(2)} dB`]);
    }
    if (config.measurements.cfo !== undefined) {
      measurementRows.push(['Carrier Frequency Offset', `${(config.measurements.cfo / 1000).toFixed(2)} kHz`]);
    }
    if (config.measurements.baudRate !== undefined) {
      measurementRows.push(['Estimated Baud Rate', `${(config.measurements.baudRate / 1e6).toFixed(2)} Msps`]);
    }
    if (config.measurements.bandwidth !== undefined) {
      measurementRows.push(['Bandwidth', `${(config.measurements.bandwidth / 1e6).toFixed(2)} MHz`]);
    }
    if (config.measurements.power !== undefined) {
      measurementRows.push(['Signal Power', `${config.measurements.power.toFixed(2)} dBm`]);
    }
    
    if (measurementRows.length > 0) {
      autoTable(doc, {
        startY: yPos,
        head: [['Measurement', 'Value']],
        body: measurementRows,
        theme: 'grid',
        headStyles: { fillColor: [0, 188, 212], textColor: 255, fontStyle: 'bold' },
        margin: { left: margin, right: margin },
        styles: { fontSize: 10, cellPadding: 3 }
      });
      
      yPos = (doc as any).lastAutoTable.finalY + 10;
    }
  }
  
  // ===== CLASSIFICATION RESULTS =====
  if (config.classifications && config.classifications.length > 0) {
    checkPageBreak(40);
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Modulation Classification', margin, yPos);
    yPos += 10;
    
    const classRows = config.classifications.map(c => [
      c.label,
      `${c.probability.toFixed(1)}%`
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Modulation Type', 'Confidence']],
      body: classRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 188, 212], textColor: 255, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      styles: { fontSize: 10, cellPadding: 3 }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // ===== VISUALIZATIONS =====
  if (config.visualizations) {
    doc.addPage();
    yPos = margin;
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Signal Visualizations', margin, yPos);
    yPos += 10;
    
    const imgWidth = pageWidth - 2 * margin;
    const imgHeight = 60;
    
    if (config.visualizations.spectrogram) {
      checkPageBreak(imgHeight + 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Spectrogram', margin, yPos);
      yPos += 5;
      doc.addImage(config.visualizations.spectrogram, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    }
    
    if (config.visualizations.constellation) {
      checkPageBreak(imgHeight + 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Constellation Diagram', margin, yPos);
      yPos += 5;
      doc.addImage(config.visualizations.constellation, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    }
    
    if (config.visualizations.scf) {
      checkPageBreak(imgHeight + 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Cyclostationary SCF Surface', margin, yPos);
      yPos += 5;
      doc.addImage(config.visualizations.scf, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    }
    
    if (config.visualizations.waterfall) {
      checkPageBreak(imgHeight + 15);
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Waterfall Display', margin, yPos);
      yPos += 5;
      doc.addImage(config.visualizations.waterfall, 'PNG', margin, yPos, imgWidth, imgHeight);
      yPos += imgHeight + 10;
    }
  }
  
  // ===== ANNOTATIONS =====
  if (config.annotations && config.annotations.length > 0) {
    checkPageBreak(40);
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Annotations', margin, yPos);
    yPos += 10;
    
    const annotationRows = config.annotations.map(a => [
      a.label || `Annotation ${a.id}`,
      `${a.sampleStart} - ${a.sampleEnd}`,
      a.notes || 'N/A'
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Label', 'Sample Range', 'Notes']],
      body: annotationRows,
      theme: 'grid',
      headStyles: { fillColor: [0, 188, 212], textColor: 255, fontStyle: 'bold' },
      margin: { left: margin, right: margin },
      styles: { fontSize: 9, cellPadding: 3 }
    });
    
    yPos = (doc as any).lastAutoTable.finalY + 10;
  }
  
  // ===== ANALYSIS NOTES =====
  if (config.notes) {
    checkPageBreak(40);
    
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('Analysis Notes', margin, yPos);
    yPos += 10;
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const splitNotes = doc.splitTextToSize(config.notes, pageWidth - 2 * margin);
    doc.text(splitNotes, margin, yPos);
    yPos += splitNotes.length * 5 + 10;
  }
  
  // ===== FOOTER =====
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Page ${i} of ${pageCount}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
    
    if (config.analyst) {
      doc.text(
        `Analyst: ${config.analyst}`,
        margin,
        pageHeight - 10
      );
    }
    
    doc.text(
      'Forensic Signal Processor',
      pageWidth - margin,
      pageHeight - 10,
      { align: 'right' }
    );
  }
  
  // Save PDF
  const filename = `forensic_report_${config.metadata.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.pdf`;
  doc.save(filename);
}

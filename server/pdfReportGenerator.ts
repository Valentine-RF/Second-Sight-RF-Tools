/**
 * PDF Forensic Report Generator
 * 
 * Generates professional PDF reports with:
 * - Capture metadata
 * - Spectrogram screenshots
 * - Annotation summaries
 * - Classification results
 * - Cyclostationary analysis plots
 */

import PDFDocument from 'pdfkit';
import { Readable } from 'stream';

export interface ReportData {
  capture: {
    name: string;
    description?: string | null;
    sampleRate?: number | null;
    centerFrequency?: number | null;
    datatype?: string | null;
    hardware?: string | null;
    author?: string | null;
    createdAt: Date;
  };
  annotations?: Array<{
    label: string;
    sampleStart: number;
    sampleEnd: number;
    color?: string | null;
    notes?: string | null;
  }>;
  classifications?: Array<{
    modulation: string;
    confidence: number;
    probability: number;
  }>;
  cyclicProfile?: {
    alpha: number[];
    maxPower: number;
    peakFrequencies: number[];
  };
  screenshots?: {
    spectrogram?: Buffer;
    scfPlot?: Buffer;
  };
}

export async function generateForensicReport(data: ReportData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      info: {
        Title: `Forensic Report: ${data.capture.name}`,
        Author: data.capture.author || 'Second Sight',
        Subject: 'RF Signal Forensic Analysis',
        Keywords: 'RF, Signal Processing, Forensics, SigMF',
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Title Page
    doc.fontSize(24).font('Helvetica-Bold').text('FORENSIC SIGNAL ANALYSIS REPORT', {
      align: 'center',
    });
    doc.moveDown(0.5);
    doc.fontSize(14).font('Helvetica').fillColor('#666').text('Second Sight Platform', {
      align: 'center',
    });
    doc.moveDown(2);

    // Capture Metadata Section
    doc.fontSize(16).font('Helvetica-Bold').fillColor('#000').text('Capture Information');
    doc.moveDown(0.5);
    doc.fontSize(11).font('Helvetica');
    
    const metadata = [
      ['Capture Name:', data.capture.name],
      ['Description:', data.capture.description || 'N/A'],
      ['Sample Rate:', data.capture.sampleRate ? `${(data.capture.sampleRate / 1e6).toFixed(2)} MHz` : 'N/A'],
      ['Center Frequency:', data.capture.centerFrequency ? `${(data.capture.centerFrequency / 1e6).toFixed(2)} MHz` : 'N/A'],
      ['Datatype:', data.capture.datatype || 'N/A'],
      ['Hardware:', data.capture.hardware || 'N/A'],
      ['Author:', data.capture.author || 'N/A'],
      ['Capture Date:', data.capture.createdAt.toLocaleString()],
    ];

    metadata.forEach(([label, value]) => {
      doc.font('Helvetica-Bold').text(label, { continued: true });
      doc.font('Helvetica').text(` ${value}`);
    });

    doc.moveDown(2);

    // Annotations Section
    if (data.annotations && data.annotations.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Annotations Summary');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');

      data.annotations.forEach((ann, idx) => {
        doc.font('Helvetica-Bold').text(`${idx + 1}. ${ann.label}`);
        doc.font('Helvetica').text(`   Sample Range: ${ann.sampleStart} - ${ann.sampleEnd}`);
        if (ann.notes) {
          doc.text(`   Notes: ${ann.notes}`);
        }
        doc.moveDown(0.5);
      });

      doc.moveDown(1);
    }

    // Classification Results Section
    if (data.classifications && data.classifications.length > 0) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Modulation Classification Results');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');

      doc.text('Top modulation candidates identified by TorchSig ML:');
      doc.moveDown(0.5);

      data.classifications.forEach((cls, idx) => {
        doc.font('Helvetica-Bold').text(`${idx + 1}. ${cls.modulation}`, { continued: true });
        doc.font('Helvetica').text(` - Confidence: ${cls.confidence.toFixed(1)}%, Probability: ${(cls.probability * 100).toFixed(1)}%`);
      });

      doc.moveDown(1);
    }

    // Cyclostationary Analysis Section
    if (data.cyclicProfile) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Cyclostationary Analysis (FAM)');
      doc.moveDown(0.5);
      doc.fontSize(11).font('Helvetica');

      doc.text(`Maximum Cyclic Power: ${data.cyclicProfile.maxPower.toFixed(2)} dB`);
      doc.text(`Peak Cyclic Frequencies: ${data.cyclicProfile.peakFrequencies.map(f => f.toFixed(2)).join(', ')} Hz`);
      doc.moveDown(1);
    }

    // Screenshots Section
    if (data.screenshots) {
      doc.addPage();
      doc.fontSize(16).font('Helvetica-Bold').text('Visual Analysis');
      doc.moveDown(0.5);

      if (data.screenshots.spectrogram) {
        doc.text('Spectrogram:');
        doc.moveDown(0.5);
        doc.image(data.screenshots.spectrogram, {
          fit: [500, 300],
          align: 'center',
        });
        doc.moveDown(1);
      }

      if (data.screenshots.scfPlot) {
        doc.addPage();
        doc.text('Spectral Correlation Function (SCF):');
        doc.moveDown(0.5);
        doc.image(data.screenshots.scfPlot, {
          fit: [500, 300],
          align: 'center',
        });
      }
    }

    // Footer
    doc.fontSize(8).fillColor('#999').text(
      `Generated by Second Sight on ${new Date().toLocaleString()}`,
      50,
      doc.page.height - 30,
      { align: 'center' }
    );

    doc.end();
  });
}

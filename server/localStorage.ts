/**
 * Local Storage Layer for Forensic Signal Processor
 * 
 * Provides local-first file storage with optional S3 sync.
 * Primary storage is local filesystem, S3 is optional backup.
 */
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, Stats } from 'fs';
import { Readable } from 'stream';

// Storage root directory - configurable via environment variable
const STORAGE_ROOT = process.env.STORAGE_ROOT || path.join(process.cwd(), 'storage');

/**
 * Ensure the storage root directory exists
 */
export async function ensureStorageDir(): Promise<void> {
  await fs.mkdir(STORAGE_ROOT, { recursive: true });
  console.log(`[localStorage] Storage root initialized: ${STORAGE_ROOT}`);
}

/**
 * Write a file to local storage
 * @param relativePath - Path relative to storage root (e.g., 'signals/1/abc123.sigmf-data')
 * @param data - File contents as Buffer or string
 * @returns The relative path that was written
 */
export async function writeLocalFile(relativePath: string, data: Buffer | string): Promise<string> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  const dir = path.dirname(fullPath);
  
  // Ensure parent directory exists
  await fs.mkdir(dir, { recursive: true });
  
  // Write the file
  await fs.writeFile(fullPath, data);
  
  console.log(`[localStorage] Wrote ${typeof data === 'string' ? data.length : data.length} bytes to ${relativePath}`);
  return relativePath;
}

/**
 * Read a file from local storage as a stream
 * Supports HTTP Range requests for efficient partial reads
 * @param relativePath - Path relative to storage root
 * @param range - Optional byte range for partial reads
 * @returns ReadStream for the file
 */
export async function readLocalFileStream(
  relativePath: string, 
  range?: { start: number; end: number }
): Promise<Readable> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  
  // Verify file exists before creating stream
  await fs.access(fullPath);
  
  const options = range ? { start: range.start, end: range.end } : undefined;
  return createReadStream(fullPath, options);
}

/**
 * Read a file from local storage as a Buffer
 * @param relativePath - Path relative to storage root
 * @returns File contents as Buffer
 */
export async function readLocalFile(relativePath: string): Promise<Buffer> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  return fs.readFile(fullPath);
}

/**
 * Delete a file from local storage
 * @param relativePath - Path relative to storage root
 */
export async function deleteLocalFile(relativePath: string): Promise<void> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  await fs.unlink(fullPath);
  console.log(`[localStorage] Deleted ${relativePath}`);
}

/**
 * Check if a file exists in local storage
 * @param relativePath - Path relative to storage root
 * @returns true if file exists, false otherwise
 */
export async function fileExists(relativePath: string): Promise<boolean> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  try {
    await fs.access(fullPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file stats (size, modification time, etc.)
 * @param relativePath - Path relative to storage root
 * @returns fs.Stats object
 */
export async function getFileStats(relativePath: string): Promise<Stats> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  return fs.stat(fullPath);
}

/**
 * Get the absolute filesystem path for a relative path
 * @param relativePath - Path relative to storage root
 * @returns Absolute filesystem path
 */
export function getFullPath(relativePath: string): string {
  return path.join(STORAGE_ROOT, relativePath);
}

/**
 * Get the storage root directory
 * @returns Storage root path
 */
export function getStorageRoot(): string {
  return STORAGE_ROOT;
}

/**
 * List files in a directory
 * @param relativePath - Path relative to storage root
 * @returns Array of filenames in the directory
 */
export async function listFiles(relativePath: string): Promise<string[]> {
  const fullPath = path.join(STORAGE_ROOT, relativePath);
  try {
    return await fs.readdir(fullPath);
  } catch {
    return [];
  }
}

/**
 * Copy a file within local storage
 * @param srcRelativePath - Source path relative to storage root
 * @param destRelativePath - Destination path relative to storage root
 */
export async function copyLocalFile(srcRelativePath: string, destRelativePath: string): Promise<void> {
  const srcPath = path.join(STORAGE_ROOT, srcRelativePath);
  const destPath = path.join(STORAGE_ROOT, destRelativePath);
  
  // Ensure destination directory exists
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  
  await fs.copyFile(srcPath, destPath);
  console.log(`[localStorage] Copied ${srcRelativePath} to ${destRelativePath}`);
}

/**
 * Move a file within local storage
 * @param srcRelativePath - Source path relative to storage root
 * @param destRelativePath - Destination path relative to storage root
 */
export async function moveLocalFile(srcRelativePath: string, destRelativePath: string): Promise<void> {
  const srcPath = path.join(STORAGE_ROOT, srcRelativePath);
  const destPath = path.join(STORAGE_ROOT, destRelativePath);
  
  // Ensure destination directory exists
  await fs.mkdir(path.dirname(destPath), { recursive: true });
  
  await fs.rename(srcPath, destPath);
  console.log(`[localStorage] Moved ${srcRelativePath} to ${destRelativePath}`);
}

// Initialize storage directory on module load
ensureStorageDir().catch(err => {
  console.error('[localStorage] Failed to initialize storage directory:', err);
});

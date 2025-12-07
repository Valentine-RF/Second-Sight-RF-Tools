import { deleteSignalCapture, getSignalCaptureById } from './db';
import { storageDelete } from './storage';

/**
 * Batch delete signal captures with S3 cleanup
 * @param captureIds Array of capture IDs to delete
 * @returns Summary of deletion results
 */
export async function batchDeleteCaptures(captureIds: number[]): Promise<{
  success: boolean;
  deleted: number;
  failed: number;
  errors: string[];
}> {
  let deleted = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const id of captureIds) {
    try {
      // Get capture metadata to find S3 keys
      const capture = await getSignalCaptureById(id);
      
      if (capture) {
        // Delete S3 files
        try {
          if (capture.metaFileKey) {
            await storageDelete(capture.metaFileKey);
          }
          if (capture.dataFileKey) {
            await storageDelete(capture.dataFileKey);
          }
        } catch (error) {
          console.error(`Failed to delete S3 files for capture ${id}:`, error);
          // Continue with database deletion even if S3 deletion fails
        }
        
        // Delete database record
        await deleteSignalCapture(id);
        deleted++;
      } else {
        failed++;
        errors.push(`Capture ${id} not found`);
      }
    } catch (error) {
      failed++;
      errors.push(`Failed to delete capture ${id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  return {
    success: deleted > 0,
    deleted,
    failed,
    errors,
  };
}

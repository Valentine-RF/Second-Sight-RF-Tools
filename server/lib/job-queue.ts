/**
 * Job Queue - Simplified in-memory queue for batch jobs
 * 
 * This is a simplified version that doesn't require Redis/BullMQ.
 * For production, replace with BullMQ for persistence and distributed processing.
 */

import { EventEmitter } from 'events';

interface Job {
  id: string;
  type: string;
  data: any;
  attempts: number;
  maxAttempts: number;
  status: 'waiting' | 'active' | 'completed' | 'failed';
  error?: string;
  result?: any;
}

class SimpleJobQueue extends EventEmitter {
  private jobs: Map<string, Job> = new Map();
  private queue: string[] = [];
  private processing: boolean = false;

  async add(type: string, data: any, options: { jobId: string; attempts?: number } = { jobId: '' }) {
    const job: Job = {
      id: options.jobId,
      type,
      data,
      attempts: 0,
      maxAttempts: options.attempts || 3,
      status: 'waiting',
    };

    this.jobs.set(job.id, job);
    this.queue.push(job.id);
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    return job;
  }

  async getJob(jobId: string): Promise<Job | undefined> {
    return this.jobs.get(jobId);
  }

  async getWaitingCount(): Promise<number> {
    return Array.from(this.jobs.values()).filter(j => j.status === 'waiting').length;
  }

  async getActiveCount(): Promise<number> {
    return Array.from(this.jobs.values()).filter(j => j.status === 'active').length;
  }

  async getCompletedCount(): Promise<number> {
    return Array.from(this.jobs.values()).filter(j => j.status === 'completed').length;
  }

  async getFailedCount(): Promise<number> {
    return Array.from(this.jobs.values()).filter(j => j.status === 'failed').length;
  }

  private async processQueue() {
    this.processing = true;

    while (this.queue.length > 0) {
      const jobId = this.queue.shift();
      if (!jobId) continue;

      const job = this.jobs.get(jobId);
      if (!job) continue;

      job.status = 'active';
      this.emit('active', job);

      try {
        // Simulate job processing
        // In real implementation, this would call the actual processing functions
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        job.status = 'completed';
        job.result = { success: true };
        this.emit('completed', job);
      } catch (error) {
        job.attempts++;
        
        if (job.attempts >= job.maxAttempts) {
          job.status = 'failed';
          job.error = error instanceof Error ? error.message : 'Unknown error';
          this.emit('failed', job);
        } else {
          // Retry
          job.status = 'waiting';
          this.queue.push(jobId);
        }
      }
    }

    this.processing = false;
  }
}

// Export singleton instance
export const jobQueue = new SimpleJobQueue();

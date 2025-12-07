/**
 * Batch Job Panel - Submit and monitor GPU-accelerated analysis jobs
 * 
 * Features:
 * - Job type selection (WVD, FAM, RF-DNA, Classification, Demodulation)
 * - Parameter configuration for each job type
 * - Real-time progress monitoring via WebSocket
 * - Job queue display with status indicators
 * - Result visualization
 */

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlayCircle, Loader2, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { toast } from 'sonner';

type JobType = 'wvd' | 'fam' | 'rf_dna' | 'classification' | 'demodulation';

interface JobProgress {
  jobId: number;
  type: JobType;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  result?: any;
  error?: string;
}

export function BatchJobPanel() {
  const [jobType, setJobType] = useState<JobType>('wvd');
  const [captureId, setCaptureId] = useState<number>(1);
  const [startSample, setStartSample] = useState<number>(0);
  const [numSamples, setNumSamples] = useState<number>(10000);
  const [jobs, setJobs] = useState<Map<number, JobProgress>>(new Map());
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Job-specific parameters
  const [wvdNfft, setWvdNfft] = useState<number>(256);
  const [wvdSmoothing, setWvdSmoothing] = useState<boolean>(true);
  const [famSampleRate, setFamSampleRate] = useState<number>(1e6);
  const [famNfft, setFamNfft] = useState<number>(256);
  const [rfDnaRegions, setRfDnaRegions] = useState<number>(20);

  const submitJobMutation = trpc.batch.submit.useMutation({
    onSuccess: (data: { jobId: number; status: string }) => {
      toast.success(`Job #${data.jobId} submitted`);
      setJobs(prev => new Map(prev).set(data.jobId, {
        jobId: data.jobId,
        type: jobType,
        status: 'pending',
        progress: 0,
      }));
    },
    onError: (error: any) => {
      toast.error(`Failed to submit job: ${error.message}`);
    },
  });

  const { data: jobList } = trpc.batch.list.useQuery(undefined, {
    refetchInterval: 2000, // Poll every 2 seconds
  });

  const { data: gpuStatus } = trpc.gpuAnalysis.status.useQuery(undefined, {
    refetchInterval: 5000,
  });

  // WebSocket connection for real-time progress
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('[BatchJobPanel] WebSocket connected');
    };
    
    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'job_progress') {
          const { jobId, progress, status, result, error } = message.data;
          
          setJobs(prev => {
            const updated = new Map(prev);
            const existing = updated.get(jobId);
            if (existing) {
              updated.set(jobId, {
                ...existing,
                progress,
                status,
                result,
                error,
              });
            }
            return updated;
          });
          
          if (status === 'completed') {
            toast.success(`Job #${jobId} completed!`);
          } else if (status === 'failed') {
            toast.error(`Job #${jobId} failed: ${error}`);
          }
        }
      } catch (err) {
        console.error('[BatchJobPanel] Failed to parse WebSocket message:', err);
      }
    };
    
    socket.onerror = (error) => {
      console.error('[BatchJobPanel] WebSocket error:', error);
    };
    
    socket.onclose = () => {
      console.log('[BatchJobPanel] WebSocket disconnected');
    };
    
    setWs(socket);
    
    return () => {
      socket.close();
    };
  }, []);

  const handleSubmit = () => {
    const params: Record<string, any> = {
      captureId,
      startSample,
      numSamples,
    };

    switch (jobType) {
      case 'wvd':
        params.nfft = wvdNfft;
        params.smoothing = wvdSmoothing;
        break;
      case 'fam':
        params.sampleRate = famSampleRate;
        params.nfft = famNfft;
        break;
      case 'rf_dna':
        params.regions = rfDnaRegions;
        break;
    }

    submitJobMutation.mutate({
      type: jobType,
      parameters: params,
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'running':
        return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'completed':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      running: 'default',
      completed: 'outline',
      failed: 'destructive',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* GPU Status Banner */}
      {gpuStatus && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">GPU Service Status</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full ${gpuStatus.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm">
                  {gpuStatus.connected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
              {gpuStatus.connected && (
                <div className="text-sm text-muted-foreground">
                  {gpuStatus.gpu_available ? (
                    <span className="text-green-600">GPU Available</span>
                  ) : (
                    <span className="text-yellow-600">CPU Fallback Mode</span>
                  )}
                  {gpuStatus.memory_used_mb !== undefined && (
                    <span className="ml-2">
                      • {gpuStatus.memory_used_mb.toFixed(1)} MB used
                    </span>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value="submit" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="submit">Submit Job</TabsTrigger>
          <TabsTrigger value="queue">Job Queue ({jobs.size})</TabsTrigger>
        </TabsList>

        <TabsContent value="submit" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Submit Batch Job</CardTitle>
              <CardDescription>
                Queue GPU-accelerated analysis jobs for sequential processing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Job Type Selection */}
              <div className="space-y-2">
                <Label htmlFor="jobType">Analysis Type</Label>
                <Select value={jobType} onValueChange={(v) => setJobType(v as JobType)}>
                  <SelectTrigger id="jobType">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="wvd">Wigner-Ville Distribution (WVD)</SelectItem>
                    <SelectItem value="fam">FAM Cyclostationary Analysis</SelectItem>
                    <SelectItem value="rf_dna">RF-DNA Fingerprinting</SelectItem>
                    <SelectItem value="classification">Modulation Classification</SelectItem>
                    <SelectItem value="demodulation">Signal Demodulation</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Common Parameters */}
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="captureId">Capture ID</Label>
                  <Input
                    id="captureId"
                    type="number"
                    value={captureId}
                    onChange={(e) => setCaptureId(parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="startSample">Start Sample</Label>
                  <Input
                    id="startSample"
                    type="number"
                    value={startSample}
                    onChange={(e) => setStartSample(parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="numSamples">Number of Samples</Label>
                  <Input
                    id="numSamples"
                    type="number"
                    value={numSamples}
                    onChange={(e) => setNumSamples(parseInt(e.target.value))}
                  />
                </div>
              </div>

              {/* Job-Specific Parameters */}
              {jobType === 'wvd' && (
                <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
                  <div className="space-y-2">
                    <Label htmlFor="wvdNfft">FFT Size</Label>
                    <Input
                      id="wvdNfft"
                      type="number"
                      value={wvdNfft}
                      onChange={(e) => setWvdNfft(parseInt(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="wvdSmoothing">Smoothing</Label>
                    <Select
                      value={wvdSmoothing ? 'true' : 'false'}
                      onValueChange={(v) => setWvdSmoothing(v === 'true')}
                    >
                      <SelectTrigger id="wvdSmoothing">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="true">Enabled</SelectItem>
                        <SelectItem value="false">Disabled</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {jobType === 'fam' && (
                <div className="grid grid-cols-2 gap-4 p-4 border rounded-lg bg-muted/50">
                  <div className="space-y-2">
                    <Label htmlFor="famSampleRate">Sample Rate (Hz)</Label>
                    <Input
                      id="famSampleRate"
                      type="number"
                      value={famSampleRate}
                      onChange={(e) => setFamSampleRate(parseFloat(e.target.value))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="famNfft">FFT Size</Label>
                    <Input
                      id="famNfft"
                      type="number"
                      value={famNfft}
                      onChange={(e) => setFamNfft(parseInt(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {jobType === 'rf_dna' && (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <div className="space-y-2">
                    <Label htmlFor="rfDnaRegions">Number of Regions</Label>
                    <Input
                      id="rfDnaRegions"
                      type="number"
                      value={rfDnaRegions}
                      onChange={(e) => setRfDnaRegions(parseInt(e.target.value))}
                    />
                    <p className="text-xs text-muted-foreground">
                      Extracts {rfDnaRegions * 9} features (amplitude, phase, frequency per region)
                    </p>
                  </div>
                </div>
              )}

              <Button
                onClick={handleSubmit}
                disabled={submitJobMutation.isPending}
                className="w-full"
              >
                {submitJobMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <PlayCircle className="mr-2 h-4 w-4" />
                    Submit Job
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="queue" className="space-y-4">
          {jobs.size === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No jobs in queue. Submit a job to get started.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {Array.from(jobs.values()).map((job) => (
                <Card key={job.jobId}>
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(job.status)}
                          <div>
                            <div className="font-medium">
                              Job #{job.jobId} - {job.type.toUpperCase()}
                            </div>
                            <div className="text-sm text-muted-foreground">
                              {job.error || 'Processing...'}
                            </div>
                          </div>
                        </div>
                        {getStatusBadge(job.status)}
                      </div>

                      {job.status === 'running' && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-muted-foreground">Progress</span>
                            <span className="font-medium">{job.progress}%</span>
                          </div>
                          <Progress value={job.progress} className="h-2" />
                        </div>
                      )}

                      {job.status === 'completed' && job.result && (
                        <div className="p-3 bg-muted/50 rounded-lg text-sm">
                          <div className="font-medium mb-1">Result Preview</div>
                          <pre className="text-xs overflow-auto max-h-32">
                            {JSON.stringify(job.result, null, 2)}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

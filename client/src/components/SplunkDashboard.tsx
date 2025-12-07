import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { Loader2, RefreshCw, AlertTriangle, TrendingUp, Activity, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

export default function SplunkDashboard() {
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  const [autoRefresh, setAutoRefresh] = useState(false);

  const { data, isLoading, error, refetch } = trpc.splunk.getDashboardData.useQuery(
    { timeRange },
    {
      refetchInterval: autoRefresh ? 30000 : false,
      retry: 1,
    }
  );

  const handleRefresh = () => {
    refetch();
    toast.success('Dashboard refreshed');
  };

  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 mx-auto mb-4 text-yellow-500" />
        <h3 className="text-lg font-semibold mb-2">Splunk Dashboard Unavailable</h3>
        <p className="text-muted-foreground mb-4">
          {error.message}
        </p>
        <p className="text-sm text-muted-foreground">
          Configure Splunk Search API credentials in Settings → Splunk Integration
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Select value={timeRange} onValueChange={(v: any) => setTimeRange(v)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1h">Last Hour</SelectItem>
              <SelectItem value="24h">Last 24 Hours</SelectItem>
              <SelectItem value="7d">Last 7 Days</SelectItem>
              <SelectItem value="30d">Last 30 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Auto-refresh</span>
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(e) => setAutoRefresh(e.target.checked)}
            className="w-4 h-4"
          />
        </div>
      </div>

      {isLoading && !data ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Uploads</span>
                <TrendingUp className="w-4 h-4 text-blue-500" />
              </div>
              <div className="text-3xl font-bold">{data.uploadStats.total_uploads || 0}</div>
              <p className="text-xs text-muted-foreground mt-1">
                {data.uploadStats.total_data_gb ? `${data.uploadStats.total_data_gb} GB total` : 'No data'}
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Avg Confidence</span>
                <Activity className="w-4 h-4 text-green-500" />
              </div>
              <div className="text-3xl font-bold">{data.avgConfidence}%</div>
              <p className="text-xs text-muted-foreground mt-1">
                Classification accuracy
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Anomalies</span>
                <AlertTriangle className="w-4 h-4 text-yellow-500" />
              </div>
              <div className="text-3xl font-bold">{data.anomalyAlerts.length}</div>
              <p className="text-xs text-muted-foreground mt-1">
                Detected issues
              </p>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Total Events</span>
                <BarChart3 className="w-4 h-4 text-purple-500" />
              </div>
              <div className="text-3xl font-bold">
                {data.eventTypeDistribution.reduce((sum: number, item: any) => sum + parseInt(item.count || 0), 0)}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                All event types
              </p>
            </Card>
          </div>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Anomaly Alerts</h3>
            {data.anomalyAlerts.length > 0 ? (
              <div className="space-y-3">
                {data.anomalyAlerts.slice(0, 10).map((alert: any, index: number) => (
                  <div
                    key={index}
                    className={`p-4 border-l-4 rounded ${
                      alert.severity === 'ERROR' || alert.severity === 'CRITICAL'
                        ? 'border-red-500 bg-red-500/10'
                        : 'border-yellow-500 bg-yellow-500/10'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold">{alert.anomalyType}</span>
                          <span className="text-xs px-2 py-1 rounded bg-muted">
                            {alert.severity}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground">{alert.description}</p>
                        {alert.captureName && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Capture: {alert.captureName} | User: {alert.userName}
                          </p>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
                        {new Date(alert._time).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No anomalies detected
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-semibold mb-4">Recent Events</h3>
            {data.recentEvents.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Time</th>
                      <th className="text-left p-2">Type</th>
                      <th className="text-left p-2">Severity</th>
                      <th className="text-left p-2">Message</th>
                      <th className="text-left p-2">User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.recentEvents.slice(0, 20).map((event: any, index: number) => (
                      <tr key={index} className="border-b hover:bg-muted/50">
                        <td className="p-2 whitespace-nowrap">
                          {new Date(event._time).toLocaleString()}
                        </td>
                        <td className="p-2">{event.eventType}</td>
                        <td className="p-2">
                          <span
                            className={`px-2 py-1 rounded text-xs ${
                              event.severity === 'ERROR' || event.severity === 'CRITICAL'
                                ? 'bg-red-500/20 text-red-400'
                                : event.severity === 'WARN'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {event.severity}
                          </span>
                        </td>
                        <td className="p-2">{event.message}</td>
                        <td className="p-2">{event.userName || 'N/A'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No recent events
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </div>
  );
}

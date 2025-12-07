import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Upload, Play, Square, Download, Trash2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function TrainingPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [datasetName, setDatasetName] = useState("");
  const [datasetDescription, setDatasetDescription] = useState("");
  const [datasetFormat, setDatasetFormat] = useState<"radioml" | "gnuradio" | "custom">("radioml");
  
  // Training configuration
  const [selectedDataset, setSelectedDataset] = useState<number | null>(null);
  const [epochs, setEpochs] = useState(50);
  const [batchSize, setBatchSize] = useState(32);
  const [learningRate, setLearningRate] = useState(0.001);
  const [validationSplit, setValidationSplit] = useState(0.2);
  const [isTraining, setIsTraining] = useState(false);
  const [trainingProgress, setTrainingProgress] = useState(0);
  const [currentEpoch, setCurrentEpoch] = useState(0);

  // Queries
  const datasetsQuery = trpc.training.listDatasets.useQuery();
  const modelsQuery = trpc.training.listModels.useQuery();

  // Mutations
  const uploadDatasetMutation = trpc.training.uploadDataset.useMutation({
    onSuccess: () => {
      toast.success("Dataset uploaded successfully");
      datasetsQuery.refetch();
      setSelectedFile(null);
      setDatasetName("");
      setDatasetDescription("");
    },
    onError: (error) => {
      toast.error(`Upload failed: ${error.message}`);
    },
  });

  const startTrainingMutation = trpc.training.startTraining.useMutation({
    onSuccess: () => {
      toast.success("Training started");
      setIsTraining(true);
    },
    onError: (error) => {
      toast.error(`Training failed: ${error.message}`);
    },
  });

  const deleteDatasetMutation = trpc.training.deleteDataset.useMutation({
    onSuccess: () => {
      toast.success("Dataset deleted");
      datasetsQuery.refetch();
    },
  });

  const setActiveModelMutation = trpc.training.setActiveModel.useMutation({
    onSuccess: () => {
      toast.success("Active model updated");
      modelsQuery.refetch();
    },
  });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleUploadDataset = async () => {
    if (!selectedFile || !datasetName) {
      toast.error("Please select a file and enter a name");
      return;
    }

    // In a real implementation, this would upload to S3 and parse the HDF5 file
    // For now, we'll create a placeholder entry
    uploadDatasetMutation.mutate({
      name: datasetName,
      description: datasetDescription,
      format: datasetFormat,
      sampleCount: 100000, // Placeholder
      modulationTypes: JSON.stringify(["BPSK", "QPSK", "8PSK", "QAM16", "QAM64", "GFSK", "CPFSK", "PAM4", "WBFM", "AM-DSB"]),
      sampleRate: 200000,
      fileSize: selectedFile.size,
      filePath: `datasets/${datasetName}.h5`,
    });
  };

  const handleStartTraining = () => {
    if (!selectedDataset) {
      toast.error("Please select a dataset");
      return;
    }

    startTrainingMutation.mutate({
      datasetId: selectedDataset,
      epochs,
      batchSize,
      learningRate,
      validationSplit,
    });

    // Simulate training progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 2;
      setTrainingProgress(progress);
      setCurrentEpoch(Math.floor((progress / 100) * epochs));
      
      if (progress >= 100) {
        clearInterval(interval);
        setIsTraining(false);
        toast.success("Training completed!");
        modelsQuery.refetch();
      }
    }, 500);
  };

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Model Training</h1>
        <p className="text-muted-foreground mt-2">
          Train modulation classification models with RadioML datasets
        </p>
      </div>

      <Tabs defaultValue="datasets" className="space-y-6">
        <TabsList>
          <TabsTrigger value="datasets">Datasets</TabsTrigger>
          <TabsTrigger value="train">Train Model</TabsTrigger>
          <TabsTrigger value="models">Model History</TabsTrigger>
        </TabsList>

        {/* Datasets Tab */}
        <TabsContent value="datasets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Upload Dataset</CardTitle>
              <CardDescription>
                Upload RadioML HDF5 files or custom datasets for training
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="dataset-name">Dataset Name</Label>
                <Input
                  id="dataset-name"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  placeholder="e.g., RadioML2016.10a"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataset-description">Description (Optional)</Label>
                <Textarea
                  id="dataset-description"
                  value={datasetDescription}
                  onChange={(e) => setDatasetDescription(e.target.value)}
                  placeholder="Describe the dataset contents..."
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataset-format">Format</Label>
                <Select value={datasetFormat} onValueChange={(v: any) => setDatasetFormat(v)}>
                  <SelectTrigger id="dataset-format">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="radioml">RadioML HDF5</SelectItem>
                    <SelectItem value="gnuradio">GNU Radio</SelectItem>
                    <SelectItem value="custom">Custom Format</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dataset-file">Dataset File</Label>
                <Input
                  id="dataset-file"
                  type="file"
                  accept=".h5,.hdf5"
                  onChange={handleFileSelect}
                />
                {selectedFile && (
                  <p className="text-sm text-muted-foreground">
                    Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </p>
                )}
              </div>

              <Button
                onClick={handleUploadDataset}
                disabled={uploadDatasetMutation.isPending || !selectedFile || !datasetName}
                className="w-full"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploadDatasetMutation.isPending ? "Uploading..." : "Upload Dataset"}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Available Datasets</CardTitle>
              <CardDescription>
                {datasetsQuery.data?.length || 0} datasets uploaded
              </CardDescription>
            </CardHeader>
            <CardContent>
              {datasetsQuery.isLoading ? (
                <p className="text-muted-foreground">Loading datasets...</p>
              ) : datasetsQuery.data && datasetsQuery.data.length > 0 ? (
                <div className="grid gap-4 md:grid-cols-2">
                  {datasetsQuery.data.map((dataset: any) => (
                    <Card key={dataset.id}>
                      <CardHeader>
                        <CardTitle className="text-lg">{dataset.name}</CardTitle>
                        <CardDescription>{dataset.description || "No description"}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-muted-foreground">Format:</span> {dataset.format}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Samples:</span> {dataset.sampleCount.toLocaleString()}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Sample Rate:</span> {dataset.sampleRate ? `${(dataset.sampleRate / 1e6).toFixed(1)} MSps` : "N/A"}
                          </div>
                          <div>
                            <span className="text-muted-foreground">Size:</span> {(dataset.fileSize / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <div className="text-sm">
                          <span className="text-muted-foreground">Modulations:</span>
                          <div className="flex flex-wrap gap-1 mt-1">
                            {JSON.parse(dataset.modulationTypes).map((mod: string) => (
                              <span key={mod} className="px-2 py-0.5 bg-primary/10 text-primary rounded text-xs">
                                {mod}
                              </span>
                            ))}
                          </div>
                        </div>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => deleteDatasetMutation.mutate({ id: dataset.id })}
                          disabled={deleteDatasetMutation.isPending}
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No datasets uploaded yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Train Model Tab */}
        <TabsContent value="train" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Training Configuration</CardTitle>
              <CardDescription>
                Configure hyperparameters and start training
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="train-dataset">Select Dataset</Label>
                <Select value={selectedDataset?.toString() || ""} onValueChange={(v) => setSelectedDataset(parseInt(v))}>
                  <SelectTrigger id="train-dataset">
                    <SelectValue placeholder="Choose a dataset..." />
                  </SelectTrigger>
                  <SelectContent>
                    {datasetsQuery.data?.map((dataset: any) => (
                      <SelectItem key={dataset.id} value={dataset.id.toString()}>
                        {dataset.name} ({dataset.sampleCount.toLocaleString()} samples)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="epochs">Epochs</Label>
                  <Input
                    id="epochs"
                    type="number"
                    value={epochs}
                    onChange={(e) => setEpochs(parseInt(e.target.value))}
                    min={1}
                    max={1000}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="batch-size">Batch Size</Label>
                  <Input
                    id="batch-size"
                    type="number"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value))}
                    min={1}
                    max={512}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="learning-rate">Learning Rate</Label>
                  <Input
                    id="learning-rate"
                    type="number"
                    value={learningRate}
                    onChange={(e) => setLearningRate(parseFloat(e.target.value))}
                    step={0.0001}
                    min={0.0001}
                    max={0.1}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="validation-split">Validation Split</Label>
                  <Input
                    id="validation-split"
                    type="number"
                    value={validationSplit}
                    onChange={(e) => setValidationSplit(parseFloat(e.target.value))}
                    step={0.05}
                    min={0.1}
                    max={0.5}
                  />
                </div>
              </div>

              <div className="pt-4 border-t">
                <Button
                  onClick={handleStartTraining}
                  disabled={isTraining || !selectedDataset}
                  className="w-full"
                  size="lg"
                >
                  {isTraining ? (
                    <>
                      <Square className="w-4 h-4 mr-2" />
                      Training in Progress...
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 mr-2" />
                      Start Training
                    </>
                  )}
                </Button>
              </div>

              {isTraining && (
                <div className="space-y-2 pt-4">
                  <div className="flex justify-between text-sm">
                    <span>Epoch {currentEpoch} / {epochs}</span>
                    <span>{trainingProgress}%</span>
                  </div>
                  <Progress value={trainingProgress} />
                  <p className="text-xs text-muted-foreground">
                    Training progress will be displayed here in real-time
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model History Tab */}
        <TabsContent value="models" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Trained Models</CardTitle>
              <CardDescription>
                {modelsQuery.data?.length || 0} models trained
              </CardDescription>
            </CardHeader>
            <CardContent>
              {modelsQuery.isLoading ? (
                <p className="text-muted-foreground">Loading models...</p>
              ) : modelsQuery.data && modelsQuery.data.length > 0 ? (
                <div className="space-y-4">
                  {modelsQuery.data.map((model: any) => (
                    <Card key={model.id} className={model.isActive ? "border-primary" : ""}>
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg flex items-center gap-2">
                              {model.name}
                              {model.isActive && (
                                <span className="px-2 py-0.5 bg-primary text-primary-foreground rounded text-xs">
                                  Active
                                </span>
                              )}
                            </CardTitle>
                            <CardDescription>{model.description || "No description"}</CardDescription>
                          </div>
                          {!model.isActive && (
                            <Button
                              size="sm"
                              onClick={() => setActiveModelMutation.mutate({ id: model.id })}
                              disabled={setActiveModelMutation.isPending}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-2" />
                              Set Active
                            </Button>
                          )}
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">Accuracy:</span>
                            <div className="font-semibold">{model.accuracy ? `${(model.accuracy * 100).toFixed(2)}%` : "N/A"}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Loss:</span>
                            <div className="font-semibold">{model.loss ? model.loss.toFixed(4) : "N/A"}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Epochs:</span>
                            <div className="font-semibold">{model.epochs}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Batch Size:</span>
                            <div className="font-semibold">{model.batchSize}</div>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Button variant="outline" size="sm">
                            <Download className="w-4 h-4 mr-2" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm">
                            View Confusion Matrix
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <p className="text-muted-foreground">No models trained yet</p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

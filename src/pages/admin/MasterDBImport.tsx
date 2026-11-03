import React, { useState, useRef } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Database, CheckCircle2, AlertCircle, Loader2, Trash2, RefreshCw, Archive } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { UpdateTransparentFilenames } from "@/components/admin/master-db/UpdateTransparentFilenames";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface ImportStats {
  total: number;
  inserted: number;
  skipped: number;
  errors: number;
  deleted?: number;
}

const MasterDBImport = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<ImportStats | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [freshImport, setFreshImport] = useState(false);
  const [existingCount, setExistingCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (message: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    
    return result;
  };

  // Fetch current record count
  const fetchExistingCount = async () => {
    const { count, error } = await supabase
      .from('my_master_db_data')
      .select('*', { count: 'exact', head: true });
    
    if (!error) {
      setExistingCount(count);
    }
  };

  // Clear all records from my_master_db_data
  const clearTable = async (): Promise<number> => {
    addLog("Clearing existing records from my_master_db_data...");
    
    // Get count before deletion
    const { count } = await supabase
      .from('my_master_db_data')
      .select('*', { count: 'exact', head: true });
    
    // Delete all records
    const { error } = await supabase
      .from('my_master_db_data')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all records
    
    if (error) {
      throw new Error(`Failed to clear table: ${error.message}`);
    }
    
    addLog(`Deleted ${count || 0} existing records`);
    return count || 0;
  };

  // Parse CSV records from text
  const parseCSVRecords = (csvText: string) => {
    const lines = csvText.trim().split('\n');
    const headers = parseCSVLine(lines[0]);
    
    addLog(`CSV loaded with ${lines.length - 1} records (excluding header)`);
    addLog(`Headers: ${headers.slice(0, 5).join(', ')}...`);
    
    const records: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      
      const values = parseCSVLine(line);
      
      // Map to database columns - matching the exact structure
      const record = {
        unique_id: values[0] || null,
        combination_id: values[1] || null,
        style_name: values[2] || null,
        shank_id: values[3] || null,
        shank_name: values[4] || null,
        visual_color: values[5] || null,
        visual_color_name: values[6] || null,
        shape_id: values[7] || null,
        shape_name: values[8] || null,
        folder_path: values[9] || null,
        image_0_filename: values[10] || null,
        image_0_status: values[11]?.toUpperCase() === 'TRUE',
        image_1_filename: values[12] || null,
        image_1_status: values[13]?.toUpperCase() === 'TRUE',
        image_2_filename: values[14] || null,
        image_2_status: values[15]?.toUpperCase() === 'TRUE',
        image_3_filename: values[16] || null,
        image_3_status: values[17]?.toUpperCase() === 'TRUE',
        video_filename: values[18] || null,
        video_status: values[19]?.toUpperCase() === 'TRUE',
        glb_model_filename: values[20] || null,
        glb_model_status: values[21]?.toUpperCase() === 'TRUE',
        transparent_0_filename: values[22] || null,
        transparent_0_status: values[23]?.toUpperCase() === 'TRUE',
        transparent_1_filename: values[24] || null,
        transparent_1_status: values[25]?.toUpperCase() === 'TRUE',
        transparent_2_filename: values[26] || null,
        transparent_2_status: values[27]?.toUpperCase() === 'TRUE',
        transparent_3_filename: values[28] || null,
        transparent_3_status: values[29]?.toUpperCase() === 'TRUE',
        model_photo_filename: values[30] || null,
        model_photo_status: values[31]?.toUpperCase() === 'TRUE',
        manufacture_cad_filename: values[32] || null,
        manufacture_cad_status: values[33]?.toUpperCase() === 'TRUE',
        rendered_cad_filename: values[34] || null,
        rendered_cad_status: values[35]?.toUpperCase() === 'TRUE',
        files_uploaded: values[36] || null,
        total_files: values[37] ? parseInt(values[37]) : 13,
        all_upload_complete: values[38]?.toUpperCase() === 'TRUE',
        drive_link: values[39] || null,
        last_updated: values[40] || null,
        notes: values[41] || null,
      };
      
      records.push(record);
    }
    
    return { records, totalLines: lines.length - 1 };
  };

  // Insert records in batches
  const insertRecordsBatch = async (records: any[]) => {
    const batchSize = 50;
    let insertedCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchNum = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(records.length / batchSize);
      
      addLog(`Inserting batch ${batchNum}/${totalBatches} (${batch.length} records)...`);
      
      const { error } = await supabase
        .from('my_master_db_data')
        .insert(batch);
      
      if (error) {
        addLog(`Error in batch ${batchNum}: ${error.message}`);
        errorCount += batch.length;
      } else {
        insertedCount += batch.length;
        addLog(`Batch ${batchNum} inserted successfully`);
      }
      
      setProgress(Math.round(((i + batch.length) / records.length) * 100));
    }
    
    return { insertedCount, errorCount };
  };

  const importFromPublicCSV = async () => {
    setIsLoading(true);
    setProgress(0);
    setStats(null);
    setLogs([]);
    
    try {
      addLog("Fetching CSV file from public folder...");
      
      const response = await fetch('/data/master-db-import.csv');
      if (!response.ok) {
        throw new Error('Failed to fetch CSV file');
      }
      
      const csvText = await response.text();
      let deletedCount = 0;
      
      // If fresh import, clear the table first
      if (freshImport) {
        deletedCount = await clearTable();
      }
      
      const { records: allRecords, totalLines } = parseCSVRecords(csvText);
      
      // If not fresh import, filter out existing records
      let recordsToInsert = allRecords;
      let skippedCount = 0;
      
      if (!freshImport) {
        addLog("Checking existing records in database...");
        const { data: existingRecords, error: fetchError } = await supabase
          .from('my_master_db_data')
          .select('unique_id');
        
        if (fetchError) {
          throw new Error(`Failed to fetch existing records: ${fetchError.message}`);
        }
        
        const existingIds = new Set(existingRecords?.map(r => r.unique_id) || []);
        addLog(`Found ${existingIds.size} existing records`);
        
        recordsToInsert = allRecords.filter(r => !existingIds.has(r.unique_id));
        skippedCount = existingIds.size;
      }
      
      addLog(`Found ${recordsToInsert.length} records to insert`);
      
      if (recordsToInsert.length === 0) {
        addLog("No new records to insert!");
        setStats({ total: totalLines, inserted: 0, skipped: skippedCount, errors: 0, deleted: deletedCount });
        setProgress(100);
        toast.info("No new records to import.");
        setIsLoading(false);
        return;
      }
      
      const { insertedCount, errorCount } = await insertRecordsBatch(recordsToInsert);
      
      setStats({
        total: totalLines,
        inserted: insertedCount,
        skipped: skippedCount,
        errors: errorCount,
        deleted: deletedCount,
      });
      
      addLog(`Import complete! Inserted: ${insertedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
      
      if (errorCount === 0) {
        toast.success(`Successfully imported ${insertedCount} records!`);
      } else {
        toast.warning(`Import completed with ${errorCount} errors. ${insertedCount} records inserted.`);
      }
      
      fetchExistingCount();
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${message}`);
      toast.error(`Import failed: ${message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setIsLoading(true);
    setProgress(0);
    setStats(null);
    setLogs([]);
    
    try {
      addLog(`Reading file: ${file.name}`);
      
      const csvText = await file.text();
      let deletedCount = 0;
      
      // If fresh import, clear the table first
      if (freshImport) {
        deletedCount = await clearTable();
      }
      
      const { records: allRecords, totalLines } = parseCSVRecords(csvText);
      
      // If not fresh import, filter out existing records
      let recordsToInsert = allRecords;
      let skippedCount = 0;
      
      if (!freshImport) {
        addLog("Checking existing records in database...");
        const { data: existingRecords, error: fetchError } = await supabase
          .from('my_master_db_data')
          .select('unique_id');
        
        if (fetchError) {
          throw new Error(`Failed to fetch existing records: ${fetchError.message}`);
        }
        
        const existingIds = new Set(existingRecords?.map(r => r.unique_id) || []);
        addLog(`Found ${existingIds.size} existing records`);
        
        recordsToInsert = allRecords.filter(r => !existingIds.has(r.unique_id));
        skippedCount = existingIds.size;
      }
      
      addLog(`Found ${recordsToInsert.length} records to insert`);
      
      if (recordsToInsert.length === 0) {
        addLog("No new records to insert!");
        setStats({ total: totalLines, inserted: 0, skipped: skippedCount, errors: 0, deleted: deletedCount });
        setProgress(100);
        toast.info("No new records to import.");
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }
      
      const { insertedCount, errorCount } = await insertRecordsBatch(recordsToInsert);
      
      setStats({
        total: totalLines,
        inserted: insertedCount,
        skipped: skippedCount,
        errors: errorCount,
        deleted: deletedCount,
      });
      
      addLog(`Import complete! Inserted: ${insertedCount}, Skipped: ${skippedCount}, Errors: ${errorCount}`);
      
      if (errorCount === 0) {
        toast.success(`Successfully imported ${insertedCount} records!`);
      } else {
        toast.warning(`Import completed with ${errorCount} errors. ${insertedCount} records inserted.`);
      }
      
      fetchExistingCount();
      
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Error: ${message}`);
      toast.error(`Import failed: ${message}`);
    } finally {
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load existing count on mount
  React.useEffect(() => {
    fetchExistingCount();
  });

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Master DB Import</h1>
          <p className="text-muted-foreground">Import ring data from CSV file</p>
          {existingCount !== null && (
            <p className="text-sm text-muted-foreground mt-1">
              Current records in table: <span className="font-semibold text-primary">{existingCount}</span>
            </p>
          )}
        </div>
        <Database className="h-8 w-8 text-primary" />
      </div>

      {/* Fresh Import Toggle */}
      <Card className={freshImport ? "border-destructive/50 bg-destructive/5" : ""}>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="h-5 w-5" />
                Fresh Import Mode
              </CardTitle>
              <CardDescription>
                {freshImport 
                  ? "⚠️ All existing records will be DELETED before importing new data"
                  : "New records will be added, existing records will be skipped"
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Label htmlFor="fresh-import" className="text-sm">
                {freshImport ? "ON" : "OFF"}
              </Label>
              <Switch
                id="fresh-import"
                checked={freshImport}
                onCheckedChange={setFreshImport}
              />
            </div>
          </div>
        </CardHeader>
        {freshImport && (
          <CardContent className="pt-0">
            <div className="flex items-center gap-2 text-sm text-destructive">
              <Trash2 className="h-4 w-4" />
              <span>This will clear all {existingCount || 0} existing records before import!</span>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Backup Info */}
      <Card className="bg-muted/30">
        <CardContent className="pt-4">
          <div className="flex items-center gap-3">
            <Archive className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Backup Available</p>
              <p className="text-xs text-muted-foreground">
                Your original data is backed up in the <code className="bg-muted px-1 py-0.5 rounded">backup_my_master_db_data</code> table
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Import Options */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Import from Existing CSV
            </CardTitle>
            <CardDescription>
              Use the pre-loaded CSV file in public/data/master-db-import.csv
            </CardDescription>
          </CardHeader>
          <CardContent>
            {freshImport ? (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    disabled={isLoading}
                    className="w-full"
                    variant="destructive"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Importing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Fresh Import from Public CSV
                      </>
                    )}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Fresh Import</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will permanently delete all {existingCount || 0} existing records and replace them with new data from the CSV. This action cannot be undone (except by restoring from backup).
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={importFromPublicCSV} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                      Yes, Delete & Import
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            ) : (
              <Button 
                onClick={importFromPublicCSV} 
                disabled={isLoading}
                className="w-full"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Import from Public CSV
                  </>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload New CSV
            </CardTitle>
            <CardDescription>
              Upload a custom CSV file with ring data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <label className="w-full cursor-pointer">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                disabled={isLoading}
                className="hidden"
              />
              <div className={`flex items-center justify-center w-full h-10 px-4 border-2 border-dashed rounded-lg hover:bg-muted/50 transition-colors ${freshImport ? 'border-destructive/50' : ''}`}>
                {isLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                <span className="text-sm">
                  {isLoading ? 'Processing...' : freshImport ? 'Choose CSV (Fresh Import)' : 'Choose CSV file'}
                </span>
              </div>
            </label>
            {freshImport && (
              <p className="text-xs text-destructive mt-2">
                ⚠️ Uploading will delete all existing records first
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Progress */}
      {isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Import Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={progress} className="h-3" />
            <p className="text-sm text-muted-foreground text-center">{progress}%</p>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      {stats && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {stats.errors === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
              ) : (
                <AlertCircle className="h-5 w-5 text-amber-500 dark:text-amber-400" />
              )}
              Import Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`grid gap-4 ${stats.deleted !== undefined && stats.deleted > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
              <div className="text-center">
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total in CSV</p>
              </div>
              {stats.deleted !== undefined && stats.deleted > 0 && (
                <div className="text-center">
                  <p className="text-2xl font-bold text-destructive">{stats.deleted}</p>
                  <p className="text-sm text-muted-foreground">Deleted</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.inserted}</p>
                <p className="text-sm text-muted-foreground">Inserted</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-muted-foreground">{stats.skipped}</p>
                <p className="text-sm text-muted-foreground">Skipped</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-destructive">{stats.errors}</p>
                <p className="text-sm text-muted-foreground">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Logs */}
      {logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Import Logs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-muted/50 rounded-lg p-4 max-h-64 overflow-y-auto font-mono text-xs space-y-1">
              {logs.map((log, index) => (
                <div key={index} className="text-muted-foreground">
                  {log}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
      <UpdateTransparentFilenames />
    </div>
  );
};

export default MasterDBImport;

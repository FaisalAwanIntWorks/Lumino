import React, { useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Upload, Loader2, CheckCircle2, AlertCircle, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const TARGET_COLUMNS = [
  "transparent_0_filename",
  "transparent_1_filename",
  "transparent_2_filename",
  "transparent_3_filename",
] as const;

type TargetCol = typeof TARGET_COLUMNS[number];

interface ParsedRow {
  unique_id: string;
  updates: Partial<Record<TargetCol, string | null>>;
}

interface UpdateStats {
  total: number;
  updated: number;
  notFound: number;
  errors: number;
}

const parseCSVLine = (line: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
};

const parseCSV = (text: string): { rows: ParsedRow[]; headers: string[]; error?: string } => {
  const lines = text.replace(/\r\n/g, "\n").split("\n").filter((l) => l.trim());
  if (lines.length < 2) return { rows: [], headers: [], error: "CSV is empty or missing rows" };

  const headers = parseCSVLine(lines[0]).map((h) => h.toLowerCase().trim());
  const uniqueIdIdx = headers.indexOf("unique_id");
  if (uniqueIdIdx === -1) return { rows: [], headers, error: "Missing required column: unique_id" };

  const colIdx: Partial<Record<TargetCol, number>> = {};
  TARGET_COLUMNS.forEach((c) => {
    const idx = headers.indexOf(c);
    if (idx !== -1) colIdx[c] = idx;
  });

  if (Object.keys(colIdx).length === 0) {
    return { rows: [], headers, error: "CSV must contain at least one transparent_N_filename column" };
  }

  const rows: ParsedRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const unique_id = values[uniqueIdIdx]?.trim();
    if (!unique_id) continue;

    const updates: Partial<Record<TargetCol, string | null>> = {};
    TARGET_COLUMNS.forEach((c) => {
      const idx = colIdx[c];
      if (idx === undefined) return;
      const raw = values[idx];
      if (raw === undefined) return;
      const v = raw.trim();
      // empty string => explicit NULL
      updates[c] = v === "" ? null : v;
    });

    rows.push({ unique_id, updates });
  }

  return { rows, headers };
};

export const UpdateTransparentFilenames: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string>("");
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [parseError, setParseError] = useState<string>("");
  const [isRunning, setIsRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<UpdateStats | null>(null);
  const [notFoundIds, setNotFoundIds] = useState<string[]>([]);
  const [errorLog, setErrorLog] = useState<string[]>([]);

  const reset = () => {
    setRows([]);
    setHeaders([]);
    setParseError("");
    setStats(null);
    setProgress(0);
    setNotFoundIds([]);
    setErrorLog([]);
  };

  const onFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    reset();
    setFileName(file.name);
    const text = await file.text();
    const { rows: parsed, headers: hdrs, error } = parseCSV(text);
    setHeaders(hdrs);
    if (error) {
      setParseError(error);
      setRows([]);
      return;
    }
    setRows(parsed);
  };

  const runUpdate = async () => {
    if (rows.length === 0) return;
    setIsRunning(true);
    setProgress(0);
    setStats(null);
    setNotFoundIds([]);
    setErrorLog([]);

    let updated = 0;
    let notFound = 0;
    let errors = 0;
    const missing: string[] = [];
    const errs: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const { data, error } = await supabase
          .from("my_master_db_data")
          .update(row.updates as Record<string, string | null>)
          .eq("unique_id", row.unique_id)
          .select("id");

        if (error) {
          errors++;
          errs.push(`${row.unique_id}: ${error.message}`);
        } else if (!data || data.length === 0) {
          notFound++;
          missing.push(row.unique_id);
        } else {
          updated += data.length;
        }
      } catch (e) {
        errors++;
        errs.push(`${row.unique_id}: ${e instanceof Error ? e.message : "unknown"}`);
      }
      setProgress(Math.round(((i + 1) / rows.length) * 100));
    }

    setStats({ total: rows.length, updated, notFound, errors });
    setNotFoundIds(missing);
    setErrorLog(errs);
    setIsRunning(false);

    if (errors === 0 && notFound === 0) {
      toast.success(`Updated ${updated} records`);
    } else {
      toast.warning(`Done. Updated: ${updated}, Not found: ${notFound}, Errors: ${errors}`);
    }
  };

  const presentCols = TARGET_COLUMNS.filter((c) => headers.includes(c));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Upload className="h-5 w-5" />
          Update Transparent Filenames
        </CardTitle>
        <CardDescription>
          Upload a CSV with <code>unique_id</code> and any of{" "}
          <code>transparent_0_filename</code>, <code>transparent_1_filename</code>,{" "}
          <code>transparent_2_filename</code>, <code>transparent_3_filename</code>. Matching rows in{" "}
          <code>my_master_db_data</code> are updated. Empty values clear the column (NULL); omitted
          columns are left untouched.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <label className="block cursor-pointer">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={onFile}
            disabled={isRunning}
            className="hidden"
          />
          <div className="flex items-center justify-center w-full h-12 px-4 border-2 border-dashed rounded-lg hover:bg-muted/50 transition-colors">
            <Upload className="h-4 w-4 mr-2" />
            <span className="text-sm">
              {fileName ? `Selected: ${fileName}` : "Choose CSV file"}
            </span>
          </div>
        </label>

        {parseError && (
          <div className="flex items-start gap-2 p-3 rounded border border-destructive/50 bg-destructive/5 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{parseError}</span>
          </div>
        )}

        {rows.length > 0 && !parseError && (
          <>
            <div className="text-sm text-muted-foreground flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {rows.length} row(s) parsed · Columns to update:{" "}
              <span className="font-mono">{presentCols.join(", ")}</span>
            </div>

            <div className="border rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2">unique_id</th>
                    {presentCols.map((c) => (
                      <th key={c} className="text-left px-3 py-2">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 10).map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-3 py-2 font-mono">{r.unique_id}</td>
                      {presentCols.map((c) => (
                        <td key={c} className="px-3 py-2 font-mono">
                          {r.updates[c] === null ? (
                            <span className="italic text-muted-foreground">(clear)</span>
                          ) : r.updates[c] === undefined ? (
                            <span className="italic text-muted-foreground">—</span>
                          ) : (
                            String(r.updates[c])
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 10 && (
                <div className="px-3 py-2 text-xs text-muted-foreground bg-muted/30">
                  Showing first 10 of {rows.length} rows
                </div>
              )}
            </div>

            <Button onClick={runUpdate} disabled={isRunning} className="w-full">
              {isRunning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Updating... {progress}%
                </>
              ) : (
                <>Update {rows.length} record(s)</>
              )}
            </Button>

            {isRunning && <Progress value={progress} className="h-2" />}
          </>
        )}

        {stats && (
          <div className="space-y-3">
            <div className="grid grid-cols-4 gap-3">
              <Stat label="Total" value={stats.total} />
              <Stat label="Updated" value={stats.updated} valueClass="text-emerald-600 dark:text-emerald-400" />
              <Stat label="Not found" value={stats.notFound} valueClass="text-amber-600 dark:text-amber-400" />
              <Stat label="Errors" value={stats.errors} valueClass="text-destructive" />
            </div>

            {stats.errors === 0 && stats.notFound === 0 && (
              <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> All rows updated successfully.
              </div>
            )}

            {notFoundIds.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-amber-600 dark:text-amber-400">
                  {notFoundIds.length} unique_id(s) not found
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto font-mono bg-muted/30 rounded p-2">
                  {notFoundIds.join(", ")}
                </div>
              </details>
            )}

            {errorLog.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-destructive">
                  {errorLog.length} error(s)
                </summary>
                <div className="mt-2 max-h-40 overflow-y-auto font-mono bg-muted/30 rounded p-2 space-y-1">
                  {errorLog.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              </details>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

const Stat: React.FC<{ label: string; value: number; valueClass?: string }> = ({
  label,
  value,
  valueClass,
}) => (
  <div className="text-center p-3 rounded border">
    <p className={`text-2xl font-bold ${valueClass ?? ""}`}>{value}</p>
    <p className="text-xs text-muted-foreground">{label}</p>
  </div>
);

export default UpdateTransparentFilenames;

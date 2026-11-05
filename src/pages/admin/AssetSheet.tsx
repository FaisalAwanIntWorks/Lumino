import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Download } from "lucide-react";
import { toast } from "sonner";

const AssetSheet = () => {
  const generateCSV = () => {
    const styles = [
      { id: 'solitaire', name: 'Solitaire' },
      { id: 'three-stone', name: 'Three Stone' },
      { id: 'halo', name: 'Halo' },
      { id: 'pave-rail', name: 'Pavé Rail' }
    ];

    const shanks = [
      { id: 'high-polish', name: 'High Polish' },
      { id: 'castel-pave', name: 'Castel Pavé' },
      { id: '3-row-pave', name: '3 Row Pavé' },
      { id: 'tapered', name: 'Tapered' },
      { id: 'eternity', name: 'Eternity' },
      { id: 'marquise-cut', name: 'Marquise Cut' }
    ];

    const visualColors = [
      { id: 'yellow', name: 'Yellow Gold' },
      { id: 'rose', name: 'Rose Gold' },
      { id: 'white', name: 'White Gold / Platinum' }
    ];

    const shapes = [
      { id: 'round', name: 'Round' },
      { id: 'oval', name: 'Oval' },
      { id: 'princess', name: 'Princess' },
      { id: 'radiant', name: 'Radiant' },
      { id: 'emerald', name: 'Emerald' },
      { id: 'cushion', name: 'Cushion' },
      { id: 'pear', name: 'Pear' },
      { id: 'marquise', name: 'Marquise' }
    ];

    const headers = [
      'unique_id',
      'combination_id',
      'style_id',
      'style_name',
      'shank_id',
      'shank_name',
      'visual_color',
      'visual_color_name',
      'shape_id',
      'shape_name',
      'folder_path',
      'image_0_filename',
      'image_1_filename',
      'image_2_filename',
      'image_3_filename',
      'video_filename',
      'glb_model_filename',
      'transparent_0_filename',
      'transparent_1_filename',
      'transparent_2_filename',
      'transparent_3_filename',
      'model_photo_filename',
      'manufacture_cad_filename',
      'rendered_cad_filename',
      'image_0_cdn_url',
      'image_1_cdn_url',
      'image_2_cdn_url',
      'image_3_cdn_url',
      'video_cdn_url',
      'glb_model_cdn_url',
      'transparent_0_cdn_url',
      'transparent_1_cdn_url',
      'transparent_2_cdn_url',
      'transparent_3_cdn_url',
      'model_photo_cdn_url',
      '✓ image_0',
      '✓ image_1',
      '✓ image_2',
      '✓ image_3',
      '✓ video',
      '✓ glb_model',
      '✓ transparent_0',
      '✓ transparent_1',
      '✓ transparent_2',
      '✓ transparent_3',
      '✓ model_photo',
      '✓ manufacture_cad',
      '✓ rendered_cad',
      'files_uploaded',
      'total_files',
      'upload_complete',
      'last_updated',
      'notes'
    ];

    const rows: string[][] = [headers];
    let combinationNumber = 1;
    const CDN_BASE = 'https://wcfxtsyhrpephimyrpbx.supabase.co/storage/v1/object/public/ring-assets';

    styles.forEach(style => {
      shanks.forEach(shank => {
        visualColors.forEach(color => {
          shapes.forEach(shape => {
            const uniqueId = `R${String(combinationNumber).padStart(3, '0')}`;
            const combinationId = `${style.id}-${shank.id}-${color.id}-${shape.id}`;
            const folderPath = `rings/${style.id}/${shank.id}/${color.id}/${shape.id}`;
            const baseFilename = `${style.id}-${shank.id}-${color.id}-${shape.id}`;

            const row = [
              uniqueId,
              combinationId,
              style.id,
              style.name,
              shank.id,
              shank.name,
              color.id,
              color.name,
              shape.id,
              shape.name,
              folderPath,
              `${baseFilename}-angle-0.png`,
              `${baseFilename}-angle-1.png`,
              `${baseFilename}-angle-2.png`,
              `${baseFilename}-angle-3.png`,
              `${baseFilename}-video.mp4`,
              `${baseFilename}-model.glb`,
              `${baseFilename}-transparent-0.png`,
              `${baseFilename}-transparent-1.png`,
              `${baseFilename}-transparent-2.png`,
              `${baseFilename}-transparent-3.png`,
              `${baseFilename}-model-photo.png`,
              `${baseFilename}-manufacture-cad.step`,
              `${baseFilename}-rendered-cad.step`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-angle-0.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-angle-1.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-angle-2.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-angle-3.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-video.mp4`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-model.glb`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-transparent-0.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-transparent-1.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-transparent-2.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-transparent-3.png`,
              `${CDN_BASE}/${folderPath}/${baseFilename}-model-photo.png`,
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              'FALSE',
              '0/13',
              '13',
              'FALSE',
              new Date().toISOString().split('T')[0],
              `${uniqueId} - ${style.name} ${shank.name} ${color.name} ${shape.name}`
            ];

            rows.push(row);
            combinationNumber++;
          });
        });
      });
    });

    const csvContent = rows.map(row => 
      row.map(cell => `"${cell}"`).join(',')
    ).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute('href', url);
    link.setAttribute('download', `aurezo-master-asset-sheet-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast.success("Master asset sheet downloaded successfully!");
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle>Master Asset Sheet Generator</CardTitle>
          <CardDescription>
            Generate a comprehensive CSV file with 576 unique combinations × 13 files = 7,488 total files
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">Asset Sheet Details:</h3>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
              <li><strong>Unique Combinations:</strong> 576 (4 styles × 6 shanks × 3 visual colors × 8 shapes)</li>
              <li><strong>Files per Set:</strong> 13 (4 angle images + 1 video + 1 GLB + 4 transparent + 1 model photo + 2 CAD files)</li>
              <li><strong>Total Files:</strong> 7,488 (576 combinations × 13 files)</li>
              <li><strong>CDN Files:</strong> 6,336 (576 combinations × 11 files - CAD files excluded)</li>
              <li><strong>Estimated Storage:</strong> 8-10 GB</li>
              <li><strong>Upload Tracking:</strong> Individual checkboxes for each file + progress counter (0/13)</li>
              <li><strong>Unique IDs:</strong> R001 through R576 for easy tracking</li>
            </ul>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">File Types:</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="font-medium">CDN Files (11):</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>4 Angle Images (PNG)</li>
                  <li>1 Video Preview (MP4)</li>
                  <li>1 GLB 3D Model</li>
                  <li>4 Transparent Images (PNG)</li>
                  <li>1 Model with Ring Photo (PNG)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">Non-CDN Files (2):</p>
                <ul className="list-disc list-inside text-muted-foreground">
                  <li>1 Manufacture CAD (STEP)</li>
                  <li>1 Rendered CAD (STEP)</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="bg-muted p-4 rounded-lg space-y-2">
            <h3 className="font-semibold">CSV Columns Included:</h3>
            <p className="text-sm text-muted-foreground">
              Unique IDs (R001-R576), Combination IDs, Style/Shank/Visual Color/Shape details, 
              Folder paths, 13 filenames, 11 CDN URLs (Cloud Storage), 13 individual upload checkboxes (✓), 
              Progress counter (0/13), Upload complete status, Last updated dates, and Notes
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              💡 <strong>Pro Tip:</strong> In Google Sheets, select checkbox columns → Data → Data Validation → Checkbox to convert FALSE/TRUE values into clickable checkboxes!
            </p>
          </div>

          <Button onClick={generateCSV} size="lg" className="w-full">
            <Download className="mr-2 h-5 w-5" />
            Download Master Asset Sheet CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default AssetSheet;
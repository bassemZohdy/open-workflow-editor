/**
 * File System Access API adapter with fallback for local file loading and saving.
 */

export interface OpenFileResult {
  filename: string;
  content: string;
  format: 'yaml' | 'json';
}

export async function openWorkflowFile(): Promise<OpenFileResult | null> {
  // Try Native File System Access API if supported
  if ('showOpenFilePicker' in window) {
    try {
      const [handle] = await (
        window as unknown as {
          showOpenFilePicker: (options: unknown) => Promise<FileSystemFileHandle[]>;
        }
      ).showOpenFilePicker({
        types: [
          {
            description: 'Open Workflow Specification (*.yaml, *.yml, *.json)',
            accept: {
              'text/yaml': ['.yaml', '.yml'],
              'application/json': ['.json'],
              'text/plain': ['.txt'],
            },
          },
        ],
        multiple: false,
      });

      if (!handle) return null;
      const file = await handle.getFile();
      const content = await file.text();
      const format: 'yaml' | 'json' = file.name.endsWith('.json') ? 'json' : 'yaml';
      return { filename: file.name, content, format };
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') {
        return null;
      }
      // Fall through to input fallback
    }
  }

  // Fallback using HTML file input
  return new Promise<OpenFileResult | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.yaml,.yml,.json,.txt';
    input.style.display = 'none';

    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const content = await file.text();
        const format: 'yaml' | 'json' = file.name.endsWith('.json') ? 'json' : 'yaml';
        resolve({ filename: file.name, content, format });
      } catch {
        resolve(null);
      } finally {
        input.remove();
      }
    };

    input.oncancel = () => {
      resolve(null);
      input.remove();
    };

    document.body.appendChild(input);
    input.click();
  });
}

export async function saveWorkflowFile(
  content: string,
  suggestedName = 'workflow',
  format: 'yaml' | 'json' = 'yaml',
): Promise<string | null> {
  const extension = format === 'json' ? '.json' : '.yaml';
  const cleanName = suggestedName.replace(/\.(yaml|yml|json)$/i, '');
  const filename = `${cleanName}${extension}`;

  if ('showSaveFilePicker' in window) {
    try {
      const handle = await (
        window as unknown as {
          showSaveFilePicker: (options: unknown) => Promise<FileSystemFileHandle>;
        }
      ).showSaveFilePicker({
        suggestedName: filename,
        types: [
          {
            description: format === 'json' ? 'JSON Workflow Document' : 'YAML Workflow Document',
            accept:
              format === 'json' ? { 'application/json': ['.json'] } : { 'text/yaml': ['.yaml', '.yml'] },
          },
        ],
      });

      const writable = await (
        handle as unknown as {
          createWritable: () => Promise<{
            write: (data: string) => Promise<void>;
            close: () => Promise<void>;
          }>;
        }
      ).createWritable();

      await writable.write(content);
      await writable.close();
      return filename;
    } catch (err: unknown) {
      if ((err as { name?: string }).name === 'AbortError') {
        return null;
      }
      // Fall through to download fallback
    }
  }

  // Fallback: trigger browser download
  const blob = new Blob([content], {
    type: format === 'json' ? 'application/json;charset=utf-8' : 'text/yaml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return filename;
}

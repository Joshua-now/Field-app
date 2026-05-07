import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

interface UploadFile {
  name: string;
  size: number;
  type: string;
  data: File;
}

interface ObjectUploaderProps {
  maxNumberOfFiles?: number;
  maxFileSize?: number;
  onGetUploadParameters: (file: UploadFile) => Promise<{
    method: "PUT";
    url: string;
    headers?: Record<string, string>;
  }>;
  onComplete?: (result: { successful: UploadFile[]; failed: UploadFile[] }) => void;
  buttonClassName?: string;
  children: ReactNode;
}

export function ObjectUploader({
  maxNumberOfFiles = 1,
  maxFileSize = 10485760,
  onGetUploadParameters,
  onComplete,
  buttonClassName,
  children,
}: ObjectUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, maxNumberOfFiles);
    const valid = selected.filter((f) => f.size <= maxFileSize);
    if (valid.length === 0) return;

    setUploading(true);
    const successful: UploadFile[] = [];
    const failed: UploadFile[] = [];

    for (const file of valid) {
      const uploadFile: UploadFile = { name: file.name, size: file.size, type: file.type, data: file };
      try {
        const { method, url, headers } = await onGetUploadParameters(uploadFile);
        const res = await fetch(url, { method, headers, body: file });
        if (res.ok) successful.push(uploadFile);
        else failed.push(uploadFile);
      } catch {
        failed.push(uploadFile);
      }
    }

    setUploading(false);
    onComplete?.({ successful, failed });
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        multiple={maxNumberOfFiles > 1}
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button
        onClick={() => inputRef.current?.click()}
        className={buttonClassName}
        disabled={uploading}
      >
        {uploading ? "Uploading…" : children}
      </Button>
    </div>
  );
}

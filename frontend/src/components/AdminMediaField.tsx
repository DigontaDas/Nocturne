"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";

export interface MediaPreset {
  label: string;
  url: string;
}

interface AdminMediaFieldProps {
  label: string;
  value: string;
  onChange: (nextUrl: string) => void;
  presets: MediaPreset[];
  aspectClass?: string;
}

async function compressImageToDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("Unsupported image file."));
      el.src = objectUrl;
    });

    const maxDim = 960;
    const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
    const width = Math.max(1, Math.round((img.width || maxDim) * scale));
    const height = Math.max(1, Math.round((img.height || maxDim) * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas image processing unavailable in this browser.");
    }
    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.82);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export function AdminMediaField({
  label,
  value,
  onChange,
  presets,
  aspectClass = "h-40",
}: AdminMediaFieldProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please select a PNG, JPG, or WebP image file.");
      return;
    }

    setUploadError(null);
    setProcessing(true);
    try {
      const dataUrl = await compressImageToDataUrl(file);
      onChange(dataUrl);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Could not read image.");
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <label className="font-sans text-[11px] uppercase tracking-[0.18em] text-brass">
          {label}
        </label>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={processing}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-brass/35 bg-obsidian hover:border-brass text-[11px] font-sans uppercase tracking-[0.14em] text-cream transition-colors disabled:opacity-50"
        >
          <Upload className="w-3 h-3 text-brass" />
          <span>{processing ? "Processing..." : "Upload Photo"}</span>
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {/* Live Preview */}
      <div
        className={`relative w-full ${aspectClass} bg-obsidian border border-brass/25 overflow-hidden`}
      >
        {value ? (
          <img
            src={value}
            alt={label}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-xs text-sand/60">
            No image selected
          </div>
        )}
      </div>

      {/* URL Input */}
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="/media/table-window-edge.png or https://..."
        className="w-full px-3.5 py-2.5 bg-obsidian border border-brass/25 text-xs font-mono text-cream placeholder:text-sand/45 focus:outline-none focus:border-brass"
      />

      {uploadError && (
        <p className="text-xs font-sans text-ember">{uploadError}</p>
      )}

      {/* Nocturne Verified Preset Swatches */}
      <div>
        <div className="font-sans text-[10px] uppercase tracking-[0.16em] text-sand/75 mb-1.5">
          House Archive Presets
        </div>
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
          {presets.map((preset) => {
            const active = value === preset.url;
            return (
              <button
                key={preset.url}
                type="button"
                onClick={() => onChange(preset.url)}
                title={preset.label}
                className={`group relative h-12 border overflow-hidden transition-colors ${
                  active
                    ? "border-brass ring-1 ring-brass"
                    : "border-brass/20 hover:border-brass/60"
                }`}
              >
                <img
                  src={preset.url}
                  alt={preset.label}
                  className="w-full h-full object-cover"
                />
                <span className="sr-only">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

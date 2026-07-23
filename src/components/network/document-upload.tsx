"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlertCircle,
  CheckCircle2,
  FileUp,
  LoaderCircle,
  UploadCloud,
  X,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/primitives";

interface UploadResult {
  id: string;
  originalName: string;
  status: "ready_for_agent" | "failed";
  chunkCount: number;
  error?: string;
}

export function DocumentUpload({ onComplete }: { onComplete: () => Promise<void> | void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file?: File) => {
    if (!file || uploading) return;
    setUploading(true);
    setResult(null);
    setError(null);

    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/documents", { method: "POST", body: form });
      const payload = (await response.json()) as UploadResult & { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Document ingestion failed.");
      setResult(payload);
      await onComplete();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Document ingestion failed.");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const close = () => {
    if (uploading) return;
    setOpen(false);
    setResult(null);
    setError(null);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <FileUp size={15} />
        Add documentation
      </Button>

      {open &&
        createPortal(
          <div className="upload-backdrop" role="presentation" onMouseDown={close}>
          <section
            className="upload-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="upload-dialog__header">
              <div>
                <div className="eyebrow">Ingestion inbox</div>
                <h2 id="upload-title">Add source documentation</h2>
              </div>
              <IconButton label="Close upload" onClick={close}>
                <X size={17} />
              </IconButton>
            </header>

            <div
              className={`upload-dropzone ${dragging ? "is-dragging" : ""}`}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={(event) => {
                event.preventDefault();
                if (event.currentTarget === event.target) setDragging(false);
              }}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                void upload(event.dataTransfer.files[0]);
              }}
            >
              {uploading ? (
                <>
                  <LoaderCircle className="spin" size={25} />
                  <strong>Extracting and chunking document</strong>
                  <span>Preparing a backend source record for agent analysis…</span>
                </>
              ) : result ? (
                <>
                  <CheckCircle2 size={25} />
                  <strong>{result.originalName}</strong>
                  <span>
                    {result.status === "ready_for_agent"
                      ? `${result.chunkCount} RAG chunks are ready for an agent.`
                      : result.error ?? "The file was stored but needs manual extraction."}
                  </span>
                </>
              ) : (
                <>
                  <UploadCloud size={25} />
                  <strong>Drop a document here</strong>
                  <span>PDF, DOCX, Markdown, text, CSV, HTML or RTF · maximum 25 MB</span>
                  <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
                    Choose document
                  </Button>
                </>
              )}
              <input
                ref={inputRef}
                type="file"
                hidden
                accept=".pdf,.docx,.txt,.md,.csv,.html,.htm,.rtf"
                onChange={(event) => void upload(event.target.files?.[0])}
              />
            </div>

            {error && (
              <div className="upload-error">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            <footer className="upload-dialog__footer">
              Files stay on this host. Humans supply evidence; agents parse and maintain the graph.
            </footer>
          </section>
          </div>,
          document.body,
        )}
    </>
  );
}

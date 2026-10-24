'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import Header from '@/components/Header';
import Footer from '@/components/Footer';
import { useAuth } from '@/context/AuthContext';

// ── Types & Interfaces ────────────────────────────────────────────────────────
export type CvItemStatus =
  | 'Pending'
  | 'Uploading'
  | 'UPLOADED'
  | 'QUEUED'
  | 'EXTRACTING'
  | 'VALIDATING'
  | 'SCORING'
  | 'COMPLETED'
  | 'NEEDS_REVIEW'
  | 'FAILED_RETRYABLE'
  | 'FAILED_PERMANENTLY'
  | 'FAILED'
  | 'DUPLICATE'
  | 'Duplicate'
  | 'Success';

export interface BatchFileItem {
  id: string; // client id or backend item id
  itemId?: string; // backend db item id
  file?: File;
  name: string;
  size: number;
  type: string;
  status: CvItemStatus;
  uploadProgress: number;
  candidateId?: string;
  candidateName?: string;
  candidateEmail?: string;
  atsScore?: number | null;
  validationStatus?: 'PENDING' | 'VALID' | 'NEEDS_REVIEW' | 'INVALID';
  attemptCount?: number;
  maxAttempts?: number;
  errorMessage?: string;
  fieldWarnings?: Record<string, string>;
}

interface BatchMetrics {
  totalFiles: number;
  uploadedCount: number;
  queuedCount: number;
  processingCount: number;
  parsedCount: number;
  scoredCount: number;
  failedCount: number;
  reviewCount: number;
  duplicateCount: number;
  progress: number;
}

interface JobDetails {
  id: string;
  position: string;
  client: string;
  location?: string;
  work_mode?: string;
  salary?: string;
  status?: string;
  requirementsCount?: number;
  requirements?: any[];
}

const MAX_BATCH_FILES = 250; // Supports 100+ CVs in one batch!
const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB per CV
const MAX_CONCURRENT_UPLOADS = 4; // Concurrent HTTP file upload streams
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.txt'];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
];

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const getFileFormatBadge = (filename: string) => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'pdf':
      return { label: 'PDF', bg: 'bg-red-50 text-red-700 border-red-200' };
    case 'docx':
    case 'doc':
      return { label: ext.toUpperCase(), bg: 'bg-blue-50 text-blue-700 border-blue-200' };
    case 'txt':
      return { label: 'TXT', bg: 'bg-amber-50 text-amber-700 border-amber-200' };
    default:
      return { label: ext?.toUpperCase() || 'FILE', bg: 'bg-slate-100 text-slate-700 border-slate-200' };
  }
};

export default function BatchCVUploadPage() {
  const params = useParams();
  const { token } = useAuth();
  const jobId = (params?.id as string) || '';

  // Job Details
  const [job, setJob] = useState<JobDetails | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);

  // File Queue State
  const [fileQueue, setFileQueue] = useState<BatchFileItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null);
  const [batchMetrics, setBatchMetrics] = useState<BatchMetrics | null>(null);
  const [uploadProgressPercentage, setUploadProgressPercentage] = useState(0);
  const [validationAlert, setValidationAlert] = useState<{ message: string; type: 'warning' | 'error' | 'info' } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  const backendUrl = process.env.NEXT_PUBLIC_API_URL || (typeof window !== 'undefined' && window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1' ? '/api' : 'http://localhost:5000/api');

  // ── Fetch Job Details ────────────────────────────────────────────────────────
  useEffect(() => {
    async function fetchJobInfo() {
      if (!jobId) return;
      try {
        setLoadingJob(true);
        let localClient = '';
        let localPosition = '';
        if (typeof window !== 'undefined') {
          try {
            localClient = localStorage.getItem(`tasknera_company_${jobId}`) || '';
            localPosition = localStorage.getItem(`tasknera_position_${jobId}`) || '';
          } catch {}
        }

        const res = await fetch(`${backendUrl}/jobs/${jobId}`, {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        if (res.ok) {
          const data = await res.json();
          const jobObj = data.job || data;
          setJob({
            id: jobObj.id || jobId,
            position: jobObj.position || localPosition || 'Job Candidate Sourcing',
            client: jobObj.client || localClient || 'Hiring Organization',
            location: jobObj.location || 'Hybrid / Remote',
            work_mode: jobObj.work_mode || 'Full-time',
            salary: jobObj.salary,
            status: jobObj.status || 'Active',
            requirementsCount: jobObj.requirements?.length || 0,
            requirements: jobObj.requirements || [],
          });
        } else {
          setJob({
            id: jobId,
            position: localPosition || 'Job Candidate Sourcing',
            client: localClient || 'Hiring Organization',
            location: 'Multiple Locations',
            work_mode: 'Full-time',
            requirementsCount: 0,
          });
        }
      } catch (err) {
        console.warn('Could not fetch job info for CV upload:', err);
      } finally {
        setLoadingJob(false);
      }
    }

    fetchJobInfo();
  }, [backendUrl, jobId, token]);

  // Clean up polling timer on unmount
  useEffect(() => {
    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, []);

  // ── Validation & Adding Files to Queue ───────────────────────────────────────
  const validateAndAddFiles = useCallback((incomingFiles: FileList | File[]) => {
    setValidationAlert(null);
    const rawFilesArray = Array.from(incomingFiles);
    if (rawFilesArray.length === 0) return;

    // Filter duplicates within incoming files
    const seenKeys = new Set<string>();
    let duplicateRemovedCount = 0;
    const filesArray: File[] = [];

    rawFilesArray.forEach(file => {
      const key = `${file.name.toLowerCase()}_${file.size}`;
      if (seenKeys.has(key)) {
        duplicateRemovedCount++;
      } else {
        seenKeys.add(key);
        filesArray.push(file);
      }
    });

    setFileQueue(currentQueue => {
      // Exclude files already in queue
      const uniqueIncoming: File[] = [];
      filesArray.forEach(file => {
        const inQueue = currentQueue.some(
          q => q.name.toLowerCase() === file.name.toLowerCase() && q.size === file.size
        );
        if (inQueue) {
          duplicateRemovedCount++;
        } else {
          uniqueIncoming.push(file);
        }
      });

      if (currentQueue.length + uniqueIncoming.length > MAX_BATCH_FILES) {
        setValidationAlert({
          message: `Maximum ${MAX_BATCH_FILES} CVs can be uploaded in one batch. Please reduce selection.`,
          type: 'error',
        });
        return currentQueue;
      }

      const newValidItems: BatchFileItem[] = [];
      const invalidMessages: string[] = [];

      uniqueIncoming.forEach(file => {
        const ext = '.' + file.name.split('.').pop()?.toLowerCase();
        const isValidExt = ALLOWED_EXTENSIONS.includes(ext);
        const isValidMime = !file.type || ALLOWED_MIME_TYPES.includes(file.type) || file.type.startsWith('text/');

        if (!isValidExt && !isValidMime) {
          invalidMessages.push(`"${file.name}": Unsupported format. Allowed: .pdf, .docx, .doc, .txt`);
          return;
        }

        if (file.size === 0) {
          invalidMessages.push(`"${file.name}": Empty file.`);
          return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          invalidMessages.push(`"${file.name}": Exceeds 15MB limit (${formatBytes(file.size)}).`);
          return;
        }

        newValidItems.push({
          id: `cv-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          file,
          name: file.name,
          size: file.size,
          type: file.type || ext,
          status: 'Pending',
          uploadProgress: 0,
        });
      });

      if (invalidMessages.length > 0) {
        setValidationAlert({
          message: invalidMessages.slice(0, 3).join(' | ') + (invalidMessages.length > 3 ? ` (+${invalidMessages.length - 3} more)` : ''),
          type: newValidItems.length > 0 ? 'warning' : 'error',
        });
      } else if (duplicateRemovedCount > 0) {
        setValidationAlert({
          message: `${duplicateRemovedCount} duplicate files removed. Unique files queued.`,
          type: 'info',
        });
      }

      return [...currentQueue, ...newValidItems];
    });
  }, []);

  // ── Drag & Drop Handlers ──────────────────────────────────────────────────
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndAddFiles(e.dataTransfer.files);
    }
  };

  const handleManualFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndAddFiles(e.target.files);
      e.target.value = '';
    }
  };

  // ── Batch Polling Function ────────────────────────────────────────────────
  const pollBatchStatus = useCallback(async (batchId: string) => {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

    try {
      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/batch/${batchId}`, {
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (res.ok) {
        const data = await res.json();
        setBatchMetrics(data.metrics);

        // Synchronize backend item status into frontend table
        if (Array.isArray(data.items)) {
          setFileQueue(currentQueue => {
            const updated = [...currentQueue];
            for (const bItem of data.items) {
              const idx = updated.findIndex(q =>
                (q.itemId && q.itemId === bItem.id) ||
                (q.name.toLowerCase() === bItem.fileName.toLowerCase() && (q.size === bItem.fileSize || q.size === 0))
              );

              if (idx >= 0) {
                updated[idx] = {
                  ...updated[idx],
                  itemId: bItem.id,
                  status: bItem.status as CvItemStatus,
                  candidateId: bItem.candidateId,
                  candidateName: bItem.candidateName,
                  candidateEmail: bItem.candidateEmail,
                  atsScore: bItem.atsScore,
                  validationStatus: bItem.validationStatus,
                  attemptCount: bItem.attemptCount,
                  maxAttempts: bItem.maxAttempts,
                  errorMessage: bItem.errorMessage,
                  fieldWarnings: bItem.fieldWarnings,
                  uploadProgress: 100,
                };
              } else {
                // If item not yet in client queue (e.g. page refresh), add it
                updated.push({
                  id: bItem.id,
                  itemId: bItem.id,
                  name: bItem.fileName,
                  size: bItem.fileSize,
                  type: 'application/pdf',
                  status: bItem.status as CvItemStatus,
                  uploadProgress: 100,
                  candidateId: bItem.candidateId,
                  candidateName: bItem.candidateName,
                  candidateEmail: bItem.candidateEmail,
                  atsScore: bItem.atsScore,
                  validationStatus: bItem.validationStatus,
                  attemptCount: bItem.attemptCount,
                  maxAttempts: bItem.maxAttempts,
                  errorMessage: bItem.errorMessage,
                  fieldWarnings: bItem.fieldWarnings,
                });
              }
            }
            return updated;
          });
        }

        const isStillProcessing = data.metrics.queuedCount > 0 || data.metrics.processingCount > 0;
        setIsProcessing(isStillProcessing);

        if (isStillProcessing) {
          pollTimerRef.current = setTimeout(() => pollBatchStatus(batchId), 2500);
        }
      }
    } catch (err) {
      console.warn('[Batch Polling Warning]:', err);
      // Retry poll once more
      pollTimerRef.current = setTimeout(() => pollBatchStatus(batchId), 4000);
    }
  }, [backendUrl, jobId, token]);

  // ── Start Upload & Background Processing ──────────────────────────────────
  const startBatchUpload = async () => {
    if (isUploading || isProcessing) return;

    const pendingItems = fileQueue.filter(f => f.status === 'Pending' || f.status === 'Failed' || f.status === 'FAILED');
    if (pendingItems.length === 0) {
      setValidationAlert({
        message: 'No pending CV files to process. Add new files to upload.',
        type: 'info',
      });
      return;
    }

    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

    try {
      setIsUploading(true);
      setValidationAlert(null);

      // Step 1: Create or reuse Batch Session on backend
      let currentBatchId = activeBatchId;
      if (!currentBatchId) {
        const createRes = await fetch(`${backendUrl}/jobs/${jobId}/candidates/batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          },
          body: JSON.stringify({ totalFiles: fileQueue.length }),
        });

        if (!createRes.ok) {
          const errData = await createRes.json().catch(() => ({}));
          throw new Error(errData.error || 'Failed to initialize batch upload on backend');
        }

        const batchData = await createRes.json();
        currentBatchId = batchData.batchId;
        setActiveBatchId(currentBatchId);
      }

      // Step 2: Upload files into batch session in controlled parallel streams
      let uploadedFileCount = 0;
      const uploadQueue = [...pendingItems];
      let activeStreams = 0;

      await new Promise<void>((resolve) => {
        const dispatchStream = () => {
          if (uploadQueue.length === 0 && activeStreams === 0) {
            resolve();
            return;
          }

          while (uploadQueue.length > 0 && activeStreams < MAX_CONCURRENT_UPLOADS) {
            const item = uploadQueue.shift();
            if (!item || !item.file) continue;

            activeStreams++;

            // Set item to Uploading
            setFileQueue(prev => prev.map(q => q.id === item.id ? { ...q, status: 'Uploading', uploadProgress: 40 } : q));

            const formData = new FormData();
            formData.append('files', item.file);

            fetch(`${backendUrl}/jobs/${jobId}/candidates/batch/${currentBatchId}/upload`, {
              method: 'POST',
              headers: {
                ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
              },
              body: formData,
            })
              .then(async res => {
                if (!res.ok) {
                  const errJson = await res.json().catch(() => ({}));
                  throw new Error(errJson.error || 'Upload error');
                }
                const data = await res.json();
                const uploadedItem = data.items?.[0];

                uploadedFileCount++;
                const uploadPercent = Math.round((uploadedFileCount / pendingItems.length) * 100);
                setUploadProgressPercentage(uploadPercent);

                setFileQueue(prev =>
                  prev.map(q => {
                    if (q.id === item.id) {
                      return {
                        ...q,
                        itemId: uploadedItem?.id || q.itemId,
                        status: 'QUEUED',
                        uploadProgress: 100,
                      };
                    }
                    return q;
                  })
                );
              })
              .catch(uploadErr => {
                console.error(`[Upload Failed] ${item.name}:`, uploadErr);
                setFileQueue(prev =>
                  prev.map(q =>
                    q.id === item.id
                      ? {
                          ...q,
                          status: 'FAILED',
                          errorMessage: uploadErr?.message || 'Upload failed',
                          uploadProgress: 0,
                        }
                      : q
                  )
                );
              })
              .finally(() => {
                activeStreams--;
                dispatchStream();
              });
          }
        };

        dispatchStream();
      });

      setIsUploading(false);
      setIsProcessing(true);

      // Step 3: Begin polling for background processing status
      if (currentBatchId) {
        pollBatchStatus(currentBatchId);
      }
    } catch (err: any) {
      console.error('[Batch Upload Studio Error]:', err);
      setIsUploading(false);
      setValidationAlert({
        message: err.message || 'Failed to complete batch upload.',
        type: 'error',
      });
    }
  };

  // ── Retry Single CV Item ──────────────────────────────────────────────────
  const handleRetryItem = async (item: BatchFileItem) => {
    if (!activeBatchId || !item.itemId) return;
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

    try {
      setFileQueue(prev =>
        prev.map(q => q.id === item.id ? { ...q, status: 'QUEUED', errorMessage: undefined } : q)
      );

      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/batch/${activeBatchId}/items/${item.itemId}/retry`, {
        method: 'POST',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (res.ok) {
        setIsProcessing(true);
        pollBatchStatus(activeBatchId);
      }
    } catch (err) {
      console.warn('Retry single CV notice:', err);
    }
  };

  // ── Retry All Failed Items in Batch ───────────────────────────────────────
  const handleRetryAllFailed = async () => {
    if (!activeBatchId || isProcessing) return;
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('tasknera_token') : null);

    try {
      setIsProcessing(true);
      const res = await fetch(`${backendUrl}/jobs/${jobId}/candidates/batch/${activeBatchId}/retry-failed`, {
        method: 'POST',
        headers: {
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
      });

      if (res.ok) {
        pollBatchStatus(activeBatchId);
      }
    } catch (err) {
      console.warn('Retry all failed notice:', err);
    }
  };

  // ── Clear / Reset ─────────────────────────────────────────────────────────
  const handleRemoveItem = (id: string) => {
    if (isUploading) return;
    setFileQueue(prev => prev.filter(q => q.id !== id));
  };

  const handleClearAll = () => {
    if (isUploading || isProcessing) return;
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setFileQueue([]);
    setActiveBatchId(null);
    setBatchMetrics(null);
    setUploadProgressPercentage(0);
    setValidationAlert(null);
  };

  // ── Metrics Calculation ───────────────────────────────────────────────────
  const totalCount = fileQueue.length;
  const queuedCount = batchMetrics ? batchMetrics.queuedCount : fileQueue.filter(f => f.status === 'QUEUED' || f.status === 'Pending').length;
  const processingCount = batchMetrics ? batchMetrics.processingCount : fileQueue.filter(f => ['EXTRACTING', 'VALIDATING', 'SCORING', 'Uploading'].includes(f.status)).length;
  const parsedCount = batchMetrics ? batchMetrics.parsedCount : fileQueue.filter(f => ['COMPLETED', 'Success', 'NEEDS_REVIEW'].includes(f.status)).length;
  const scoredCount = batchMetrics ? batchMetrics.scoredCount : fileQueue.filter(f => f.atsScore !== null && f.atsScore !== undefined).length;
  const failedCount = batchMetrics ? batchMetrics.failedCount : fileQueue.filter(f => ['FAILED', 'FAILED_RETRYABLE', 'FAILED_PERMANENTLY'].includes(f.status)).length;
  const reviewCount = batchMetrics ? batchMetrics.reviewCount : fileQueue.filter(f => f.status === 'NEEDS_REVIEW' || f.validationStatus === 'NEEDS_REVIEW').length;
  const duplicateCount = batchMetrics ? batchMetrics.duplicateCount : fileQueue.filter(f => f.status === 'DUPLICATE' || f.status === 'Duplicate').length;
  const overallProgress = batchMetrics ? batchMetrics.progress : (totalCount > 0 ? Math.round(((parsedCount + failedCount + duplicateCount) / totalCount) * 100) : 0);

  return (
    <div className="min-h-screen bg-[#EEF2F6] flex flex-col font-sans">
      <Header />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* ── Breadcrumb & Title ───────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <nav className="flex items-center gap-2 text-xs font-semibold text-brand-charcoal-3 mb-2">
              <Link href="/jobs" className="hover:text-brand-orange transition-colors">
                Jobs
              </Link>
              <span>/</span>
              <Link href={`/jobs/${jobId}`} className="hover:text-brand-orange transition-colors truncate max-w-[200px]">
                {job?.position || 'Job Overview'}
              </Link>
              <span>/</span>
              <span className="text-brand-orange font-bold">Bulk 100+ CV Upload Studio</span>
            </nav>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-charcoal tracking-tight">
              Enterprise Bulk CV Upload Studio
            </h1>
            <p className="text-sm text-brand-charcoal-2 mt-1">
              Select and upload 100+ candidate resumes simultaneously with durable background queueing, Gemini AI extraction, and exact ATS scoring.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href={`/jobs/${jobId}/candidates`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-brand-border bg-white text-brand-charcoal hover:border-brand-orange hover:text-brand-orange font-semibold text-sm shadow-xs transition-all"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              View Candidates Directory
            </Link>
          </div>
        </div>

        {/* ── Job Requisition Banner ───────────────────────────────────────── */}
        <div className="bg-white rounded-2xl p-5 border border-brand-border/60 shadow-xs mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-brand-orange-pale text-brand-orange flex items-center justify-center font-bold text-lg border border-brand-orange-border">
              {job?.position ? job.position.substring(0, 2).toUpperCase() : 'JD'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-brand-charcoal">
                  {loadingJob ? 'Loading Requisition Details...' : (job?.position || 'Job Candidate Requisition')}
                </h2>
                {job?.status && (
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                    {job.status}
                  </span>
                )}
              </div>
              <p className="text-xs text-brand-charcoal-3 mt-0.5 flex flex-wrap items-center gap-3">
                <span><strong>Client:</strong> {job?.client || 'Client Organization'}</span>
                {job?.location && <span>• <strong>Location:</strong> {job.location}</span>}
                {job?.work_mode && <span>• <strong>Mode:</strong> {job.work_mode}</span>}
                {job?.requirementsCount ? <span>• <strong>Evaluation Criteria:</strong> {job.requirementsCount} Verified</span> : null}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold bg-[#F8FAFC] border border-brand-border/80 px-3.5 py-2 rounded-xl text-brand-charcoal-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              Queue Pipeline: <strong>Durable Async Worker</strong>
            </div>
            <div className="text-xs font-semibold bg-orange-50 text-brand-orange border border-orange-200 px-3 py-2 rounded-xl">
              Capacity: <strong>Up to 250 CVs / batch</strong>
            </div>
          </div>
        </div>

        {/* ── Validation Alerts ────────────────────────────────────────────── */}
        {validationAlert && (
          <div
            className={`p-4 rounded-xl mb-6 text-sm font-medium flex items-start gap-3 border transition-all ${
              validationAlert.type === 'error'
                ? 'bg-red-50 text-red-800 border-red-200'
                : validationAlert.type === 'warning'
                ? 'bg-amber-50 text-amber-800 border-amber-200'
                : 'bg-blue-50 text-blue-800 border-blue-200'
            }`}
          >
            <svg className="w-5 h-5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">{validationAlert.message}</div>
            <button
              onClick={() => setValidationAlert(null)}
              className="text-xs font-bold hover:opacity-75 transition-opacity px-2 py-0.5"
            >
              ✕
            </button>
          </div>
        )}

        {/* ── Drag & Drop Zone Supporting 100+ CVs ──────────────────────────── */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative rounded-3xl border-2 border-dashed p-8 sm:p-12 text-center cursor-pointer transition-all duration-200 mb-8 ${
            isDragging
              ? 'border-brand-orange bg-brand-orange-pale/50 scale-[1.005] shadow-orange-glow'
              : 'border-brand-border bg-white hover:border-brand-orange/60 hover:bg-[#FDFEFE] shadow-xs'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            onChange={handleManualFileInput}
            className="hidden"
          />

          <div className="max-w-lg mx-auto flex flex-col items-center">
            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-4 transition-transform duration-200 ${
              isDragging ? 'bg-brand-orange text-white scale-110' : 'bg-brand-orange-pale text-brand-orange'
            }`}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>

            <h3 className="text-xl font-extrabold text-brand-charcoal mb-1">
              {isDragging ? 'Drop all CV files here' : 'Select or drag & drop 100+ CV files'}
            </h3>
            <p className="text-sm text-brand-charcoal-2 mb-4">
              Single action file picker supports multi-selection of PDF and DOCX files. Or <span className="text-brand-orange font-bold underline underline-offset-2">browse files</span> from your computer.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-2 text-xs font-semibold text-brand-charcoal-3">
              <span className="px-3 py-1 rounded-lg bg-[#F1F5F9] border border-brand-border/60">
                PDF & DOCX Multi-select
              </span>
              <span className="px-3 py-1 rounded-lg bg-[#F1F5F9] border border-brand-border/60">
                100+ Resumes / Batch
              </span>
              <span className="px-3 py-1 rounded-lg bg-[#F1F5F9] border border-brand-border/60">
                Up to 15MB per file
              </span>
              <span className="px-3 py-1 rounded-lg bg-[#F1F5F9] border border-brand-border/60">
                Automated Duplicate Guard
              </span>
            </div>
          </div>
        </div>

        {/* ── Separate Progress Bars & Live Dashboard Stats ─────────────────── */}
        {totalCount > 0 && (
          <div className="bg-white rounded-3xl p-6 sm:p-7 border border-brand-border shadow-xs mb-8">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 mb-6">
              <div>
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-extrabold text-brand-charcoal">
                    Bulk Processing Dashboard
                  </h3>
                  {activeBatchId && (
                    <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-300">
                      Batch: {activeBatchId.substring(0, 8)}...
                    </span>
                  )}
                </div>
                <p className="text-xs text-brand-charcoal-3 mt-1">
                  Selected: <strong>{totalCount} files</strong> • Upload and background worker processing operate independently without HTTP timeouts.
                </p>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2.5">
                {fileQueue.some(f => f.status === 'Pending' || f.status === 'Failed' || f.status === 'FAILED') && (
                  <button
                    onClick={startBatchUpload}
                    disabled={isUploading || isProcessing}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand-orange text-white font-bold text-sm shadow-orange hover:bg-brand-orange-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  >
                    {isUploading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Uploading Files ({uploadProgressPercentage}%)...
                      </>
                    ) : isProcessing ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                        </svg>
                        Queue Processing ({processingCount} active)...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Start Upload & Processing ({fileQueue.filter(f => f.status === 'Pending').length})
                      </>
                    )}
                  </button>
                )}

                {/* Retry All Failed Button */}
                {failedCount > 0 && !isProcessing && (
                  <button
                    onClick={handleRetryAllFailed}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm shadow-xs transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Retry Failed ({failedCount})
                  </button>
                )}

                {parsedCount > 0 && !isUploading && (
                  <Link
                    href={`/jobs/${jobId}/candidates`}
                    className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 text-white font-bold text-sm shadow-xs hover:bg-emerald-700 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    View Scored Candidates ({scoredCount})
                  </Link>
                )}

                <button
                  onClick={handleClearAll}
                  disabled={isUploading || isProcessing}
                  className="px-3.5 py-2.5 rounded-xl border border-brand-border bg-white text-brand-charcoal-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 font-semibold text-xs transition-colors disabled:opacity-50"
                >
                  Clear Queue
                </button>
              </div>
            </div>

            {/* ── Separate Progress Visualizations ─────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              {/* 1. Upload Progress */}
              <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-brand-border/60">
                <div className="flex items-center justify-between text-xs font-bold text-brand-charcoal mb-2">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    Upload Transfer Progress
                  </span>
                  <span>{uploadProgressPercentage}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-blue-600 h-full rounded-full transition-all duration-300"
                    style={{ width: `${uploadProgressPercentage}%` }}
                  ></div>
                </div>
              </div>

              {/* 2. Worker Processing Progress */}
              <div className="bg-[#F8FAFC] p-4 rounded-2xl border border-brand-border/60">
                <div className="flex items-center justify-between text-xs font-bold text-brand-charcoal mb-2">
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-brand-orange" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                    </svg>
                    Parsing & ATS Scoring Progress
                  </span>
                  <span>{overallProgress}%</span>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="bg-brand-orange h-full rounded-full transition-all duration-300 relative"
                    style={{ width: `${overallProgress}%` }}
                  >
                    {isProcessing && <div className="absolute inset-0 bg-white/25 animate-pulse"></div>}
                  </div>
                </div>
              </div>
            </div>

            {/* ── 9 Metric Dashboard Counters ──────────────────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-9 gap-2.5 pt-4 border-t border-brand-border/60">
              <div className="bg-[#F8FAFC] p-3 rounded-xl border border-brand-border/60 text-center">
                <span className="text-[11px] font-semibold text-brand-charcoal-3 block">Selected</span>
                <span className="text-base font-black text-brand-charcoal">{totalCount}</span>
              </div>
              <div className="bg-blue-50/70 p-3 rounded-xl border border-blue-200/70 text-center">
                <span className="text-[11px] font-semibold text-blue-700 block">Uploaded</span>
                <span className="text-base font-black text-blue-800">{fileQueue.filter(f => f.status !== 'Pending').length}</span>
              </div>
              <div className="bg-amber-50/70 p-3 rounded-xl border border-amber-200/70 text-center">
                <span className="text-[11px] font-semibold text-amber-700 block">Queued</span>
                <span className="text-base font-black text-amber-800">{queuedCount}</span>
              </div>
              <div className="bg-purple-50/70 p-3 rounded-xl border border-purple-200/70 text-center">
                <span className="text-[11px] font-semibold text-purple-700 block">Processing</span>
                <span className="text-base font-black text-purple-800">{processingCount}</span>
              </div>
              <div className="bg-emerald-50/70 p-3 rounded-xl border border-emerald-200/70 text-center">
                <span className="text-[11px] font-semibold text-emerald-700 block">Parsed</span>
                <span className="text-base font-black text-emerald-800">{parsedCount}</span>
              </div>
              <div className="bg-emerald-100/80 p-3 rounded-xl border border-emerald-300 text-center">
                <span className="text-[11px] font-semibold text-emerald-900 block">Scored</span>
                <span className="text-base font-black text-emerald-950">{scoredCount}</span>
              </div>
              <div className="bg-rose-50/70 p-3 rounded-xl border border-rose-200/70 text-center">
                <span className="text-[11px] font-semibold text-rose-700 block">Failed</span>
                <span className="text-base font-black text-rose-800">{failedCount}</span>
              </div>
              <div className="bg-orange-50/70 p-3 rounded-xl border border-orange-200/70 text-center">
                <span className="text-[11px] font-semibold text-orange-700 block">Review</span>
                <span className="text-base font-black text-orange-800">{reviewCount}</span>
              </div>
              <div className="bg-violet-50/70 p-3 rounded-xl border border-violet-200/70 text-center">
                <span className="text-[11px] font-semibold text-violet-700 block">Duplicate</span>
                <span className="text-base font-black text-violet-800">{duplicateCount}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── Per-File Status Table (Section 8 Requirements) ───────────────── */}
        {fileQueue.length > 0 && (
          <div className="bg-white rounded-2xl border border-brand-border shadow-xs overflow-hidden mb-8">
            <div className="p-5 border-b border-brand-border flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-brand-charcoal">
                  Per-CV Processing Status Table ({fileQueue.length} files)
                </h3>
                <p className="text-xs text-brand-charcoal-3">
                  Granular pipeline status, schema validation results, ATS score, attempt counters, and per-item retry controls.
                </p>
              </div>

              {failedCount > 0 && !isProcessing && (
                <button
                  onClick={handleRetryAllFailed}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  Retry All Failed
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[#F8FAFC] border-b border-brand-border/80 text-brand-charcoal font-bold">
                    <th className="py-3 px-4">#</th>
                    <th className="py-3 px-4">Filename</th>
                    <th className="py-3 px-4">Candidate Name</th>
                    <th className="py-3 px-4">Pipeline Status</th>
                    <th className="py-3 px-4">Validation</th>
                    <th className="py-3 px-4">ATS Match Score</th>
                    <th className="py-3 px-4">Attempts</th>
                    <th className="py-3 px-4">Diagnostic / Error</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border/60">
                  {fileQueue.map((item, idx) => {
                    const badge = getFileFormatBadge(item.name);
                    const isCompleted = item.status === 'COMPLETED' || item.status === 'Success';
                    const isNeedsReview = item.status === 'NEEDS_REVIEW' || item.validationStatus === 'NEEDS_REVIEW';
                    const isFailed = item.status === 'FAILED' || item.status === 'FAILED_RETRYABLE' || item.status === 'FAILED_PERMANENTLY';
                    const isDuplicate = item.status === 'DUPLICATE' || item.status === 'Duplicate';
                    const isInProgress = ['EXTRACTING', 'VALIDATING', 'SCORING', 'Uploading'].includes(item.status);

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-[#FDFEFE] transition-colors ${
                          isCompleted ? 'bg-emerald-50/10' : isFailed ? 'bg-rose-50/15' : isNeedsReview ? 'bg-amber-50/15' : ''
                        }`}
                      >
                        {/* Index */}
                        <td className="py-3.5 px-4 font-mono text-slate-400 font-bold">
                          {idx + 1}
                        </td>

                        {/* Filename */}
                        <td className="py-3.5 px-4 font-semibold text-brand-charcoal">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${badge.bg}`}>
                              {badge.label}
                            </span>
                            <span className="truncate max-w-[180px] sm:max-w-[240px]" title={item.name}>
                              {item.name}
                            </span>
                          </div>
                          <span className="text-[10px] text-slate-400 block mt-0.5">
                            {formatBytes(item.size)}
                          </span>
                        </td>

                        {/* Candidate Name */}
                        <td className="py-3.5 px-4">
                          {item.candidateName ? (
                            <div>
                              <span className="font-bold text-brand-charcoal block">
                                {item.candidateName}
                              </span>
                              {item.candidateEmail && (
                                <span className="text-[11px] text-brand-charcoal-3 block">
                                  {item.candidateEmail}
                                </span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 italic">Extracting...</span>
                          )}
                        </td>

                        {/* Processing Status */}
                        <td className="py-3.5 px-4">
                          {item.status === 'Pending' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-slate-100 text-slate-700 border border-slate-300">
                              Pending
                            </span>
                          )}
                          {item.status === 'Uploading' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1.5 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping"></span>
                              Uploading
                            </span>
                          )}
                          {item.status === 'QUEUED' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-amber-50 text-amber-700 border border-amber-200">
                              Queued
                            </span>
                          )}
                          {item.status === 'EXTRACTING' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1.5 w-max animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-purple-500"></span>
                              Extracting Text
                            </span>
                          )}
                          {item.status === 'VALIDATING' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5 w-max">
                              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500"></span>
                              Validating Fields
                            </span>
                          )}
                          {item.status === 'SCORING' && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-teal-50 text-teal-700 border border-teal-200 flex items-center gap-1.5 w-max animate-pulse">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500"></span>
                              Scoring ATS
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 w-max">
                              ✓ Completed
                            </span>
                          )}
                          {isNeedsReview && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-amber-50 text-amber-800 border border-amber-300">
                              Needs Review
                            </span>
                          )}
                          {isDuplicate && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-violet-50 text-violet-700 border border-violet-200">
                              Duplicate
                            </span>
                          )}
                          {isFailed && (
                            <span className="px-2.5 py-1 rounded-full font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                              Failed
                            </span>
                          )}
                        </td>

                        {/* Validation Status */}
                        <td className="py-3.5 px-4 font-semibold">
                          {item.validationStatus === 'VALID' ? (
                            <span className="text-emerald-700 font-bold">Valid</span>
                          ) : item.validationStatus === 'NEEDS_REVIEW' ? (
                            <span className="text-amber-700 font-bold">Review Needed</span>
                          ) : item.validationStatus === 'INVALID' ? (
                            <span className="text-rose-700 font-bold">Invalid</span>
                          ) : (
                            <span className="text-slate-400">Pending</span>
                          )}
                        </td>

                        {/* ATS Score */}
                        <td className="py-3.5 px-4">
                          {item.atsScore !== null && item.atsScore !== undefined ? (
                            <span className={`px-2.5 py-1 rounded-full font-black text-xs border ${
                              item.atsScore >= 80
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : item.atsScore >= 60
                                ? 'bg-amber-100 text-amber-800 border-amber-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {Math.round(item.atsScore)}% Match
                            </span>
                          ) : isFailed ? (
                            <span className="text-slate-400 italic">Unavailable</span>
                          ) : (
                            <span className="text-slate-400 italic">Pending</span>
                          )}
                        </td>

                        {/* Attempts */}
                        <td className="py-3.5 px-4 font-mono text-slate-500">
                          {item.attemptCount || 0}/{item.maxAttempts || 3}
                        </td>

                        {/* Diagnostic Error */}
                        <td className="py-3.5 px-4 max-w-[200px]">
                          {item.errorMessage ? (
                            <span className="text-rose-700 font-medium truncate block" title={item.errorMessage}>
                              {item.errorMessage}
                            </span>
                          ) : item.fieldWarnings && Object.keys(item.fieldWarnings).length > 0 ? (
                            <span className="text-amber-700 font-medium truncate block" title={Object.values(item.fieldWarnings).join(', ')}>
                              {Object.values(item.fieldWarnings)[0]}
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {/* Candidate link after completion */}
                            {item.candidateId && (
                              <Link
                                href={`/evaluations/${item.candidateId}?jobId=${jobId}`}
                                className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-bold text-xs border border-emerald-200 transition-colors"
                              >
                                Scorecard ➔
                              </Link>
                            )}

                            {/* Retry button */}
                            {(isFailed || isNeedsReview) && (
                              <button
                                onClick={() => handleRetryItem(item)}
                                title="Retry processing this CV"
                                className="px-2.5 py-1 rounded-lg bg-white border border-brand-border text-brand-charcoal hover:border-brand-orange hover:text-brand-orange font-bold text-xs shadow-xs transition-colors"
                              >
                                ↺ Retry
                              </button>
                            )}

                            {/* Remove button if not uploading */}
                            {!isInProgress && !isCompleted && (
                              <button
                                onClick={() => handleRemoveItem(item.id)}
                                title="Remove file"
                                className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                              >
                                ✕
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Architecture & Scalability Highlights ────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="bg-white rounded-2xl p-5 border border-brand-border shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-orange-50 text-brand-orange flex items-center justify-center font-bold mb-3">
              1
            </div>
            <h4 className="font-bold text-brand-charcoal text-sm mb-1">Durable Queueing</h4>
            <p className="text-xs text-brand-charcoal-2 leading-relaxed">
              Uploads are immediately acknowledged into a durable PostgreSQL queue and processed by persistent background workers with controlled concurrency.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-brand-border shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold mb-3">
              2
            </div>
            <h4 className="font-bold text-brand-charcoal text-sm mb-1">Gemini AI Rate Limiting</h4>
            <p className="text-xs text-brand-charcoal-2 leading-relaxed">
              Enforces Token-bucket rate limiting (RPM/TPM) with exponential backoff, jitter, and automatic deterministic text-extraction fallback.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-5 border border-brand-border shadow-xs">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold mb-3">
              3
            </div>
            <h4 className="font-bold text-brand-charcoal text-sm mb-1">Stateful Per-CV Retries</h4>
            <p className="text-xs text-brand-charcoal-2 leading-relaxed">
              Failed or flagged CVs can be retried individually or in batches, resuming from the earliest incomplete stage without duplicating candidate profiles.
            </p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

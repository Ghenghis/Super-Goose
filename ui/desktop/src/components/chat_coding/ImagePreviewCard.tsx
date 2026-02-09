/**
 * ImagePreviewCard - Enhanced image preview for multi-modal content
 *
 * Renders image attachments in chat messages with:
 * - Thumbnail with click-to-expand modal overlay
 * - Image dimensions display
 * - Download button
 * - Zoom controls (fit, 100%, zoom in/out)
 * - Loading skeleton while image loads
 * - Error fallback with placeholder
 */
import React, { memo, useState, useCallback, useRef, useEffect } from 'react';
import {
  ImageIcon,
  Download,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../../utils';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ImagePreviewCardProps {
  /** Image source URL or data URI. */
  src: string;
  /** Alt text for accessibility. */
  alt?: string;
  /** MIME type of the image (e.g. "image/png"). */
  mimeType?: string;
  /** Original image width in pixels, if known. */
  width?: number;
  /** Original image height in pixels, if known. */
  height?: number;
  /** Additional CSS classes. */
  className?: string;
}

// ---------------------------------------------------------------------------
// Zoom levels
// ---------------------------------------------------------------------------

type ZoomMode = 'fit' | '100' | 'custom';

const ZOOM_STEP = 0.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatFileSize(mimeType?: string): string {
  if (!mimeType) return 'Image';
  const sub = mimeType.split('/')[1]?.toUpperCase() || 'Image';
  return sub;
}

function formatDimensions(w?: number, h?: number): string | null {
  if (w == null || h == null) return null;
  return `${w} x ${h}`;
}

// ---------------------------------------------------------------------------
// LoadingSkeleton
// ---------------------------------------------------------------------------

const LoadingSkeleton = memo(function LoadingSkeleton() {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[120px] bg-gray-800/50 animate-pulse rounded">
      <ImageIcon className="w-8 h-8 text-gray-600" />
    </div>
  );
});

// ---------------------------------------------------------------------------
// ErrorFallback
// ---------------------------------------------------------------------------

const ErrorFallback = memo(function ErrorFallback({ alt }: { alt?: string }) {
  return (
    <div className="flex flex-col items-center justify-center w-full min-h-[120px] bg-gray-800/30 rounded gap-2 p-4">
      <AlertTriangle className="w-8 h-8 text-yellow-500/60" />
      <span className="text-xs text-text-muted text-center">
        Failed to load image
        {alt && <span className="block text-gray-500 mt-0.5 truncate max-w-[200px]">{alt}</span>}
      </span>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ModalOverlay - fullscreen image viewer
// ---------------------------------------------------------------------------

const ModalOverlay = memo(function ModalOverlay({
  src,
  alt,
  naturalWidth,
  naturalHeight,
  mimeType,
  onClose,
}: {
  src: string;
  alt?: string;
  naturalWidth: number;
  naturalHeight: number;
  mimeType?: string;
  onClose: () => void;
}) {
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit');
  const [customZoom, setCustomZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const handleZoomIn = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.min(MAX_ZOOM, z + ZOOM_STEP));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('custom');
    setCustomZoom((z) => Math.max(MIN_ZOOM, z - ZOOM_STEP));
  }, []);

  const handleFit = useCallback(() => {
    setZoomMode('fit');
  }, []);

  const handle100 = useCallback(() => {
    setZoomMode('100');
    setCustomZoom(1);
  }, []);

  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = src;
    link.download = alt || 'image';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, [src, alt]);

  // Compute display zoom percentage
  const displayZoom = (() => {
    if (zoomMode === '100') return 100;
    if (zoomMode === 'custom') return Math.round(customZoom * 100);
    return null; // fit mode
  })();

  // Image style based on zoom mode
  const imgStyle: React.CSSProperties = (() => {
    switch (zoomMode) {
      case 'fit':
        return {
          maxWidth: '90vw',
          maxHeight: '85vh',
          objectFit: 'contain' as const,
        };
      case '100':
        return {
          width: naturalWidth,
          height: naturalHeight,
        };
      case 'custom':
        return {
          width: naturalWidth * customZoom,
          height: naturalHeight * customZoom,
        };
    }
  })();

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Top toolbar */}
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-black/60 to-transparent z-10"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Left: info */}
        <div className="flex items-center gap-3 text-sm text-gray-300">
          <span className="font-medium">{alt || 'Image'}</span>
          {naturalWidth > 0 && naturalHeight > 0 && (
            <span className="text-gray-500">
              {naturalWidth} x {naturalHeight}
            </span>
          )}
          {mimeType && (
            <span className="text-xs bg-gray-700/50 px-1.5 py-0.5 rounded text-gray-400">
              {formatFileSize(mimeType)}
            </span>
          )}
          {displayZoom != null && (
            <span className="text-xs tabular-nums text-gray-400">
              {displayZoom}%
            </span>
          )}
        </div>

        {/* Right: controls */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleZoomOut}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleFit}
            className={cn(
              'p-1.5 rounded hover:bg-white/10 transition-colors',
              zoomMode === 'fit' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white'
            )}
            title="Fit to screen"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handle100}
            className={cn(
              'p-1.5 rounded hover:bg-white/10 transition-colors text-xs font-mono font-bold',
              zoomMode === '100' ? 'text-white bg-white/10' : 'text-gray-300 hover:text-white'
            )}
            title="100% zoom"
          >
            1:1
          </button>
          <button
            type="button"
            onClick={handleZoomIn}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <span className="w-px h-5 bg-gray-600 mx-1" />

          <button
            type="button"
            onClick={handleDownload}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors"
            title="Download image"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 text-gray-300 hover:text-white transition-colors ml-1"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        ref={containerRef}
        className="overflow-auto max-w-full max-h-full p-8"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt={alt || 'Image preview'}
          style={imgStyle}
          className="select-none"
          draggable={false}
        />
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// ImagePreviewCard
// ---------------------------------------------------------------------------

const ImagePreviewCard = memo(function ImagePreviewCard({
  src,
  alt,
  mimeType,
  width,
  height,
  className,
}: ImagePreviewCardProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [naturalWidth, setNaturalWidth] = useState(width ?? 0);
  const [naturalHeight, setNaturalHeight] = useState(height ?? 0);

  const handleLoad = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      const img = e.currentTarget;
      setIsLoading(false);
      setHasError(false);
      if (!width) setNaturalWidth(img.naturalWidth);
      if (!height) setNaturalHeight(img.naturalHeight);
    },
    [width, height]
  );

  const handleError = useCallback(() => {
    setIsLoading(false);
    setHasError(true);
  }, []);

  const openModal = useCallback(() => {
    if (!hasError) setIsModalOpen(true);
  }, [hasError]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleDownload = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      const link = document.createElement('a');
      link.href = src;
      link.download = alt || 'image';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    },
    [src, alt]
  );

  const dimensionLabel = formatDimensions(naturalWidth, naturalHeight);
  const typeLabel = formatFileSize(mimeType);

  if (hasError) {
    return (
      <div
        className={cn(
          'rounded-lg border border-border-default overflow-hidden',
          className
        )}
      >
        <ErrorFallback alt={alt} />
      </div>
    );
  }

  return (
    <>
      <div
        className={cn(
          'rounded-lg border border-border-default overflow-hidden',
          'bg-background-default',
          'group relative inline-block',
          'cursor-pointer',
          className
        )}
        onClick={openModal}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            openModal();
          }
        }}
        aria-label={`Preview image: ${alt || 'image'}`}
      >
        {/* Thumbnail */}
        <div className="relative">
          {isLoading && <LoadingSkeleton />}
          <img
            src={src}
            alt={alt || 'Image'}
            onLoad={handleLoad}
            onError={handleError}
            className={cn(
              'max-w-[400px] max-h-[300px] object-contain transition-opacity duration-200',
              isLoading ? 'opacity-0 absolute' : 'opacity-100'
            )}
            draggable={false}
          />

          {/* Hover overlay */}
          <div className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors duration-200">
            <Maximize2 className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200 drop-shadow-lg" />
          </div>
        </div>

        {/* Footer info bar */}
        {!isLoading && (
          <div className="flex items-center gap-2 px-2.5 py-1.5 bg-background-muted border-t border-border-default text-xs text-text-muted select-none">
            <ImageIcon className="w-3 h-3 shrink-0" />
            <span className="shrink-0">{typeLabel}</span>
            {dimensionLabel && (
              <>
                <span className="text-gray-600">|</span>
                <span className="tabular-nums">{dimensionLabel}</span>
              </>
            )}
            <span className="flex-1" />
            <button
              type="button"
              onClick={handleDownload}
              className="p-0.5 rounded hover:bg-white/10 text-text-muted hover:text-text-default transition-colors"
              title="Download image"
              aria-label="Download image"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Full-screen modal */}
      {isModalOpen && (
        <ModalOverlay
          src={src}
          alt={alt}
          naturalWidth={naturalWidth}
          naturalHeight={naturalHeight}
          mimeType={mimeType}
          onClose={closeModal}
        />
      )}
    </>
  );
});
ImagePreviewCard.displayName = 'ImagePreviewCard';

export default ImagePreviewCard;

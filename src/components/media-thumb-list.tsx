"use client";

export type MediaThumbItem = {
  fileName: string;
  fileType: string;
  url: string;
  filePath?: string;
};

type Props = {
  items: MediaThumbItem[];
  onRemove?: (index: number) => void;
  videoControls?: boolean;
};

export function MediaThumbList({ items, onRemove, videoControls = false }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-3 mb-4">
      {items.map((m, i) => (
        <div
          key={`${m.filePath ?? m.url}-${i}`}
          className="flex flex-col w-[7.5rem] shrink-0"
        >
          <div className="relative border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            {m.fileType === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.url} alt={m.fileName} className="w-full h-24 object-cover" />
            ) : (
              <video
                src={m.url}
                className="w-full h-24 object-cover bg-black"
                controls={videoControls}
                muted={!videoControls}
                playsInline
                preload="metadata"
              />
            )}
            {onRemove && (
              <button
                type="button"
                onClick={() => onRemove(i)}
                className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
                aria-label="Xóa"
              >
                ×
              </button>
            )}
          </div>
          <p
            className="mt-1 text-[10px] leading-tight text-gray-600 truncate"
            title={m.fileName}
          >
            {m.fileName}
          </p>
        </div>
      ))}
    </div>
  );
}

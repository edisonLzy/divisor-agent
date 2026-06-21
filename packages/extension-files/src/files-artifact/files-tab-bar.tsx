import { X } from "lucide-react";

export interface FilesTabBarItem {
  label: string;
  path: string;
}

interface FilesTabBarProps {
  activePath: string | null;
  files: FilesTabBarItem[];
  onActivate: (path: string) => void;
  onClose: (path: string) => void;
}

function cn(...values: Array<false | null | string | undefined>): string {
  return values.filter(Boolean).join(" ");
}

export function FilesTabBar({ activePath, files, onActivate, onClose }: FilesTabBarProps) {
  return (
    <div className="flex items-center gap-1 overflow-x-auto border-b border-border/70 bg-background/60 px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {files.map((file) => {
        const isActive = file.path === activePath;
        return (
          <div key={file.path} className="relative shrink-0">
            <div
              className={cn(
                "group/tab relative flex max-w-48 items-center overflow-hidden rounded-md px-2 py-1 text-xs transition-colors",
                isActive
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
              )}
            >
              <button
                className="min-w-0 flex-1 truncate text-left"
                onClick={() => onActivate(file.path)}
                title={file.path}
                type="button"
              >
                {file.label}
              </button>
              <button
                aria-label={`Close ${file.label}`}
                className="pointer-events-none absolute top-1/2 right-1 grid size-5 -translate-y-1/2 place-items-center rounded-sm bg-background/95 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:bg-background hover:text-foreground group-hover/tab:pointer-events-auto group-hover/tab:opacity-100 group-focus-within/tab:pointer-events-auto group-focus-within/tab:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onClose(file.path);
                }}
                type="button"
              >
                <X className="size-3" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

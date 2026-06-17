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
          <div
            key={file.path}
            className={cn(
              "group/tab flex max-w-48 shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs",
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
              className="shrink-0 rounded-sm p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-background hover:text-foreground group-hover/tab:opacity-100 focus-visible:opacity-100"
              onClick={() => onClose(file.path)}
              type="button"
            >
              <X className="size-3" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

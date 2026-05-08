import { useStore } from "../lib/store";
import { FileList } from "./FileList";

// Renders the file tree inline at md+ widths and as an overlay drawer below.
export function ResponsiveFileList({
  goToFile,
}: {
  goToFile: (p: string) => void;
}) {
  const sidebarOpen = useStore((s) => s.sidebarOpen);
  const setSidebarOpen = useStore((s) => s.setSidebarOpen);

  return (
    <>
      <div className="hidden md:flex">
        <FileList onSelect={(p) => goToFile(p)} />
      </div>

      {sidebarOpen && (
        <div className="md:hidden fixed inset-0 z-30 flex">
          <div className="flex">
            <FileList
              onSelect={(p) => {
                goToFile(p);
                setSidebarOpen(false);
              }}
            />
          </div>
          <div
            className="flex-1 bg-black/40"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close file list"
          />
        </div>
      )}
    </>
  );
}

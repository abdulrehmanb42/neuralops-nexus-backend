import { Skeleton } from "@/components/ui/surfaces";

// In-shell segment loader: keeps the rail/tree in place while a workspace
// page loads.
export default function WorkspaceLoading() {
  return (
    <div className="flex flex-1 flex-col gap-4 p-6" role="status" aria-label="Loading">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96" />
      <Skeleton className="h-40 w-full max-w-2xl" />
    </div>
  );
}

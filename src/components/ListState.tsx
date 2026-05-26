import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";

export function ListSkeleton({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? "grid md:grid-cols-2 lg:grid-cols-3 gap-4"}>
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="shadow-card-soft">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Skeleton className="w-10 h-10 rounded-md shrink-0" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
                <Skeleton className="h-3 w-full mt-2" />
                <Skeleton className="h-3 w-4/5" />
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function EmptyState({ message, action, className }: { message: string; action?: ReactNode; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-12 text-center flex flex-col items-center gap-3 text-muted-foreground">
        <Inbox className="w-10 h-10 opacity-50" />
        <p translate="no">{message}</p>
        {action}
      </CardContent>
    </Card>
  );
}

export function ErrorState({ message = "Não foi possível carregar os dados.", onRetry, className }: { message?: string; onRetry?: () => void; className?: string }) {
  return (
    <Card className={className}>
      <CardContent className="p-12 text-center flex flex-col items-center gap-3">
        <AlertCircle className="w-10 h-10 text-destructive" />
        <p className="text-sm text-muted-foreground" translate="no">{message}</p>
        {onRetry && (
          <Button variant="outline" onClick={onRetry} translate="no">
            <RefreshCw className="w-4 h-4 mr-2" /> Tentar novamente
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
"use client";

import { useEffect } from "react";
import { RotateCcw } from "lucide-react";
import { Card } from "@astryxdesign/core/Card";
import { EmptyState } from "@astryxdesign/core/EmptyState";
import { VStack } from "@astryxdesign/core/Stack";
import { Button } from "@/components/ui/primitives";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("CTX Bank Pro route error:", error);
  }, [error]);

  return (
    <VStack
      gap={4}
      style={{
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--spacing-6, 24px)",
      }}
    >
      <Card padding={6} style={{ maxWidth: 460, width: "100%" }}>
        <EmptyState
          title="Unable to render this view"
          description="An unexpected runtime error occurred. Your workflow state remains safely persisted on the server."
          actions={
            <Button variant="primary" onClick={reset}>
              <RotateCcw size={14} />
              Retry view
            </Button>
          }
        />
      </Card>
    </VStack>
  );
}

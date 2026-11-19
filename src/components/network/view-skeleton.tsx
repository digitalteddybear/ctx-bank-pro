"use client";

import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Skeleton } from "@/components/ui/primitives";

export function ViewSkeleton() {
  return (
    <VStack gap={4} style={{ padding: "var(--spacing-5, 20px)" }}>
      <HStack gap={4}>
        <Card padding={4} style={{ flex: 1 }}>
          <Skeleton />
        </Card>
        <Card padding={4} style={{ flex: 1 }}>
          <Skeleton />
        </Card>
        <Card padding={4} style={{ flex: 1 }}>
          <Skeleton />
        </Card>
      </HStack>
      <Card padding={5}>
        <VStack gap={3}>
          <Skeleton />
          <Skeleton />
          <Skeleton />
        </VStack>
      </Card>
    </VStack>
  );
}

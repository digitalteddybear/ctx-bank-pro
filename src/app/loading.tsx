import { Card } from "@astryxdesign/core/Card";
import { HStack, VStack } from "@astryxdesign/core/Stack";
import { Skeleton } from "@/components/ui/primitives";

export default function Loading() {
  return (
    <VStack
      gap={4}
      style={{
        height: "100vh",
        padding: "var(--spacing-4, 16px)",
        background: "var(--color-bg-canvas, transparent)",
      }}
    >
      <HStack gap={3} style={{ height: "var(--topbar-height, 68px)", alignItems: "center" }}>
        <Skeleton />
      </HStack>
      <HStack gap={4} style={{ flex: 1, alignItems: "stretch" }}>
        <Card padding={4} style={{ width: 240, flexShrink: 0 }}>
          <VStack gap={3}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </VStack>
        </Card>
        <Card padding={4} style={{ flex: 1 }}>
          <VStack gap={4}>
            <Skeleton />
            <Skeleton />
            <Skeleton />
          </VStack>
        </Card>
      </HStack>
    </VStack>
  );
}

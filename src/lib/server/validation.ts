import { z } from "zod";
import {
  AUTHORITY_LEVELS,
  EDGE_TYPES,
  NODE_STATUSES,
  NODE_TYPES,
} from "@/lib/graph/types";

export const sourceReferenceSchema = z.object({
  sourceId: z.string().min(1),
  path: z.string().min(1),
  locator: z.string().optional(),
  excerpt: z.string().optional(),
});

export const newNodeSchema = z.object({
  label: z.string().trim().min(2).max(160),
  type: z.enum(NODE_TYPES),
  description: z.string().trim().min(10).max(4000),
  status: z.enum(NODE_STATUSES).optional(),
  authority: z.enum(AUTHORITY_LEVELS).optional(),
  confidence: z.number().min(0).max(1).optional(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).optional(),
  sources: z.array(sourceReferenceSchema).max(30).optional(),
});

export const nodePatchSchema = newNodeSchema.partial();

export const newLinkSchema = z.object({
  source: z.string().min(1),
  target: z.string().min(1),
  type: z.enum(EDGE_TYPES),
  description: z.string().max(1000).optional(),
  strength: z.number().min(0).max(1).optional(),
  verified: z.boolean().optional(),
  sourceIds: z.array(z.string()).max(30).optional(),
});

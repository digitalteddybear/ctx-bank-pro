import fs from 'node:fs';

const content = `// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * ASP Agent Outreach OS & Inflection Monitor — live-ops agent analytics with a triage rail.
 *
 * Content-only (root \`Layout\`); the host supplies the app shell. Frame:
 *   header (global controls) | content (KPIs, charts, uptime) | triage rail 400
 *
 * The page is anchored to the viewport or container height, so the header stays put while
 * the content column and the rail scroll within it — never the window.
 *
 * The rail is one scroll region holding two sections — agent recommended points of action
 * over a per-agent swarm breakdown — each with a header that pins while its list scrolls
 * under it. Below 1024px the rail folds into the content column as two cards.
 *
 * The time-window control (1h/1d/7d), environment, and sector/region selectors are
 * real: they reshape the charts, KPI sparklines, and the rail's agent rows.
 * All data is deterministic (fixed fixtures, no clocks/random) so previews stay stable.
 */

import {
  Fragment,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import {
  VStack,
  HStack,
  StackItem,
  Layout,
  LayoutContent,
  LayoutHeader,
  LayoutPanel,
} from '@astryxdesign/core/Layout';
import {Grid} from '@astryxdesign/core/Grid';
import {Text, Heading} from '@astryxdesign/core/Text';
import {Card} from '@astryxdesign/core/Card';
import {Icon} from '@astryxdesign/core/Icon';
import type {IconType} from '@astryxdesign/core/Icon';
import {Divider} from '@astryxdesign/core/Divider';
import {Badge} from '@astryxdesign/core/Badge';
import {Token} from '@astryxdesign/core/Token';
import {StatusDot} from '@astryxdesign/core/StatusDot';
import type {StatusDotVariant} from '@astryxdesign/core/StatusDot';
import {Selector} from '@astryxdesign/core/Selector';
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@astryxdesign/core/SegmentedControl';
import {List, ListItem} from '@astryxdesign/core/List';
import {Timestamp} from '@astryxdesign/core/Timestamp';
import {EmptyState} from '@astryxdesign/core/EmptyState';
import {useMediaQuery} from '@astryxdesign/core/hooks';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  ArrowUpIcon,
  ArrowDownIcon,
  BellAlertIcon,
  CheckCircleIcon,
  ServerStackIcon,
} from '@heroicons/react/24/outline';
import {StopIcon} from '@heroicons/react/24/solid';

// ============= TYPES =============

export type TimeWindow = '1h' | '1d' | '7d';
export type Environment = 'production' | 'staging' | 'development';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type MetricKey = 'p50' | 'p95' | 'p99' | 'useast' | 'uswest' | 'euwest';

export type SeriesPoint = Record<MetricKey, number> & {
  t: number;
  label: string;
};

export interface WindowSeries {
  points: SeriesPoint[];
  ticks: number[];
  tickLabels: Record<number, string>;
}

const STATUS_STROKE: Record<HealthStatus, string> = {
  healthy: 'var(--color-text-success, #0D8626)',
  warning: 'var(--color-text-warning, #E9AF08)',
  critical: 'var(--color-text-error, #E3193B)',
};

const STATUS_DOT: Record<HealthStatus, StatusDotVariant> = {
  healthy: 'success',
  warning: 'warning',
  critical: 'error',
};

// Accessible label wherever a StatusDot is the only carrier of state.
const STATUS_LABEL: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  warning: 'Degraded',
  critical: 'Down',
};

const SEVERITY_RANK: Record<HealthStatus, number> = {
  critical: 0,
  warning: 1,
  healthy: 2,
};

// ============= DETERMINISTIC TIME-SERIES =============

const ENV_FACTOR: Record<Environment, number> = {
  production: 1,
  staging: 0.16,
  development: 0.04,
};

const ENV_LATENCY_FACTOR: Record<Environment, number> = {
  production: 1,
  staging: 0.82,
  development: 0.7,
};

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function pad2(n: number): string {
  return n < 10 ? \`0\${n}\` : \`\${n}\`;
}

function hashNoise(i: number, seed: number): number {
  const x = Math.sin(i * 127.1 + seed * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

function jitter(i: number, seed: number): number {
  return hashNoise(i, seed) * 2 - 1;
}

function burstAt(i: number, seed: number, rate: number): number {
  const gate = hashNoise(i, seed);
  if (gate < 1 - rate) {
    return 0;
  }
  const t = (gate - (1 - rate)) / rate;
  return t * t;
}

function buildWindow(kind: TimeWindow): WindowSeries {
  const config: Record<
    TimeWindow,
    {n: number; stepSec: number; cycles: number}
  > = {
    '1h': {n: 120, stepSec: 30, cycles: 1.2},
    '1d': {n: 144, stepSec: 600, cycles: 2},
    '7d': {n: 168, stepSec: 3600, cycles: 7},
  };
  const {n, stepSec, cycles} = config[kind];
  const points: SeriesPoint[] = [];
  const spikeCenter = Math.round(n * 0.62);
  const spikeWidth = Math.max(3, Math.round(n * 0.05));

  for (let i = 0; i < n; i++) {
    const phase = (i / n) * Math.PI * 2 * cycles;
    const diurnal = Math.sin(phase);
    const diurnal2 = Math.sin(phase + 1.1);
    const diurnal3 = Math.sin(phase + 2.3);

    const dist = Math.abs(i - spikeCenter);
    const spike = dist <= spikeWidth ? (1 - dist / (spikeWidth + 1)) * 170 : 0;

    const burst = burstAt(i, 3.1, 0.14);
    const p50 = 46 + 9 * diurnal + spike * 0.15 + burst * 11 + jitter(i, 1) * 4;
    const p95 =
      158 + 38 * diurnal + spike * 0.6 + burst * 58 + jitter(i, 2) * 15;
    const p99 =
      312 + 88 * diurnal + spike * 1.6 + burst * 195 + jitter(i, 3) * 38;

    const pulse = burstAt(i, 7.3, 0.18) - burstAt(i, 9.7, 0.12);
    const useast = 9200 + 2600 * diurnal + pulse * 1500 + jitter(i, 11) * 520;
    const uswest = 6100 + 1500 * diurnal2 + pulse * 900 + jitter(i, 13) * 380;
    const euwest = 3900 + 1200 * diurnal3 + pulse * 620 + jitter(i, 17) * 260;

    const totalMin = Math.floor((i * stepSec) / 60);
    let label: string;
    if (kind === '7d') {
      label = DAY_LABELS[Math.floor(totalMin / (60 * 24)) % 7];
    } else {
      const hh = Math.floor(totalMin / 60) % 24;
      const mm = totalMin % 60;
      label = \`\${pad2(hh)}:\${pad2(mm)}\`;
    }

    points.push({
      t: i,
      label,
      p50: Math.round(p50),
      p95: Math.round(p95),
      p99: Math.round(p99),
      useast: Math.round(useast),
      uswest: Math.round(uswest),
      euwest: Math.round(euwest),
    });
  }

  const ticks: number[] = [];
  if (kind === '7d') {
    const perDay = Math.round((60 * 60 * 24) / stepSec);
    for (let d = 0; d < 7; d++) {
      ticks.push(d * perDay);
    }
  } else {
    for (let k = 0; k < 6; k++) {
      ticks.push(Math.round((k / 5) * (n - 1)));
    }
  }
  const tickLabels: Record<number, string> = {};
  for (const tk of ticks) {
    tickLabels[tk] = points[Math.min(tk, points.length - 1)]?.label ?? '';
  }

  return {points, ticks, tickLabels};
}

const SERIES: Record<TimeWindow, WindowSeries> = {
  '1h': buildWindow('1h'),
  '1d': buildWindow('1d'),
  '7d': buildWindow('7d'),
};

// ============= KPI DATA (ASP Private Capital Outreach OS) =============

export interface Kpi {
  key: string;
  label: string;
  value: string;
  status: HealthStatus;
  statusLabel: string;
  delta: string;
  deltaPositive: boolean;
}

const KPI_BY_ENV: Record<Environment, Kpi[]> = {
  production: [
    {
      key: 'health',
      label: 'Inbox placement',
      value: '99.4%',
      status: 'healthy',
      statusLabel: 'Optimal',
      delta: '+0.4%',
      deltaPositive: true,
    },
    {
      key: 'error',
      label: 'Inbound engagement',
      value: '24.8%',
      status: 'healthy',
      statusLabel: 'Active',
      delta: '+3.2%',
      deltaPositive: true,
    },
    {
      key: 'latency',
      label: 'Inflection health',
      value: '94 / 100',
      status: 'healthy',
      statusLabel: 'FCA Verified',
      delta: '+2 pts',
      deltaPositive: true,
    },
    {
      key: 'availability',
      label: 'Autonomy ratio',
      value: '92.4%',
      status: 'healthy',
      statusLabel: '7.6% Escalated',
      delta: '+1.8%',
      deltaPositive: true,
    },
  ],
  staging: [
    {
      key: 'health',
      label: 'Inbox placement',
      value: '99.8%',
      status: 'healthy',
      statusLabel: 'Optimal',
      delta: '+0.1%',
      deltaPositive: true,
    },
    {
      key: 'error',
      label: 'Inbound engagement',
      value: '21.2%',
      status: 'healthy',
      statusLabel: 'Nominal',
      delta: '+1.5%',
      deltaPositive: true,
    },
    {
      key: 'latency',
      label: 'Inflection health',
      value: '96 / 100',
      status: 'healthy',
      statusLabel: 'Compliant',
      delta: '+4 pts',
      deltaPositive: true,
    },
    {
      key: 'availability',
      label: 'Autonomy ratio',
      value: '95.1%',
      status: 'healthy',
      statusLabel: '4.9% Escalated',
      delta: '+0.9%',
      deltaPositive: true,
    },
  ],
  development: [
    {
      key: 'health',
      label: 'Inbox placement',
      value: '98.2%',
      status: 'healthy',
      statusLabel: 'Good',
      delta: '-0.4%',
      deltaPositive: false,
    },
    {
      key: 'error',
      label: 'Inbound engagement',
      value: '18.6%',
      status: 'warning',
      statusLabel: 'Warmup',
      delta: '+0.8%',
      deltaPositive: true,
    },
    {
      key: 'latency',
      label: 'Inflection health',
      value: '91 / 100',
      status: 'warning',
      statusLabel: 'Audit Pending',
      delta: '-1 pt',
      deltaPositive: false,
    },
    {
      key: 'availability',
      label: 'Autonomy ratio',
      value: '89.0%',
      status: 'warning',
      statusLabel: '11.0% Escalated',
      delta: '-2.1%',
      deltaPositive: false,
    },
  ],
};

const SPARKLINES: Record<string, number[]> = {
  // prettier-ignore
  health: [97.6, 97.6, 97.7, 97.6, 98, 97.4, 96.5, 97.3, 97.3, 97, 97, 97.6, 96.8, 97.2, 91.7, 92.2, 95, 96.3, 96.5, 96.4, 96.8, 95.9, 96.7, 96.7, 96.4, 97.1, 97, 97, 96.1, 96.7, 96, 95.7, 96.9, 97.3, 96.1, 95.8, 96.9, 96.2, 96.6, 96.7, 97.2, 92.7, 96.5, 97.2, 96.5, 95.8, 96, 97.4, 96.8, 96.9, 96.4, 96.9, 97.3, 96.2, 97.3, 96.2, 97, 97.3, 89.5, 90.1, 91.8, 95.1, 96.4, 97.7, 97.2, 97.8, 97, 97.5, 97.1, 98, 96.8, 96.8, 97.7, 97.7, 96.8, 97.2, 93.2, 95.3, 97.2, 97.7, 97.3, 98.2, 97.6, 97.3, 97, 97.4, 96.5, 98, 96.9, 97.1, 96.5, 96.4, 97.6, 87.4, 90, 94.1, 97.1, 97.1, 97.5, 97.6, 96.9, 96.9, 96.8, 96.5, 95.8, 96.7, 96.7, 97.2, 91.7, 91.5, 92.3, 95.3, 96.9, 97.4, 96.8, 97.9, 97.5, 98.3, 97.9, 98.6],
  // prettier-ignore
  error: [0.62, 0.64, 0.98, 0.82, 0.86, 0.83, 1.02, 1.29, 1.24, 2.41, 1.57, 0.96, 0.91, 1.43, 1.36, 1.16, 1.33, 0.95, 1.18, 1.3, 1.48, 1.05, 1.41, 1.06, 1.03, 1.36, 1, 3.71, 2.85, 1.7, 1.41, 1.29, 1.35, 1.35, 1.19, 1.27, 1.2, 0.91, 0.95, 1.06, 1.26, 1.28, 1.19, 1.09, 2.21, 1.52, 0.83, 0.94, 1.17, 0.81, 1.11, 1.24, 1.18, 0.76, 1.09, 1.08, 1.22, 1.02, 1, 5.18, 4.39, 3.74, 2.23, 1, 1.3, 1.53, 1.42, 1.16, 1.18, 1.52, 1.45, 1.34, 3.13, 2.1, 1.66, 1.74, 1.69, 1.33, 1.43, 1.73, 1.73, 1.51, 1.63, 1.55, 1.56, 1.74, 2, 1.46, 5.44, 4.33, 2.3, 1.99, 1.77, 1.82, 1.98, 1.86, 1.88, 1.51, 1.42, 1.82, 1.71, 3.88, 2.22, 1.72, 1.65, 1.64, 1.42, 1.69, 1.39, 1.81, 1.66, 1.3, 1.32, 1.75, 6.22, 5.03, 2.35, 1.39, 1.25, 1.84],
  // prettier-ignore
  latency: [322, 371, 287, 357, 313, 353, 320, 617, 421, 363, 377, 399, 350, 401, 421, 420, 430, 365, 401, 797, 635, 477, 365, 412, 380, 421, 380, 411, 393, 401, 436, 378, 376, 569, 389, 419, 417, 342, 347, 376, 385, 347, 393, 328, 328, 367, 304, 871, 812, 707, 411, 317, 316, 367, 331, 320, 354, 349, 326, 309, 323, 631, 396, 306, 295, 293, 355, 334, 324, 372, 1012, 850, 489, 355, 324, 346, 353, 406, 365, 362, 377, 348, 437, 423, 664, 437, 397, 413, 402, 427, 404, 438, 491, 479, 447, 500, 440, 903, 776, 555, 476, 506, 439, 461, 502, 496, 485, 474, 470, 503, 1198, 1080, 930, 609, 456, 507, 426, 451, 427, 512],
  // prettier-ignore
  availability: [99.891, 99.956, 99.885, 99.964, 99.882, 99.92, 99.696, 99.897, 99.913, 99.948, 99.918, 99.942, 99.921, 99.928, 99.94, 99.902, 99.551, 99.853, 99.853, 99.891, 99.887, 99.926, 99.912, 99.911, 99.739, 99.873, 99.877, 99.85, 99.844, 99.895, 99.854, 99.851, 99.912, 99.426, 99.593, 99.821, 99.851, 99.928, 99.767, 99.852, 99.854, 99.866, 99.87, 99.929, 99.856, 99.925, 99.672, 99.882, 99.926, 99.865, 99.944, 99.941, 99.807, 99.91, 99.892, 99.922, 99.937, 99.338, 99.491, 99.743, 99.925, 99.871, 99.95, 99.909, 99.949, 99.687, 99.844, 99.911, 99.93, 99.882, 99.894, 99.536, 99.833, 99.867, 99.927, 99.88, 99.883, 99.926, 99.895, 99.653, 99.827, 99.906, 99.941, 99.893, 99.863, 99.916, 99.781, 99.885, 99.846, 99.896, 99.876, 99.485, 99.534, 99.738, 99.832, 99.241, 99.321, 99.422, 99.698, 99.828, 99.824, 99.837, 99.828, 99.61, 99.761, 99.878, 99.843, 99.845, 99.529, 99.75, 99.838, 99.83, 99.423, 99.728, 99.817, 99.827, 99.811, 99.871, 99.925, 99.98],
};

// ============= DRILL-DOWN ROWS (SWARM AGENT NODES) =============

export interface HostRow {
  id: string;
  service: string;
  environment: Environment;
  region: string;
  instances: number;
  rpm: number;
  errorRate: number;
  p99: number;
  status: HealthStatus;
}

const HOST_ROWS: HostRow[] = [
  {
    id: '1',
    service: 'dylan-inbound-drafter',
    environment: 'production',
    region: 'uk-institutional',
    instances: 24,
    rpm: 9240,
    errorRate: 0.2,
    p99: 180,
    status: 'healthy',
  },
  {
    id: '2',
    service: 'dylan-inbound-drafter',
    environment: 'production',
    region: 'us-family-offices',
    instances: 18,
    rpm: 6110,
    errorRate: 0.3,
    p99: 214,
    status: 'healthy',
  },
  {
    id: '3',
    service: 'dylan-inbound-drafter',
    environment: 'production',
    region: 'eu-private-wealth',
    instances: 12,
    rpm: 3980,
    errorRate: 0.1,
    p99: 236,
    status: 'healthy',
  },
  {
    id: '4',
    service: 'lead-prospector-swarm',
    environment: 'production',
    region: 'uk-institutional',
    instances: 16,
    rpm: 4120,
    errorRate: 0.4,
    p99: 280,
    status: 'healthy',
  },
  {
    id: '5',
    service: 'lead-prospector-swarm',
    environment: 'production',
    region: 'apac-high-net-worth',
    instances: 8,
    rpm: 2040,
    errorRate: 0.5,
    p99: 342,
    status: 'healthy',
  },
  {
    id: '6',
    service: 'conversation-classifier',
    environment: 'production',
    region: 'uk-institutional',
    instances: 20,
    rpm: 5310,
    errorRate: 0.2,
    p99: 140,
    status: 'healthy',
  },
  {
    id: '7',
    service: 'conversation-classifier',
    environment: 'production',
    region: 'eu-private-wealth',
    instances: 10,
    rpm: 2760,
    errorRate: 0.2,
    p99: 165,
    status: 'healthy',
  },
  {
    id: '8',
    service: 'deliverability-guard',
    environment: 'production',
    region: 'global-perimeter',
    instances: 30,
    rpm: 14820,
    errorRate: 0.0,
    p99: 45,
    status: 'healthy',
  },
  {
    id: '9',
    service: 'fca-liaison-perimeter',
    environment: 'production',
    region: 'uk-statutory',
    instances: 14,
    rpm: 4530,
    errorRate: 0.0,
    p99: 60,
    status: 'healthy',
  },
  {
    id: '10',
    service: 'imap-inbox-listener',
    environment: 'production',
    region: 'global-perimeter',
    instances: 6,
    rpm: 1210,
    errorRate: 0.1,
    p99: 95,
    status: 'healthy',
  },
  {
    id: '11',
    service: 'dylan-inbound-drafter',
    environment: 'staging',
    region: 'uk-institutional',
    instances: 3,
    rpm: 420,
    errorRate: 0.2,
    p99: 198,
    status: 'healthy',
  },
  {
    id: '12',
    service: 'lead-prospector-swarm',
    environment: 'staging',
    region: 'uk-institutional',
    instances: 2,
    rpm: 180,
    errorRate: 0.3,
    p99: 356,
    status: 'healthy',
  },
  {
    id: '13',
    service: 'dylan-inbound-drafter',
    environment: 'development',
    region: 'us-family-offices',
    instances: 1,
    rpm: 44,
    errorRate: 0.8,
    p99: 274,
    status: 'warning',
  },
  {
    id: '14',
    service: 'conversation-classifier',
    environment: 'development',
    region: 'us-family-offices',
    instances: 1,
    rpm: 38,
    errorRate: 1.2,
    p99: 310,
    status: 'warning',
  },
];

// ============= AGENT RECOMMENDED POINTS OF ACTION (INFLECTION ALERTS) =============

export type AlertState = 'firing' | 'acknowledged' | 'resolved';

export interface Alert {
  id: string;
  severity: HealthStatus;
  title: string;
  service: string;
  at: string;
  state: AlertState;
}

const ALERT_STATE_TOKEN: Record<
  AlertState,
  {label: string; color: 'red' | 'yellow' | 'green'}
> = {
  firing: {label: 'Actionable', color: 'red'},
  acknowledged: {label: 'Queued', color: 'yellow'},
  resolved: {label: 'Applied', color: 'green'},
};

const ALERTS: Alert[] = [
  {
    id: 'OPT-DRAFT-01',
    severity: 'critical',
    title: 'Secondary Outreach: Sector Clarification Bottleneck',
    service: 'Dylan Drafter · +18.4% Response Progression',
    at: '2026-11-01T15:10:00Z',
    state: 'firing',
  },
  {
    id: 'OPT-DISCLAIMER-02',
    severity: 'warning',
    title: 'Disclaimer Relocation: Relocate statutory perimeter to footer',
    service: 'Dylan Drafter · +11.2% Read-Through Rate',
    at: '2026-11-01T14:45:00Z',
    state: 'firing',
  },
  {
    id: 'OPT-DELIVERABILITY-03',
    severity: 'warning',
    title: 'Keyword Dampening: Suppress urgency tokens in cold drafts',
    service: 'Deliverability Guard · Zero Spam Flags (Domain 99.8%)',
    at: '2026-11-01T14:15:00Z',
    state: 'acknowledged',
  },
  {
    id: 'OPT-ROUTING-04',
    severity: 'critical',
    title: 'HNW Family Office: Auto-escalate >£5M leads to Dylan Broker',
    service: 'Conversation Classifier · +26.5% Meeting Velocity',
    at: '2026-11-01T13:30:00Z',
    state: 'firing',
  },
  {
    id: 'OPT-PROSPECTOR-05',
    severity: 'healthy',
    title: 'Prospector Swarm: Refresh UK family office registry batch',
    service: 'Lead Prospector · 949 Dossiers Indexed',
    at: '2026-11-01T12:00:00Z',
    state: 'acknowledged',
  },
  {
    id: 'OPT-GUARD-06',
    severity: 'healthy',
    title: 'RFC Multi-Domain Check: SPF/DKIM/DMARC 100% verified',
    service: 'Deliverability Guard · Full Passing State',
    at: '2026-11-01T10:20:00Z',
    state: 'resolved',
  },
];

const ALERT_ORDER: AlertState[] = ['firing', 'acknowledged', 'resolved'];

// ============= SHARED CHART PIECES =============

function LegendDot({color, label}: {color: string; label: string}) {
  const dotStyle: CSSProperties = {color};
  return (
    <HStack gap={2} vAlign="center">
      <Icon icon={StopIcon} size="xsm" style={dotStyle} />
      <Text type="supporting" color="secondary">
        {label}
      </Text>
    </HStack>
  );
}

interface TooltipEntry {
  name: string;
  value: number;
  color: string;
}

function ChartTooltip({
  active,
  payload,
  label,
  series,
  unit,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  label?: number;
  series: WindowSeries;
  unit: string;
}) {
  if (!active || !payload?.length) {
    return null;
  }
  const timeLabel =
    typeof label === 'number' ? (series.points[label]?.label ?? '') : '';
  return (
    <Card padding={3}>
      <VStack gap={1}>
        <Text type="supporting" color="secondary">
          {timeLabel}
        </Text>
        {payload.map(entry => (
          <LegendDot
            key={entry.name}
            color={entry.color}
            label={\`\${entry.name}: \${entry.value.toLocaleString()}\${unit}\`}
          />
        ))}
      </VStack>
    </Card>
  );
}

const AXIS_TICK = {
  fontSize: 'var(--font-size-sm, 12px)',
  fill: 'var(--color-text-secondary, #4E606F)',
};
const GRID_STROKE = 'var(--color-border, rgba(5, 54, 89, 0.1))';

const CHART_HEIGHT = 280;
const CHART_MARGIN = {top: 12, right: 16, left: 0, bottom: 4};
const Y_AXIS_WIDTH = 56;

const LINE_PROPS = {
  type: 'linear',
  strokeLinejoin: 'miter',
  strokeLinecap: 'butt',
  dot: false,
  isAnimationActive: false,
} as const;

// ============= CHART CARDS =============

interface ChartLine {
  key: MetricKey;
  name: string;
  color: string;
}

const BLUE = 'var(--color-data-categorical-blue, #0171E3)';
const ORANGE = 'var(--color-data-categorical-orange, #EB6E00)';
const PURPLE = 'var(--color-data-categorical-purple, #6B1EFD)';
const TEAL = 'var(--color-data-categorical-teal, #08A3A3)';

const LATENCY_LINES: ChartLine[] = [
  {key: 'p50', name: 'p50 median', color: BLUE},
  {key: 'p95', name: 'p95 generation', color: ORANGE},
  {key: 'p99', name: 'p99 turnaround', color: PURPLE},
];

const TRAFFIC_LINES: ChartLine[] = [
  {key: 'useast', name: 'Private Equity & Growth', color: BLUE},
  {key: 'uswest', name: 'Family Offices & UHNW', color: TEAL},
  {key: 'euwest', name: 'Precious Metals & Funds', color: ORANGE},
];

function MetricChart({
  title,
  subtitle,
  series,
  lines,
  scale,
  unit,
  hasAxisUnit = false,
}: {
  title: string;
  subtitle: string;
  series: WindowSeries;
  lines: ChartLine[];
  scale: number;
  unit: string;
  hasAxisUnit?: boolean;
}) {
  const data = useMemo(
    () =>
      series.points.map(point => {
        const row: Record<string, number> = {t: point.t};
        for (const line of lines) {
          row[line.key] = Math.round(point[line.key] * scale);
        }
        return row;
      }),
    [series, lines, scale],
  );

  return (
    <Card padding={6}>
      <VStack gap={4}>
        <VStack gap={1}>
          <Heading level={3}>{title}</Heading>
          <Text type="supporting" color="secondary">
            {subtitle}
          </Text>
        </VStack>
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={data} margin={CHART_MARGIN}>
            <CartesianGrid horizontal vertical={false} stroke={GRID_STROKE} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[0, series.points.length - 1]}
              ticks={series.ticks}
              tickFormatter={(v: number) => series.tickLabels[v] ?? ''}
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={AXIS_TICK}
              axisLine={false}
              tickLine={false}
              width={Y_AXIS_WIDTH}
              unit={hasAxisUnit ? unit : undefined}
            />
            <Tooltip
              content={<ChartTooltip series={series} unit={unit} />}
              cursor={{stroke: GRID_STROKE}}
            />
            {lines.map(line => (
              <Line
                {...LINE_PROPS}
                key={line.key}
                dataKey={line.key}
                name={line.name}
                stroke={line.color}
                strokeWidth={1.5}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
        <HStack gap={6} vAlign="center" wrap="wrap">
          {lines.map(line => (
            <LegendDot key={line.key} color={line.color} label={line.name} />
          ))}
        </HStack>
      </VStack>
    </Card>
  );
}

// ============= KPI TILE =============

function Sparkline({data, color}: {data: number[]; color: string}) {
  const chartData = data.map((v, i) => ({i, v}));
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart
        data={chartData}
        margin={{top: 4, right: 0, left: 0, bottom: 2}}>
        <YAxis hide domain={['dataMin', 'dataMax']} />
        <Line {...LINE_PROPS} dataKey="v" stroke={color} strokeWidth={1.25} />
      </LineChart>
    </ResponsiveContainer>
  );
}

function KpiTile({kpi, spark}: {kpi: Kpi; spark: number[]}) {
  return (
    <Card padding={4}>
      <VStack gap={2}>
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={STATUS_DOT[kpi.status]}
            label={kpi.statusLabel}
            tooltip={kpi.statusLabel}
            isPulsing={kpi.status === 'critical'}
          />
          <Text type="label" color="secondary">
            {kpi.label}
          </Text>
        </HStack>
        <HStack gap={2} vAlign="center">
          <Heading level={2}>{kpi.value}</Heading>
          <HStack gap={1} vAlign="center">
            <Icon
              icon={kpi.deltaPositive ? ArrowUpIcon : ArrowDownIcon}
              size="xsm"
              color={kpi.deltaPositive ? 'success' : 'error'}
            />
            <Text type="supporting" color="secondary">
              {kpi.delta}
            </Text>
          </HStack>
        </HStack>
        <Sparkline data={spark} color={STATUS_STROKE[kpi.status]} />
      </VStack>
    </Card>
  );
}

// ============= RAIL SECTIONS =============

const railStyles = {
  header: {
    backgroundColor: 'var(--color-background-muted, rgba(255, 255, 255, 0.03))',
  },
  stickyHeader: {
    position: 'sticky' as const,
    top: 0,
    zIndex: 1,
    backgroundColor: 'var(--color-background-surface, var(--surface, #111))',
  },
};

function RailSection({
  icon,
  iconColor,
  title,
  subtitle,
  badge,
  hasStickyHeader = false,
  children,
}: {
  icon: IconType;
  iconColor: 'error' | 'secondary';
  title: string;
  subtitle: string;
  badge: ReactNode;
  hasStickyHeader?: boolean;
  children: ReactNode;
}) {
  return (
    <VStack gap={0}>
      <VStack
        gap={0}
        style={hasStickyHeader ? railStyles.stickyHeader : undefined}>
        <VStack gap={1} padding={4} style={railStyles.header}>
          <HStack gap={2} vAlign="center">
            <Icon icon={icon} size="sm" color={iconColor} />
            <StackItem size="fill">
              <Heading level={3}>{title}</Heading>
            </StackItem>
            {badge}
          </HStack>
          <Text type="supporting" color="secondary">
            {subtitle}
          </Text>
        </VStack>
        <Divider />
      </VStack>
      {children}
    </VStack>
  );
}

// ============= ALERTS FEED (AGENT RECOMMENDED POINTS OF ACTION) =============

function AlertsFeed({hasStickyHeader = false}: {hasStickyHeader?: boolean}) {
  const groups = ALERT_ORDER.map(state => ({
    state,
    items: ALERTS.filter(a => a.state === state),
  })).filter(g => g.items.length > 0);

  const firing = ALERTS.filter(a => a.state === 'firing').length;

  return (
    <RailSection
      icon={BellAlertIcon}
      iconColor={firing > 0 ? 'error' : 'secondary'}
      title="Agent Recommended Points of Action"
      subtitle={\`\${ALERTS.length} inflection recommendations · prioritized by impact\`}
      badge={
        <Badge
          label={\`\${firing} actionable\`}
          variant={firing > 0 ? 'error' : 'neutral'}
        />
      }
      hasStickyHeader={hasStickyHeader}>
      {groups.length === 0 ? (
        <EmptyState
          title="All optimized"
          description="No pending points of action across the selected environment."
          icon={<Icon icon={CheckCircleIcon} size="lg" color="success" />}
          isCompact
        />
      ) : (
        groups.map(group => (
          <List key={group.state} density="compact" hasDividers>
            {group.items.map(alert => (
              <ListItem
                key={alert.id}
                label={alert.title}
                description={alert.service}
                startContent={
                  <StatusDot
                    variant={STATUS_DOT[alert.severity]}
                    label={alert.severity}
                    isPulsing={
                      alert.state === 'firing' && alert.severity === 'critical'
                    }
                  />
                }
                endContent={
                  <VStack gap={1} hAlign="end">
                    <Token
                      size="sm"
                      color={ALERT_STATE_TOKEN[alert.state].color}
                      label={ALERT_STATE_TOKEN[alert.state].label}
                    />
                    <Timestamp
                      value={alert.at}
                      format="relative"
                      color="secondary"
                    />
                  </VStack>
                }
              />
            ))}
          </List>
        ))
      )}
    </RailSection>
  );
}

// ============= SERVICE BREAKDOWN (SWARM AGENT BREAKDOWN) =============

function formatRpm(rpm: number): string {
  return rpm >= 1000 ? \`\${(rpm / 1000).toFixed(1)}k rpm\` : \`\${rpm} rpm\`;
}

function NoServices() {
  return (
    <EmptyState
      title="No agents active in this sector"
      description="Nothing reports in the selected sector and region. Try widening the sector filter."
      icon={<Icon icon={ServerStackIcon} size="lg" />}
      isCompact
    />
  );
}

function ServiceBreakdown({
  rows,
  contextLabel,
  hasStickyHeader = false,
}: {
  rows: HostRow[];
  contextLabel: string;
  hasStickyHeader?: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) =>
          SEVERITY_RANK[a.status] - SEVERITY_RANK[b.status] ||
          b.errorRate - a.errorRate,
      ),
    [rows],
  );

  return (
    <RailSection
      icon={ServerStackIcon}
      iconColor="secondary"
      title="Swarm Agent Breakdown"
      subtitle={contextLabel}
      badge={<Badge label={\`\${rows.length} agents\`} variant="neutral" />}
      hasStickyHeader={hasStickyHeader}>
      {sorted.length === 0 ? (
        <NoServices />
      ) : (
        <List density="compact" hasDividers>
          {sorted.map(row => (
            <ListItem
              key={row.id}
              label={row.service}
              description={\`\${row.region} · \${row.instances} nodes · \${formatRpm(row.rpm)}\`}
              startContent={
                <StatusDot
                  variant={STATUS_DOT[row.status]}
                  label={STATUS_LABEL[row.status]}
                  isPulsing={row.status === 'critical'}
                />
              }
              endContent={
                <VStack gap={1} hAlign="end">
                  <HStack gap={1} vAlign="center">
                    <Text type="supporting" color="secondary">
                      p99
                    </Text>
                    <Text type="body" weight="semibold">
                      {row.p99} ms
                    </Text>
                  </HStack>
                  <Text type="supporting" color="secondary">
                    {row.errorRate.toFixed(1)}% err
                  </Text>
                </VStack>
              }
            />
          ))}
        </List>
      )}
    </RailSection>
  );
}

// ============= UPTIME ROSTER (AGENT HEALTH ROSTER) =============

const UPTIME_DAYS = 90;

type DayStatus = 'operational' | 'degraded' | 'down';

interface ServiceUptime {
  service: string;
  uptime: number;
  status: HealthStatus;
  days: DayStatus[];
  degradedDays: number;
  downDays: number;
}

const UPTIME_ORDER: DayStatus[] = ['operational', 'degraded', 'down'];

const UPTIME_COLOR: Record<DayStatus, string> = {
  operational: 'var(--color-success, #0D8626)',
  degraded: 'var(--color-warning, #E9AF08)',
  down: 'var(--color-error, #E3193B)',
};

const UPTIME_LABEL: Record<DayStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
};

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function buildUptime(
  service: string,
  environment: Environment,
  worstStatus: HealthStatus,
): ServiceUptime {
  const seed = hashString(\`\${service}:\${environment}\`);
  const days: DayStatus[] = [];
  let degradedDays = 0;
  let downDays = 0;

  const outageLikelihood: Record<Environment, number> = {
    production: 0.02,
    staging: 0.04,
    development: 0.08,
  };
  const baseRate = outageLikelihood[environment];

  for (let i = 0; i < UPTIME_DAYS; i++) {
    const r = hashNoise(i, seed);
    let status: DayStatus = 'operational';
    if (r < baseRate * 0.3) {
      status = 'down';
      downDays++;
    } else if (r < baseRate) {
      status = 'degraded';
      degradedDays++;
    }
    days.push(status);
  }

  const todayIndex = UPTIME_DAYS - 1;
  const todayDayStatus: Record<HealthStatus, DayStatus> = {
    healthy: 'operational',
    warning: 'degraded',
    critical: 'down',
  };
  const forcedToday = todayDayStatus[worstStatus];
  if (days[todayIndex] !== forcedToday) {
    if (days[todayIndex] === 'down') downDays--;
    if (days[todayIndex] === 'degraded') degradedDays--;
    days[todayIndex] = forcedToday;
    if (forcedToday === 'down') downDays++;
    if (forcedToday === 'degraded') degradedDays++;
  }

  const uptime = ((UPTIME_DAYS - downDays - degradedDays * 0.5) / UPTIME_DAYS) * 100;
  return {service, uptime, status: worstStatus, days, degradedDays, downDays};
}

function dayLabel(i: number): string {
  const ago = UPTIME_DAYS - 1 - i;
  if (ago === 0) {
    return 'Today';
  }
  return ago === 1 ? 'Yesterday' : \`\${ago} days ago\`;
}

const uptimeStyles = {
  strip: {
    display: 'flex',
    gap: '2px',
    overflowX: 'auto' as const,
    overscrollBehaviorX: 'contain' as const,
    scrollbarWidth: 'thin' as const,
  },
  bar: {
    flexBasis: 0,
    flexGrow: 1,
    minWidth: '3px',
    height: '30px',
  },
  operational: {backgroundColor: 'var(--color-success, #0D8626)'},
  degraded: {backgroundColor: 'var(--color-warning, #E9AF08)'},
  down: {backgroundColor: 'var(--color-error, #E3193B)'},
};

function UptimeStrip({entry}: {entry: ServiceUptime}) {
  const summary =
    entry.downDays === 0 && entry.degradedDays === 0
      ? \`\${UPTIME_DAYS}-day operating stability for \${entry.service}: no degradation.\`
      : \`\${UPTIME_DAYS}-day operating stability for \${entry.service}: \${entry.degradedDays} degraded \${
          entry.degradedDays === 1 ? 'day' : 'days'
        }, \${entry.downDays} downtime.\`;

  return (
    <div style={uptimeStyles.strip} role="img" aria-label={summary}>
      {entry.days.map((day, i) => (
        <div
          key={i}
          style={{...uptimeStyles.bar, ...uptimeStyles[day]}}
          title={\`\${dayLabel(i)} — \${UPTIME_LABEL[day]}\`}
        />
      ))}
    </div>
  );
}

function UptimeRow({entry}: {entry: ServiceUptime}) {
  return (
    <VStack gap={2}>
      <HStack gap={3} vAlign="center" hAlign="between">
        <HStack gap={2} vAlign="center">
          <StatusDot
            variant={STATUS_DOT[entry.status]}
            label={STATUS_LABEL[entry.status]}
            isPulsing={entry.status === 'critical'}
          />
          <Heading level={4}>{entry.service}</Heading>
        </HStack>
        <Text type="supporting" color="secondary">
          {entry.uptime.toFixed(2)}% reliability
        </Text>
      </HStack>
      <UptimeStrip entry={entry} />
    </VStack>
  );
}

function AllServicesUptime({
  rows,
  environment,
  contextLabel,
}: {
  rows: HostRow[];
  environment: Environment;
  contextLabel: string;
}) {
  const entries = useMemo(() => {
    const worst = new Map<string, HealthStatus>();
    for (const row of rows) {
      const prev = worst.get(row.service);
      if (
        prev === undefined ||
        SEVERITY_RANK[row.status] < SEVERITY_RANK[prev]
      ) {
        worst.set(row.service, row.status);
      }
    }
    return [...worst.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([service, status]) => buildUptime(service, environment, status));
  }, [rows, environment]);

  return (
    <VStack gap={6}>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <VStack>
          <Heading level={2}>Swarm Services & Component Roster</Heading>
          <Text type="supporting" color="secondary">
            Continuous operating health & compliance verification over the last {UPTIME_DAYS} days · {contextLabel}
          </Text>
        </VStack>
        <HStack gap={4} vAlign="center" wrap="wrap">
          {UPTIME_ORDER.map(state => (
            <LegendDot
              key={state}
              color={UPTIME_COLOR[state]}
              label={UPTIME_LABEL[state]}
            />
          ))}
        </HStack>
      </HStack>
      <Card padding={6}>
        {entries.length === 0 ? (
          <NoServices />
        ) : (
          <VStack gap={6}>
            {entries.map((entry, index) => (
              <Fragment key={entry.service}>
                {index > 0 && <Divider />}
                <UptimeRow entry={entry} />
              </Fragment>
            ))}
          </VStack>
        )}
      </Card>
    </VStack>
  );
}

// ============= CONTROL OPTIONS =============

const ENV_OPTIONS = [
  {value: 'production', label: 'Live Outreach'},
  {value: 'staging', label: 'Warmup Mode'},
  {value: 'development', label: 'Evaluation Swarm'},
];

const REGION_OPTIONS = [
  {value: 'all', label: 'All Sectors & Cohorts'},
  {value: 'uk-institutional', label: 'UK Institutional'},
  {value: 'us-family-offices', label: 'US Family Offices'},
  {value: 'eu-private-wealth', label: 'EU Private Wealth'},
  {value: 'apac-high-net-worth', label: 'APAC High-Net-Worth'},
  {value: 'global-perimeter', label: 'Global Security Perimeter'},
  {value: 'uk-statutory', label: 'UK Statutory Liaison'},
];

const SPARK_LEN: Record<TimeWindow, number> = {'1h': 60, '1d': 90, '7d': 120};

// ============= MAIN COMPONENT EXPORT =============

export interface DashboardAlertRailViewProps {
  height?: string | number;
  onComplete?: () => Promise<void> | void;
}

export function DashboardAlertRailView({
  height = '880px',
  onComplete,
}: DashboardAlertRailViewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1d');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [region, setRegion] = useState('all');

  const isNarrow = useMediaQuery('(max-width: 1024px)');

  const series = SERIES[timeWindow];
  const kpis = KPI_BY_ENV[environment];
  const sparkLen = SPARK_LEN[timeWindow];

  const rows = useMemo(
    () =>
      HOST_ROWS.filter(
        r =>
          r.environment === environment &&
          (region === 'all' || r.region === region),
      ),
    [environment, region],
  );

  const breakdownContext = \`\${ENV_OPTIONS.find(e => e.value === environment)?.label} · \${REGION_OPTIONS.find(r => r.value === region)?.label}\`;

  const layoutStyle: CSSProperties = {
    height: typeof height === 'number' ? \`\${height}px\` : height,
    margin: height === '100dvh' ? undefined : '0 32px',
    background: 'var(--surface, #111)',
    border: '1px solid var(--border)',
    borderRadius: height === '100dvh' ? 0 : '10px',
    overflow: 'hidden',
  };

  return (
    <Layout
      height="fill"
      style={layoutStyle}
      header={
        <LayoutHeader padding={6} hasDivider>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={0} vAlign="center">
              <Heading level={1}>ASP Agent Outreach OS & Inflection Monitor</Heading>
              <HStack gap={2} vAlign="center">
                <StatusDot
                  variant="success"
                  label="Live Telemetry"
                  isPulsing
                  tooltip="Auto-refreshing live agent telemetry stream"
                />
                <Text type="supporting" color="secondary">
                  Live Swarm Telemetry · Updated Just now
                </Text>
              </HStack>
            </VStack>
            <HStack gap={2} vAlign="center">
              <SegmentedControl
                label="Time window"
                value={timeWindow}
                onChange={value => setTimeWindow(value as TimeWindow)}
                size="lg">
                <SegmentedControlItem label="1h" value="1h" />
                <SegmentedControlItem label="1d" value="1d" />
                <SegmentedControlItem label="7d" value="7d" />
              </SegmentedControl>
              <Selector
                label="Environment"
                isLabelHidden
                size="lg"
                options={ENV_OPTIONS}
                value={environment}
                onChange={value => setEnvironment(value as Environment)}
              />
              <Selector
                label="Region"
                isLabelHidden
                size="lg"
                options={REGION_OPTIONS}
                value={region}
                onChange={setRegion}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={6}>
          <VStack gap={10}>
            <VStack gap={6}>
              {/* Traffic-light KPI tiles */}
              <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={3}>
                {kpis.map(kpi => (
                  <KpiTile
                    key={kpi.key}
                    kpi={kpi}
                    spark={SPARKLINES[kpi.key].slice(-sparkLen)}
                  />
                ))}
              </Grid>

              {/* Time-series charts */}
              <Grid columns={{minWidth: 320, repeat: 'fit'}} gap={3}>
                <MetricChart
                  title="Agent Drafting & Response Latency"
                  subtitle="Turnaround velocity across Dylan Drafter & Classifier (s)"
                  series={series}
                  lines={LATENCY_LINES}
                  scale={ENV_LATENCY_FACTOR[environment]}
                  unit=" s"
                  hasAxisUnit
                />
                <MetricChart
                  title="Outreach Engagement by Asset Sector"
                  subtitle="Inbound conversations and message flow per minute"
                  series={series}
                  lines={TRAFFIC_LINES}
                  scale={ENV_FACTOR[environment]}
                  unit=" msg"
                />
              </Grid>
            </VStack>

            <Divider />

            {/* 90-day uptime roster */}
            <AllServicesUptime
              rows={rows}
              environment={environment}
              contextLabel={breakdownContext}
            />

            {/* Below 1024px the rail folds in here, one card per section */}
            {isNarrow && (
              <VStack gap={4}>
                <Card padding={0}>
                  <AlertsFeed />
                </Card>
                <Card padding={0}>
                  <ServiceBreakdown
                    rows={rows}
                    contextLabel={breakdownContext}
                  />
                </Card>
              </VStack>
            )}
          </VStack>
        </LayoutContent>
      }
      end={
        isNarrow ? undefined : (
          <LayoutPanel
            width={400}
            padding={0}
            hasDivider
            role="complementary"
            label="Agent recommended points of action and swarm breakdown"
            isScrollable>
            <VStack gap={0}>
              <AlertsFeed hasStickyHeader />
              <Divider />
              <ServiceBreakdown
                rows={rows}
                contextLabel={breakdownContext}
                hasStickyHeader
              />
            </VStack>
          </LayoutPanel>
        )
      }
    />
  );
}

export default function DashboardAlertRailPage() {
  return <DashboardAlertRailView height="100dvh" />;
}
`;

fs.writeFileSync('src/app/dashboard-alert-rail/page.tsx', content, 'utf8');
console.log('Successfully wrote src/app/dashboard-alert-rail/page.tsx');

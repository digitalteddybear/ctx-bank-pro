// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * ASP Agent Outreach OS & Inflection Monitor — live-ops agent analytics with a triage rail.
 *
 * Content-only (root `Layout`); the host supplies the app shell. Frame:
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
  useCallback,
  useEffect,
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
import {z} from 'zod';
import {Button} from '@/components/ui/primitives';
import {requestBackendSync, useBackendRefresh} from '@/lib/backend-sync';

// ============= TYPES =============

export type TimeWindow = '1h' | '1d' | '7d';
export type Environment = 'production' | 'staging' | 'development';
export type HealthStatus = 'healthy' | 'warning' | 'critical';
export type MetricKey = 'p50' | 'p95' | 'p99' | 'useast' | 'uswest' | 'euwest';
const telemetrySchema = z.object({generatedAt:z.string(),networkStatus:z.string(),kpis:z.array(z.object({key:z.string(),label:z.string(),value:z.string(),status:z.enum(['healthy','warning','critical']),statusLabel:z.string(),delta:z.string(),deltaPositive:z.boolean()})),series:z.object({points:z.array(z.object({t:z.number(),label:z.string(),p50:z.number(),p95:z.number(),p99:z.number(),useast:z.number(),uswest:z.number(),euwest:z.number()})),ticks:z.array(z.number()),tickLabels:z.record(z.string(),z.string())}),hosts:z.array(z.object({id:z.string(),service:z.string(),environment:z.enum(['production','staging','development']),region:z.string(),instances:z.number(),rpm:z.number(),errorRate:z.number(),p99:z.number(),status:z.enum(['healthy','warning','critical']),heartbeat:z.string().nullable()})),alerts:z.array(z.object({id:z.string(),severity:z.enum(['healthy','warning','critical']),title:z.string(),service:z.string(),state:z.enum(['firing','acknowledged','resolved']),at:z.string()})),bookingAudit:z.array(z.object({runId:z.string(),contactId:z.string(),bookingId:z.string(),startsAt:z.string(),at:z.string(),crmStatus:z.string(),crmNote:z.string()})).default([]),totals:z.object({runs:z.number(),delivered:z.number(),inbound:z.number(),errors:z.number()}),heartbeat:z.string().nullable()});

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
            label={`${entry.name}: ${entry.value.toLocaleString()}${unit}`}
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
    <Card padding={4}>
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

function AlertsFeed({alerts, onApply, hasStickyHeader = false}: {alerts: Alert[]; onApply: (alert: Alert) => void; hasStickyHeader?: boolean}) {
  const groups = ALERT_ORDER.map(state => ({
    state,
    items: alerts.filter(a => a.state === state),
  })).filter(g => g.items.length > 0);

  const firing = alerts.filter(a => a.state === 'firing').length;

  return (
    <RailSection
      icon={BellAlertIcon}
      iconColor={firing > 0 ? 'error' : 'secondary'}
      title="Agent Recommended Points of Action"
      subtitle={`${alerts.length} inflection recommendations · prioritized by impact`}
      badge={
        <Badge
          label={`${firing} actionable`}
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
                    {alert.state === 'firing' && <Button size="sm" variant="secondary" onClick={() => onApply(alert)}>Apply</Button>}
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
  return rpm >= 1000 ? `${(rpm / 1000).toFixed(1)}k rpm` : `${rpm} rpm`;
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
      badge={<Badge label={`${rows.length} agents`} variant="neutral" />}
      hasStickyHeader={hasStickyHeader}>
      {sorted.length === 0 ? (
        <NoServices />
      ) : (
        <List density="compact" hasDividers>
          {sorted.map(row => (
            <ListItem
              key={row.id}
              label={row.service}
              description={`${row.region} · ${row.instances} nodes · ${formatRpm(row.rpm)}`}
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

type DayStatus = 'operational' | 'degraded' | 'down' | 'unknown';

interface ServiceUptime {
  service: string;
  uptime: number | null;
  status: HealthStatus;
  days: DayStatus[];
  degradedDays: number;
  downDays: number;
}

const UPTIME_ORDER: DayStatus[] = ['operational', 'degraded', 'down', 'unknown'];

const UPTIME_COLOR: Record<DayStatus, string> = {
  operational: 'var(--color-success, #0D8626)',
  degraded: 'var(--color-warning, #E9AF08)',
  down: 'var(--color-error, #E3193B)',
  unknown: 'var(--color-border, #34363a)',
};

const UPTIME_LABEL: Record<DayStatus, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  unknown: 'No telemetry',
};

function buildUptime(service: string, status: HealthStatus): ServiceUptime {
  const days: DayStatus[] = Array.from({length: UPTIME_DAYS - 1}, () => 'unknown');
  const current: Record<HealthStatus, DayStatus> = {healthy:'operational',warning:'degraded',critical:'down'};
  days.push(current[status]);
  return {service, uptime: null, status, days, degradedDays: status === 'warning' ? 1 : 0, downDays: status === 'critical' ? 1 : 0};
}

function dayLabel(i: number): string {
  const ago = UPTIME_DAYS - 1 - i;
  if (ago === 0) {
    return 'Today';
  }
  return ago === 1 ? 'Yesterday' : `${ago} days ago`;
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
  unknown: {backgroundColor: 'var(--color-border, #34363a)'},
};

function UptimeStrip({entry}: {entry: ServiceUptime}) {
  const summary = `Current status for ${entry.service}; historical daily telemetry is not available.`;

  return (
    <div style={uptimeStyles.strip} role="img" aria-label={summary}>
      {entry.days.map((day, i) => (
        <div
          key={i}
          style={{...uptimeStyles.bar, ...uptimeStyles[day]}}
          title={`${dayLabel(i)} — ${UPTIME_LABEL[day]}`}
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
          {entry.uptime === null ? 'Historical reliability unavailable' : `${entry.uptime.toFixed(2)}% reliability`}
        </Text>
      </HStack>
      <UptimeStrip entry={entry} />
    </VStack>
  );
}

function AllServicesUptime({
  rows,
  contextLabel,
}: {
  rows: HostRow[];
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
      .map(([service, status]) => buildUptime(service, status));
  }, [rows]);

  return (
    <VStack gap={6}>
      <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
        <VStack>
          <Heading level={2}>Swarm Services & Component Roster</Heading>
          <Text type="supporting" color="secondary">
            Live status from outreach runs · no historical uptime telemetry recorded · {contextLabel}
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
      <Card padding={4}>
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

// ============= MAIN COMPONENT EXPORT =============

export interface DashboardAlertRailViewProps {
  height?: string | number;
  onComplete?: () => Promise<void> | void;
}

export function DashboardAlertRailView({height = '880px'}: DashboardAlertRailViewProps) {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('1d');
  const [environment, setEnvironment] = useState<Environment>('production');
  const [region, setRegion] = useState('all');
  const [telemetry, setTelemetry] = useState<z.infer<typeof telemetrySchema> | null>(null);
  const [networkStatus, setNetworkStatus] = useState<'loading' | 'connected' | 'error'>('loading');

  const isNarrow = useMediaQuery('(max-width: 1024px)');
  const refresh = useCallback(async () => {
    setNetworkStatus('loading');
    try {
      const query = new URLSearchParams({window:timeWindow,environment,region});
      const response = await fetch(`/api/agents/telemetry?${query}`, {cache:'no-store'});
      if (!response.ok) throw new Error(`Telemetry request failed (${response.status})`);
      const payload: unknown = await response.json();
      setTelemetry(telemetrySchema.parse(payload));
      setNetworkStatus('connected');
    } catch {
      setNetworkStatus('error');
    }
  }, [environment, region, timeWindow]);
  useEffect(() => { void refresh(); }, [refresh]);
  useBackendRefresh(refresh);

  const series: WindowSeries = telemetry?.series ?? {points:[],ticks:[],tickLabels:{}};
  const kpis = telemetry?.kpis ?? [];
  const rows = telemetry?.hosts ?? [];
  const alerts = telemetry?.alerts ?? [];
  const bookingAudit = telemetry?.bookingAudit ?? [];
  const applyAlert = useCallback(async (alert: Alert) => {
    setTelemetry(current => current ? {...current, alerts:current.alerts.map(item => item.id === alert.id ? {...item,state:'resolved'} : item)} : current);
    try {
      const response = await fetch('/api/agents', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'apply-inflection-action',alertId:alert.id,resolution:'applied'})});
      if (!response.ok) throw new Error('Unable to apply inflection action');
      requestBackendSync();
    } catch {
      setTelemetry(current => current ? {...current,alerts:current.alerts.map(item => item.id === alert.id ? {...item,state:'firing'} : item)} : current);
      setNetworkStatus('error');
    }
  }, []);

  const breakdownContext = `${ENV_OPTIONS.find(e => e.value === environment)?.label} · ${REGION_OPTIONS.find(r => r.value === region)?.label}`;

  const layoutStyle: CSSProperties = {
    height: typeof height === 'number' ? `${height}px` : height,
    margin: 0,
    width: '100%',
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
        <LayoutHeader padding={4} hasDivider>
          <HStack gap={3} vAlign="center" hAlign="between" wrap="wrap">
            <VStack gap={0} vAlign="center">
              <Heading level={1}>ASP Agent Outreach OS & Inflection Monitor</Heading>
              <HStack gap={2} vAlign="center">
                <StatusDot variant={networkStatus === 'connected' ? 'success' : networkStatus === 'error' ? 'error' : 'warning'} label={networkStatus === 'connected' ? 'Live Telemetry' : networkStatus === 'error' ? 'Telemetry unavailable' : 'Connecting'} isPulsing={networkStatus === 'loading'} tooltip="Status of the live outreach telemetry request" />
                <Text type="supporting" color="secondary">
                  Live Swarm Telemetry · {telemetry ? `Updated ${new Date(telemetry.generatedAt).toLocaleTimeString()}` : networkStatus === 'error' ? 'Connection error' : 'Loading'}
                </Text>
              </HStack>
            </VStack>
            <HStack gap={2} vAlign="center">
              <SegmentedControl
                label="Time window"
                value={timeWindow}
                onChange={value => setTimeWindow(value as TimeWindow)}
                size="sm">
                <SegmentedControlItem label="1h" value="1h" />
                <SegmentedControlItem label="1d" value="1d" />
                <SegmentedControlItem label="7d" value="7d" />
              </SegmentedControl>
              <Selector
                label="Environment"
                isLabelHidden
                size="sm"
                options={ENV_OPTIONS}
                value={environment}
                onChange={value => setEnvironment(value as Environment)}
              />
              <Selector
                label="Region"
                isLabelHidden
                size="sm"
                options={REGION_OPTIONS}
                value={region}
                onChange={setRegion}
              />
            </HStack>
          </HStack>
        </LayoutHeader>
      }
      content={
        <LayoutContent padding={4}>
          <VStack gap={10}>
            <VStack gap={6}>
              {/* Traffic-light KPI tiles */}
              <Grid columns={{minWidth: 240, repeat: 'fit'}} gap={3}>
                {kpis.map(kpi => (
                  <KpiTile
                    key={kpi.key}
                    kpi={kpi}
                    spark={series.points.slice(-24).map(point => kpi.key === 'latency' ? point.p95 : kpi.key === 'health' ? point.useast : kpi.key === 'error' ? point.uswest : point.euwest)}
                  />
                ))}
              </Grid>

              <Card padding={4}>
                <VStack gap={3}>
                  <HStack gap={2} vAlign="center" hAlign="between">
                    <Heading level={2}>Booking audit</Heading>
                    <Badge label={`${bookingAudit.length} confirmed`} variant={bookingAudit.length ? 'success' : 'neutral'} />
                  </HStack>
                  {bookingAudit.length ? bookingAudit.map(item => (
                    <HStack key={`${item.runId}:${item.bookingId}`} gap={3} vAlign="center" hAlign="between" wrap="wrap">
                      <VStack gap={0.5}>
                        <Text type="label">Contact {item.contactId}</Text>
                        <Text type="supporting" color="secondary">{new Date(item.startsAt).toLocaleString()} · Cal booking {item.bookingId}</Text>
                      </VStack>
                      <Text type="supporting" color="secondary">CRM status: {item.crmStatus} · Note: {item.crmNote}</Text>
                    </HStack>
                  )) : <Text type="supporting" color="secondary">No confirmed Cal.com bookings in this window. Commission attribution is not configured.</Text>}
                </VStack>
              </Card>

              {/* Time-series charts */}
              <Grid columns={{minWidth: 320, repeat: 'fit'}} gap={3}>
                <MetricChart
                  title="Agent Drafting & Response Latency"
                  subtitle="Observed execution latency across outreach workflow events (ms)"
                  series={series}
                  lines={LATENCY_LINES}
                  scale={1}
                  unit=" ms"
                  hasAxisUnit
                />
                <MetricChart
                  title="Outreach Engagement by Asset Sector"
                  subtitle="Observed inbound prospect replies by asset sector"
                  series={series}
                  lines={TRAFFIC_LINES}
                  scale={1}
                  unit=" msg"
                />
              </Grid>
            </VStack>

            <Divider />

            {/* 90-day uptime roster */}
            <AllServicesUptime
              rows={rows}
              contextLabel={breakdownContext}
            />

            {/* Below 1024px the rail folds in here, one card per section */}
            {isNarrow && (
              <VStack gap={4}>
                <Card padding={0}>
                  <AlertsFeed alerts={alerts} onApply={applyAlert} />
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
              <AlertsFeed alerts={alerts} onApply={applyAlert} hasStickyHeader />
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

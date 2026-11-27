<template>
  <div>
    <div v-if="isEmpty" class="text-sm text-gray-500 dark:text-neutral-400">
      {{ $t('client.trafficEmpty') }}
    </div>
    <BaseChart v-else :options="chartOptions" :series="series" />
    <div class="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-sm">
      <span>
        {{ $t('client.trafficToday') }}:
        <span class="font-medium">{{ bytes(today.tx) }}</span> /
        <span class="font-medium">{{ bytes(today.rx) }}</span>
      </span>
      <span>
        {{ $t('client.trafficPeriod') }}:
        <span class="font-medium">{{ bytes(period.tx) }}</span> /
        <span class="font-medium">{{ bytes(period.rx) }}</span>
      </span>
      <span>
        {{ $t('client.trafficAllTime') }}:
        <span class="font-medium">{{ bytes(totals.tx) }}</span> /
        <span class="font-medium">{{ bytes(totals.rx) }}</span>
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ApexOptions } from 'apexcharts';

const props = defineProps<{
  clientId: string;
}>();

const { t } = useI18n();
const theme = useTheme();

const { data } = await useFetch(`/api/client/${props.clientId}/traffic`, {
  query: { days: 30 },
  method: 'get',
});

type DayRow = { date: string; tx: number; rx: number };

const history = computed<DayRow[]>(() =>
  [...(data.value?.history ?? [])].sort((a, b) => a.date.localeCompare(b.date))
);

const totals = computed(() => data.value?.totals ?? { tx: 0, rx: 0 });

const todayDate = new Date().toISOString().slice(0, 10);

const today = computed(() => {
  const row = history.value.find((day) => day.date === todayDate);
  return { tx: row?.tx ?? 0, rx: row?.rx ?? 0 };
});

const period = computed(() =>
  history.value.reduce(
    (acc, day) => ({ tx: acc.tx + day.tx, rx: acc.rx + day.rx }),
    { tx: 0, rx: 0 }
  )
);

const isEmpty = computed(() => history.value.length === 0);

const categories = computed(() =>
  history.value.map((day) => day.date.slice(5))
);

const series = computed(() => [
  {
    name: t('client.download'),
    data: history.value.map((day) => day.tx),
  },
  {
    name: t('client.upload'),
    data: history.value.map((day) => day.rx),
  },
]);

const chartOptions = computed(() => {
  const colors = [CHART_COLORS.tx[theme.value], CHART_COLORS.rx[theme.value]];
  return {
    chart: {
      type: 'bar' as const,
      stacked: true,
      toolbar: { show: false },
      animations: { enabled: false },
      height: 260,
      background: 'transparent',
    },
    colors,
    dataLabels: { enabled: false },
    stroke: { show: false },
    plotOptions: {
      bar: { columnWidth: '70%' },
    },
    xaxis: {
      categories: categories.value,
      labels: { style: { fontSize: '10px' } },
      axisTicks: { show: false },
    },
    yaxis: {
      labels: {
        formatter: (value: number) => bytes(value),
        style: { fontSize: '10px' },
      },
    },
    grid: {
      borderColor: theme.value === 'dark' ? '#333333' : '#e5e7eb',
    },
    legend: {
      position: 'top' as const,
      fontSize: '12px',
    },
    tooltip: {
      shared: true,
      y: {
        formatter: (value: number) => bytes(value),
      },
    },
    theme: {
      mode: theme.value as NonNullable<ApexOptions['theme']>['mode'],
    },
  };
});
</script>

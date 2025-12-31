<template>
  <div class="dashboard-page">
    <!-- 顶部：Scope 切换 + 全局概览 -->
    <section class="dashboard-section">
      <div class="dashboard-section-header">
        <div class="dashboard-section-title">
          <span>{{ t("pve.dashboard.globalOverview") }}</span>
        </div>
        <div class="dashboard-section-extra">
          <el-select
            v-model="currentScope"
            size="small"
            class="scope-select"
            @change="handleScopeChange"
          >
            <el-option :label="t('pve.dashboard.scopeAll')" :value="'all'" />
            <el-option
              v-for="item in scopeOptions"
              :key="item.cluster_id"
              :label="item.cluster_name_alias || item.cluster_name"
              :value="String(item.cluster_id)"
            />
          </el-select>
        </div>
      </div>

      <el-row :gutter="16">
        <el-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card-label">
              {{ t("pve.dashboard.clusters") }}
            </div>
            <div class="stat-card-value" @click="goTo('clusters')">
              {{ overviewSummary.cluster_count }}
            </div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card-label">
              {{ t("pve.dashboard.nodes") }}
            </div>
            <div class="stat-card-value" @click="goTo('nodes')">
              {{ overviewSummary.node_count }}
            </div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card-label">
              {{ t("pve.dashboard.vms") }}
            </div>
            <div class="stat-card-value" @click="goTo('vms')">
              {{ overviewSummary.vm_count }}
            </div>
          </el-card>
        </el-col>
        <el-col :xs="12" :sm="12" :md="6" :lg="6" :xl="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card-label">
              {{ t("pve.dashboard.storages") }}
            </div>
            <div class="stat-card-value" @click="goTo('storages')">
              {{ overviewSummary.storage_count }}
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-card class="health-card" shadow="never">
        <div class="health-card-content" @click="goTo('abnormalClusters')">
          <div class="health-label">
            {{ t("pve.dashboard.health") }}
          </div>
          <div class="health-summary">
            <span class="health-dot healthy"></span>
            <span class="health-text">
              {{ t("pve.dashboard.healthHealthy") }}:
              {{ overviewHealth.healthy }}
            </span>
            <span class="health-dot warning"></span>
            <span class="health-text">
              {{ t("pve.dashboard.healthWarning") }}:
              {{ overviewHealth.warning }}
            </span>
            <span class="health-dot critical"></span>
            <span class="health-text">
              {{ t("pve.dashboard.healthCritical") }}:
              {{ overviewHealth.critical }}
            </span>
          </div>
        </div>
      </el-card>
    </section>

    <!-- 资源态势 -->
    <section class="dashboard-section">
      <div class="dashboard-section-header">
        <div class="dashboard-section-title">
          <span>{{ t("pve.dashboard.resourceTitle") }}</span>
        </div>
      </div>
      <el-row :gutter="16">
        <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
          <el-card shadow="never" class="resource-card">
            <div class="resource-title">
              {{ t("pve.dashboard.cpuUsage") }}
            </div>
            <el-progress
              :percentage="cpuUsage"
              :status="getUsageStatus(cpuUsage)"
              :stroke-width="16"
              text-inside
            />
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
          <el-card shadow="never" class="resource-card">
            <div class="resource-title">
              {{ t("pve.dashboard.memoryUsage") }}
            </div>
            <el-progress
              :percentage="memoryUsage"
              :status="getUsageStatus(memoryUsage)"
              :stroke-width="16"
              text-inside
            />
          </el-card>
        </el-col>
        <el-col :xs="24" :sm="24" :md="8" :lg="8" :xl="8">
          <el-card shadow="never" class="resource-card">
            <div class="resource-title">
              {{ t("pve.dashboard.storageUsage") }}
            </div>
            <el-progress
              :percentage="storageUsage"
              :status="getUsageStatus(storageUsage)"
              :stroke-width="16"
              text-inside
            />
          </el-card>
        </el-col>
      </el-row>
    </section>

    <!-- Hotspots & Risks -->
    <section class="dashboard-section">
      <div class="dashboard-section-header">
        <div class="dashboard-section-title">
          <span>{{ t("pve.dashboard.hotspotsRisks") }}</span>
        </div>
      </div>
      <el-row :gutter="16" class="hotspots-row">
        <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
          <el-card shadow="never" class="hotspot-card">
            <div class="card-header">
              <span>{{ t("pve.dashboard.topResourceConsumers") }}</span>
              <div class="header-controls">
                <el-radio-group v-model="resourceType" size="small" class="resource-type-switch" @change="handleResourceTypeChange">
                  <el-radio-button value="vm">{{ t('pve.dashboard.resourceTypeVm') }}</el-radio-button>
                  <el-radio-button value="node">{{ t('pve.dashboard.resourceTypeNode') }}</el-radio-button>
                  <el-radio-button value="storage">{{ t('pve.dashboard.resourceTypeStorage') }}</el-radio-button>
                </el-radio-group>
                <el-radio-group 
                  v-if="resourceType !== 'storage'"
                  v-model="metricType" 
                  size="small" 
                  class="metric-type-switch"
                >
                  <el-radio-button 
                    v-for="metric in availableMetricTypes" 
                    :key="metric.value"
                    :value="metric.value"
                  >
                    {{ metric.label }}
                  </el-radio-button>
                </el-radio-group>
              </div>
            </div>
            <el-empty
              v-if="displayedResourceConsumers.length === 0"
              :description="t('pve.dashboard.noData')"
            />
            <el-table
              v-else
              :data="displayedResourceConsumers"
              border
              size="small"
              class="no-header-table"
            >
              <el-table-column
                prop="name"
                :label="t('pve.dashboard.resourceName')"
                min-width="180"
              >
                <template #default="{ row }">
                  <div class="resource-name-cell">
                    <component
                      :is="useRenderIcon(getResourceIconName(row.type))"
                      class="resource-icon"
                      :class="getResourceIconClass(row.type)"
                      style="width: 16px; height: 16px;"
                    />
                    <span class="clickable" @click="goToResource(row)">
                      {{ row.name }}
                    </span>
                  </div>
                </template>
              </el-table-column>
              <el-table-column
                :label="t('pve.dashboard.resourceType')"
                width="100"
              >
                <template #default="{ row }">
                  <el-tag size="small" :type="getResourceTypeTagType(row.type) as any">
                    {{ formatResourceType(row.type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column
                :label="t('pve.dashboard.metricType')"
                width="100"
              >
                <template #default="{ row }">
                  <el-tag size="small" effect="plain" :type="getMetricTypeTagType(row.metric_type) as any">
                    {{ formatMetricType(row.metric_type) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column
                :label="t('pve.dashboard.metricValue')"
                width="120"
                align="right"
              >
                <template #default="{ row }">
                  <span :class="getMetricValueClass(row.metric_value)">
                    {{ formatMetricValue(row.metric_value) }}{{ row.unit }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="24" :md="12" :lg="12" :xl="12">
          <el-card shadow="never" class="risk-card">
            <div class="card-header">
              <span>{{ t("pve.dashboard.recentRisks") }}</span>
            </div>
            <el-empty
              v-if="hotspots.recent_risks.length === 0"
              :description="t('pve.dashboard.noRisks')"
            />
            <el-timeline v-else>
              <el-timeline-item
                v-for="item in hotspots.recent_risks"
                :key="item.id"
                :type="getRiskType(item.level)"
                :timestamp="item.relative_time || ''"
              >
                <div class="risk-item" @click="goToRiskTarget(item)">
                  <span class="risk-level-tag" :class="item.level">
                    {{ item.level }}
                  </span>
                  <span class="risk-message">
                    {{ item.message }}
                  </span>
                  <span class="risk-target">
                    ({{ item.target_type }}: {{ item.target_name }})
                  </span>
                </div>
              </el-timeline-item>
            </el-timeline>
          </el-card>
        </el-col>
      </el-row>
    </section>

    <!-- Quick Actions -->
    <section class="dashboard-section">
      <div class="dashboard-section-header">
        <div class="dashboard-section-title">
          <span>{{ t("pve.dashboard.quickActions") }}</span>
        </div>
      </div>
      <div class="quick-actions">
        <el-button type="primary" @click="goTo('createVm')">
          {{ t("pve.dashboard.quickCreateVm") }}
        </el-button>
        <el-button @click="goTo('migrateVm')">
          {{ t("pve.dashboard.quickMigrateVm") }}
        </el-button>
        <el-button @click="goTo('nodeMaintenance')">
          {{ t("pve.dashboard.quickNodeMaintenance") }}
        </el-button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import {
  type DashboardScopeItem,
  type DashboardOverviewSummary,
  type DashboardOverviewHealth,
  type DashboardResourcesPayload,
  type DashboardHotspotsPayload,
  type DashboardTopResourceConsumer,
  fetchDashboardScopes,
  fetchDashboardOverview,
  fetchDashboardResources,
  fetchDashboardHotspots
} from "@/api/pve";
import { ElMessage } from "element-plus";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";

const router = useRouter();
const { t } = useI18n();

// 当前 Scope：'all' 或 集群 ID 字符串
const currentScope = ref<string>("all");
const scopeOptions = ref<DashboardScopeItem[]>([]);

// 概览
const overviewSummary = reactive<DashboardOverviewSummary>({
  cluster_count: 0,
  node_count: 0,
  vm_count: 0,
  storage_count: 0
});

const overviewHealth = reactive<DashboardOverviewHealth>({
  healthy: 0,
  warning: 0,
  critical: 0
});

// 资源利用率
const resources = reactive<DashboardResourcesPayload>({
  scope: "all",
  cluster_id: null,
  cpu: {
    usage_percent: 0
  },
  memory: {
    usage_percent: 0
  },
  storage: {
    usage_percent: 0
  }
});

const cpuUsage = computed(() => Math.round(resources.cpu.usage_percent || 0));
const memoryUsage = computed(() => Math.round(resources.memory.usage_percent || 0));
const storageUsage = computed(() => Math.round(resources.storage.usage_percent || 0));

// Hotspots
const hotspots = reactive<DashboardHotspotsPayload>({
  scope: "all",
  cluster_id: null,
  vm_hotspots: {
    cpu: [],
    memory: [],
    disk: []
  },
  node_hotspots: {
    cpu: [],
    memory: []
  },
  storage_hotspots: [],
  recent_risks: []
});

// 资源类型切换：vm, node, storage
const resourceType = ref<"vm" | "node" | "storage">("vm");

// 指标类型切换：cpu, memory (VM 和 Node)
const metricType = ref<"cpu" | "memory">("cpu");

// 根据资源类型获取可用的指标类型
const availableMetricTypes = computed(() => {
  if (resourceType.value === 'vm') {
    return [
      { value: 'cpu', label: t('pve.dashboard.metricTypeCpu') },
      { value: 'memory', label: t('pve.dashboard.metricTypeMemory') }
    ];
  } else if (resourceType.value === 'node') {
    return [
      { value: 'cpu', label: t('pve.dashboard.metricTypeCpu') },
      { value: 'memory', label: t('pve.dashboard.metricTypeMemory') }
    ];
  }
  return [];
});

// 处理资源类型切换
const handleResourceTypeChange = () => {
  // 当切换到 Storage 时，不需要指标类型切换
  // 如果当前 metricType 不在可用选项中，重置为 cpu
  const availableValues = availableMetricTypes.value.map(m => m.value);
  if (!availableValues.includes(metricType.value)) {
    metricType.value = 'cpu';
  }
};


const loading = ref(false);

const getScopeParams = () => {
  if (currentScope.value === "all") {
    return { scope: "all" as const };
  }
  return {
    scope: "cluster" as const,
    cluster_id: Number(currentScope.value)
  };
};

const loadScopes = async () => {
  try {
    const res = await fetchDashboardScopes();
    if (res.code === 0 && res.data) {
      scopeOptions.value = res.data.items || [];
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load dashboard scopes:", error);
  }
};

const loadOverview = async () => {
  try {
    const res = await fetchDashboardOverview(getScopeParams());
    if (res.code === 0 && res.data) {
      Object.assign(overviewSummary, res.data.summary || {});
      Object.assign(overviewHealth, res.data.health || {});
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load dashboard overview:", error);
  }
};

const loadResources = async () => {
  try {
    const res = await fetchDashboardResources(getScopeParams());
    if (res.code === 0 && res.data) {
      Object.assign(resources, res.data);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load dashboard resources:", error);
  }
};

const loadHotspots = async () => {
  try {
    const res = await fetchDashboardHotspots({
      ...getScopeParams(),
      limit: 10
    });
    if (res.code === 0 && res.data) {
      Object.assign(hotspots, res.data);
    }
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Failed to load dashboard hotspots:", error);
  }
};


const refreshAll = async () => {
  loading.value = true;
  try {
    await Promise.all([
      loadOverview(),
      loadResources(),
      loadHotspots()
    ]);
  } finally {
    loading.value = false;
  }
};

const handleScopeChange = () => {
  refreshAll();
};

const getUsageStatus = (value: number) => {
  if (value >= 90) return "exception";
  if (value >= 80) return "warning";
  return "success";
};

const getRiskType = (level: string) => {
  if (level === "critical") return "danger";
  if (level === "warning") return "warning";
  return "info";
};

// 格式化资源类型显示
const formatResourceType = (type: string) => {
  const typeMap: Record<string, string> = {
    vm: t('pve.dashboard.resourceTypeVm'),
    node: t('pve.dashboard.resourceTypeNode'),
    storage: t('pve.dashboard.resourceTypeStorage')
  };
  return typeMap[type] || type;
};

// 格式化指标类型显示
const formatMetricType = (metricType: string) => {
  const metricMap: Record<string, string> = {
    cpu: t('pve.dashboard.metricTypeCpu'),
    memory: t('pve.dashboard.metricTypeMemory'),
    storage: t('pve.dashboard.metricTypeStorage'),
    disk: t('pve.dashboard.metricTypeStorage'),
    io: t('pve.dashboard.metricTypeIo'),
    network: t('pve.dashboard.metricTypeNetwork')
  };
  return metricMap[metricType] || metricType;
};

// 格式化指标值显示
const formatMetricValue = (value: number | string) => {
  if (typeof value === 'number') {
    return value.toFixed(1);
  }
  return value;
};

// 获取资源类型标签类型
const getResourceTypeTagType = (type: string) => {
  const typeMap: Record<string, string> = {
    vm: 'primary',
    node: 'success',
    storage: 'warning'
  };
  return typeMap[type] || 'info';
};

// 获取指标类型标签类型
const getMetricTypeTagType = (metricType: string) => {
  const metricMap: Record<string, string> = {
    cpu: 'danger',
    memory: 'warning',
    storage: 'info',
    io: 'success',
    network: 'primary'
  };
  return metricMap[metricType] || '';
};

// 获取指标值样式类
const getMetricValueClass = (value: number | string) => {
  const numValue = typeof value === 'number' ? value : parseFloat(String(value));
  if (numValue >= 90) return 'metric-value-critical';
  if (numValue >= 80) return 'metric-value-warning';
  return 'metric-value-normal';
};

// 获取资源图标名称
const getResourceIconName = (type: string) => {
  const iconMap: Record<string, string> = {
    vm: 'ep:monitor',
    node: 'ep:server',
    storage: 'ep:folder'
  };
  return iconMap[type] || 'ep:box';
};

// 获取资源图标样式类
const getResourceIconClass = (type: string) => {
  const classMap: Record<string, string> = {
    vm: 'resource-icon-vm',
    node: 'resource-icon-node',
    storage: 'resource-icon-storage'
  };
  return classMap[type] || '';
};

// 将新的数据结构转换为表格显示格式
const displayedResourceConsumers = computed<DashboardTopResourceConsumer[]>(() => {
  const result: DashboardTopResourceConsumer[] = [];
  
  if (resourceType.value === 'vm') {
    // 根据当前选择的指标类型，只显示对应的数据（只支持 CPU 和 Memory）
    if (metricType.value === 'cpu') {
      hotspots.vm_hotspots.cpu.forEach(item => {
        result.push({
          type: 'vm',
          id: item.id,
          name: item.name,
          metric_type: 'cpu',
          metric_value: item.metric_value,
          unit: item.unit,
          node_name: item.node_name,
          cluster_id: item.cluster_id,
          cluster_name: item.cluster_name
        });
      });
    } else if (metricType.value === 'memory') {
      hotspots.vm_hotspots.memory.forEach(item => {
        result.push({
          type: 'vm',
          id: item.id,
          name: item.name,
          metric_type: 'memory',
          metric_value: item.metric_value,
          unit: item.unit,
          node_name: item.node_name,
          cluster_id: item.cluster_id,
          cluster_name: item.cluster_name
        });
      });
    }
  } else if (resourceType.value === 'node') {
    // 根据当前选择的指标类型，只显示对应的数据
    if (metricType.value === 'cpu') {
      hotspots.node_hotspots.cpu.forEach(item => {
        result.push({
          type: 'node',
          id: item.id,
          name: item.name,
          metric_type: 'cpu',
          metric_value: item.metric_value,
          unit: item.unit,
          cluster_id: item.cluster_id,
          cluster_name: item.cluster_name
        });
      });
    } else if (metricType.value === 'memory') {
      hotspots.node_hotspots.memory.forEach(item => {
        result.push({
          type: 'node',
          id: item.id,
          name: item.name,
          metric_type: 'memory',
          metric_value: item.metric_value,
          unit: item.unit,
          cluster_id: item.cluster_id,
          cluster_name: item.cluster_name
        });
      });
    }
  } else if (resourceType.value === 'storage') {
    // Storage hotspots
    hotspots.storage_hotspots.forEach(item => {
      result.push({
        type: 'storage',
        id: item.id,
        name: item.name,
        metric_type: 'storage',
        metric_value: item.usage_percent,
        unit: item.unit
      });
    });
  }
  
  // 按 metric_value 降序排序
  return result.sort((a, b) => {
    const aValue = typeof a.metric_value === 'number' ? a.metric_value : parseFloat(String(a.metric_value));
    const bValue = typeof b.metric_value === 'number' ? b.metric_value : parseFloat(String(b.metric_value));
    return bValue - aValue;
  }).slice(0, 10); // 只显示前10个
});


const goTo = (type: string) => {
  // 这里根据你实际的路由结构调整
  if (type === "clusters") {
    router.push({ path: "/pve/clusters" });
  } else if (type === "nodes") {
    router.push({ path: "/pve/nodes" });
  } else if (type === "vms") {
    router.push({ path: "/pve/vms" });
  } else if (type === "storages") {
    router.push({ path: "/pve/storages" });
  } else if (type === "abnormalClusters") {
    router.push({
      path: "/pve/clusters",
      query: { filter: "abnormal" }
    });
  } else if (type === "createVm") {
    router.push({ path: "/pve/vms", query: { action: "create" } });
  } else if (type === "migrateVm") {
    router.push({ path: "/pve/vms", query: { action: "migrate" } });
  } else if (type === "nodeMaintenance") {
    router.push({ path: "/pve/nodes", query: { action: "maintenance" } });
  } else {
    ElMessage.info("Route not configured yet");
  }
};

const goToResource = (row: { type: string; id: string }) => {
  if (row.type === "vm") {
    router.push({ path: "/pve/vms", query: { id: row.id } });
  } else if (row.type === "node") {
    router.push({ path: "/pve/nodes", query: { id: row.id } });
  } else if (row.type === "storage") {
    router.push({ path: "/pve/storages", query: { id: row.id } });
  }
};

const goToRiskTarget = (item: {
  target_type: string;
  target_id: string;
}) => {
  goToResource({
    type: item.target_type,
    id: item.target_id
  });
};

onMounted(async () => {
  await loadScopes();
  await refreshAll();
});
</script>

<style scoped>
.dashboard-page {
  padding: 16px;
}

.dashboard-section {
  margin-bottom: 20px;
}

.dashboard-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.dashboard-section-title {
  font-size: 16px;
  font-weight: 600;
}

.scope-select {
  min-width: 180px;
}

.stat-card {
  cursor: pointer;
}

.stat-card-label {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  margin-bottom: 8px;
}

.stat-card-value {
  font-size: 24px;
  font-weight: 600;
}

.health-card {
  margin-top: 12px;
}

.health-card-content {
  display: flex;
  align-items: center;
  cursor: pointer;
}

.health-label {
  font-weight: 600;
  margin-right: 16px;
}

.health-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.health-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.health-dot.healthy {
  background-color: #67c23a;
}

.health-dot.warning {
  background-color: #e6a23c;
}

.health-dot.critical {
  background-color: #f56c6c;
}

.health-text {
  font-size: 13px;
}

.resource-card {
  height: 120px;
}

.resource-title {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.card-header {
  font-weight: 600;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-controls {
  display: flex;
  gap: 12px;
  align-items: center;
}

.resource-type-switch {
  margin-left: auto;
}

.metric-type-switch {
  margin-left: 0;
}

.hotspots-row {
  display: flex;
}

.hotspots-row .el-col {
  display: flex;
  flex-direction: column;
}

.hotspot-card,
.risk-card {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.hotspot-card :deep(.el-card__body),
.risk-card :deep(.el-card__body) {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.hotspot-card .no-header-table,
.risk-card .el-timeline {
  flex: 1;
  overflow: auto;
}

.no-header-table :deep(.el-table__header-wrapper) {
  display: none;
}

.clickable {
  cursor: pointer;
  color: var(--el-color-primary);
}

.clickable:hover {
  text-decoration: underline;
}

.resource-name-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}

.resource-icon {
  font-size: 16px;
}

.resource-icon-vm {
  color: #409eff;
}

.resource-icon-node {
  color: #67c23a;
}

.resource-icon-storage {
  color: #e6a23c;
}

.metric-value-critical {
  color: #f56c6c;
  font-weight: 600;
}

.metric-value-warning {
  color: #e6a23c;
  font-weight: 500;
}

.metric-value-normal {
  color: #606266;
}

.risk-item {
  cursor: pointer;
}

.risk-item:hover .risk-message {
  text-decoration: underline;
}

.risk-level-tag {
  font-size: 12px;
  padding: 2px 6px;
  border-radius: 4px;
  margin-right: 6px;
  text-transform: capitalize;
}

.risk-level-tag.info {
  background-color: #ecf5ff;
  color: #409eff;
}

.risk-level-tag.warning {
  background-color: #fdf6ec;
  color: #e6a23c;
}

.risk-level-tag.critical {
  background-color: #fef0f0;
  color: #f56c6c;
}

.risk-message {
  margin-right: 6px;
}

.risk-target {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}


.quick-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
</style>



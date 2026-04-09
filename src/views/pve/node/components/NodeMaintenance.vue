<template>
  <div class="node-maintenance">
    <!-- 节点状态概览卡片 -->
    <el-card class="status-card" shadow="never" v-if="selectedNode">
      <div class="status-overview">
        <div class="overview-left">
          <div class="node-info">
            <el-icon class="node-icon"><Monitor /></el-icon>
            <div class="node-details">
              <h2 class="node-name">
                {{ $t('node.maintenanceTitle') }}: {{ selectedNode.node_name }}
              </h2>
              <span class="node-subtitle">{{ $t('node.maintenanceGuide') }}</span>
            </div>
          </div>
        </div>
        <div class="overview-right">
          <div class="stat-item">
            <span class="stat-label">{{ $t('node.vmCount') }}</span>
            <span class="stat-value">
              <el-tag type="success" size="large">{{ runningVMs }}</el-tag>
              <span class="stat-sub">/ {{ nodeVMs.length }}</span>
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('node.candidates') }}</span>
            <span class="stat-value">
              <el-tag type="primary" size="large">{{ availableCandidates }}</el-tag>
            </span>
          </div>
          <div class="stat-item">
            <span class="stat-label">{{ $t('node.maintenanceStatus') }}</span>
            <span class="stat-value">
              <el-tag :type="getStatusTagType" size="large">
                {{ getStatusText }}
              </el-tag>
            </span>
          </div>
        </div>
      </div>
    </el-card>

    <el-empty v-if="!selectedNode" :description="$t('node.noNodeSelected')" :image-size="120" />

    <!-- 主操作区 -->
    <el-card class="main-card" shadow="never" style="margin-top: 16px" v-if="selectedNode">
      <template #header>
        <div class="card-header">
          <span class="card-title">{{ $t('node.maintenanceTitle') }}</span>
          <div class="card-actions">
            <el-button
              v-if="currentPlan?.status === 'running'"
              type="danger"
              size="large"
              @click="handleCancelPlan"
              :icon="Close"
            >
              取消计划
            </el-button>
            <el-button
              v-if="currentPlan?.status === 'completed' || currentPlan?.status === 'failed' || currentPlan?.status === 'cancelled'"
              type="success"
              size="large"
              @click="handleEndMaintenance"
              :icon="Check"
            >
              {{ $t('node.endMaintenance') }}
            </el-button>
            <el-button
              type="primary"
              size="large"
              @click="handleStartMaintenance"
              :disabled="!selectedNode || currentPlan?.status === 'running' || currentPlan?.status === 'pending'"
              :icon="Tools"
            >
              {{ $t('node.startMaintenance') }}
            </el-button>
          </div>
        </div>
      </template>

      <el-tabs v-model="activeTab" class="maintenance-tabs">
        <!-- VM 列表标签页 -->
        <el-tab-pane :label="$t('node.vmList')" name="vms">
          <div class="table-toolbar">
            <div class="toolbar-left">
              <el-checkbox v-model="showRunningOnly" @change="filterVMs">
                {{ $t('node.showRunningOnly') }}
              </el-checkbox>
              <el-tag type="info" style="margin-left: 12px">
                {{ $t('node.selectedVMs', { count: selectedVMs.length }) }}
              </el-tag>
            </div>
            <div class="toolbar-right">
              <el-input
                v-model="vmSearchKeyword"
                :placeholder="$t('common.search')"
                prefix-icon="Search"
                clearable
                style="width: 200px"
              />
            </div>
          </div>
          <el-table
            :data="filteredVMs"
            v-loading="vmsLoading"
            @selection-change="handleVMSelection"
            row-key="vm_id"
          >
            <el-table-column type="selection" width="50" :reserve-selection="true" />
            <el-table-column prop="vm_id" :label="$t('node.vmId')" width="100" />
            <el-table-column prop="vm_name" :label="$t('node.vmName')" min-width="200">
              <template #default="{ row }">
                <span class="vm-name">{{ row.vm_name }}</span>
                <el-tag v-if="row.ha === 1" size="small" type="warning" style="margin-left: 8px">HA</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="status" :label="$t('node.vmStatus')" width="120">
              <template #default="{ row }">
                <el-tag :type="row.status === 'running' ? 'success' : 'info'" size="small">
                  {{ row.status === 'running' ? $t('node.running') : row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column :label="$t('node.migratePriority')" width="150">
              <template #default="{ row }">
                <el-radio-group v-model="row.priority" size="small">
                  <el-radio-button value="high">{{ $t('node.priorityHigh') }}</el-radio-button>
                  <el-radio-button value="normal">{{ $t('node.priorityNormal') }}</el-radio-button>
                  <el-radio-button value="low">{{ $t('node.priorityLow') }}</el-radio-button>
                </el-radio-group>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 目标节点标签页 -->
        <el-tab-pane :label="$t('node.targetNodes')" name="targets">
          <div class="candidates-intro">
            <el-icon><InfoFilled /></el-icon>
            <span>{{ $t('node.candidatesTip') }}</span>
          </div>
          <el-table :data="candidates" v-loading="candidatesLoading">
            <el-table-column prop="node_name" :label="$t('node.nodeName')" min-width="150" />
            <el-table-column prop="cpu_cores" :label="$t('node.cpuCores')" width="100" />
            <el-table-column prop="cpu_usage" :label="$t('node.cpuUsage')" width="120">
              <template #default="{ row }">
                <el-progress
                  :percentage="parseFloat((row.cpu_usage || 0).toFixed(1))"
                  :color="getUsageColor(row.cpu_usage)"
                  :format="fmtUsage"
                />
              </template>
            </el-table-column>
            <el-table-column prop="mem_usage" :label="$t('node.memUsage')" width="120">
              <template #default="{ row }">
                <el-progress
                  :percentage="parseFloat((row.mem_usage || 0).toFixed(1))"
                  :color="getUsageColor(row.mem_usage)"
                  :format="fmtUsage"
                />
              </template>
            </el-table-column>
            <el-table-column prop="vm_count" :label="$t('node.vmCount')" width="100">
              <template #default="{ row }">
                <el-tag size="small">{{ row.vm_count }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="score" :label="$t('node.score')" min-width="150">
              <template #default="{ row }">
                <el-tooltip :content="getScoreTooltip(row.score)" placement="top">
                  <el-progress
                    :percentage="Math.round(row.score || 0)"
                    :status="row.score > 70 ? 'success' : row.score > 40 ? 'warning' : 'exception'"
                    :format="score => score + '分'"
                  />
                </el-tooltip>
              </template>
            </el-table-column>
          </el-table>
        </el-tab-pane>

        <!-- 迁移进度标签页 -->
        <el-tab-pane :label="$t('node.migrateProgress')" name="progress">
          <div v-if="maintenanceProgress" class="progress-section">
            <div class="progress-overview">
              <el-statistic title="总 VM 数" :value="maintenanceProgress.total_vms" />
              <el-statistic title="已迁移" :value="migratedCount" value-style="color: #67c23a" />
              <el-statistic title="迁移中" :value="migratingCount" value-style="color: #e6a23c" />
              <el-statistic title="失败" :value="failedCount" value-style="color: #f56c6c" />
            </div>

            <el-divider />

            <h4 class="section-title">{{ $t('node.migrateSteps') }}</h4>
            <el-steps class="steps" :active="getStepActive()" finish-status="success" align-center>
              <el-step :title="$t('node.step1')" :status="getStepStatus(1)" :description="$t('node.step1Desc')" />
              <el-step :title="$t('node.step2')" :status="getStepStatus(2)" :description="$t('node.step2Desc')" />
              <el-step :title="$t('node.step3')" :status="getStepStatus(3)" :description="$t('node.step3Desc')" />
            </el-steps>

            <el-divider />

            <h4 class="section-title">{{ $t('node.migrateDetail') }}</h4>
            <el-table v-if="maintenanceProgress.tasks?.length" :data="maintenanceProgress.tasks">
              <el-table-column prop="vm_name" :label="$t('node.vmName')" min-width="150" />
              <el-table-column prop="vm_id" label="VM ID" width="100" />
              <el-table-column prop="target_node" :label="$t('node.targetNode')" min-width="120" />
              <el-table-column prop="status" :label="$t('node.migrateStatus')" width="120">
                <template #default="{ row }">
                  <el-tag :type="getStatusType(row.status)" size="small">
                    {{ getMigrateStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="error_message" :label="$t('node.errorInfo')" min-width="200" show-overflow-tooltip />
            </el-table>
          </div>
          <el-empty v-else :description="$t('node.noMigrateProgress')" :image-size="120" />
        </el-tab-pane>

        <!-- 历史记录标签页 -->
        <el-tab-pane :label="$t('node.historyRecords')" name="history">
          <div class="history-section">
            <div class="history-toolbar">
              <el-button type="primary" @click="loadHistory" :loading="historyLoading">
                {{ $t('common.refresh') }}
              </el-button>
            </div>
            <el-table :data="historyRecords" v-loading="historyLoading" stripe>
              <el-table-column prop="plan_id" :label="$t('node.planId')" width="80" />
              <el-table-column prop="node_name" :label="$t('node.nodeName')" min-width="120" />
              <el-table-column prop="status" :label="$t('node.migrateStatus')" width="100">
                <template #default="{ row }">
                  <el-tag :type="getHistoryStatusType(row.status)" size="small">
                    {{ getHistoryStatusText(row.status) }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="total_vms" :label="$t('node.totalVMs')" width="80" />
              <el-table-column prop="migrated_vms" :label="$t('node.migrated')" width="80" />
              <el-table-column prop="failed_vms" :label="$t('node.failed')" width="80" />
              <el-table-column prop="start_time" :label="$t('node.startTime')" min-width="160" />
              <el-table-column prop="end_time" :label="$t('node.endTime')" min-width="160" />
              <el-table-column prop="duration" :label="$t('node.duration')" width="100" />
            </el-table>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- 开始维护对话框 -->
    <el-dialog v-model="dialogVisible" :title="$t('node.dialogTitle')" width="600px" :close-on-click-modal="false">
      <el-alert
        :title="$t('node.confirmMaintenance')"
        type="warning"
        :closable="false"
        show-icon
        style="margin-bottom: 20px"
      />

      <el-form :model="form" label-width="140px" label-position="left">
        <el-form-item :label="$t('node.migrateMode')">
          <el-radio-group v-model="form.mode">
            <el-radio value="auto">{{ $t('node.modeAuto') }}</el-radio>
            <el-radio value="manual">{{ $t('node.modeManual') }}</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item :label="$t('node.migrateStrategy')">
          <el-select v-model="form.strategy" style="width: 100%">
            <el-option label="最小化停机时间" value="minimize_downtime" />
            <el-option label="最小化资源占用" value="minimize_resource" />
            <el-option label="平均分布" value="balance" />
          </el-select>
        </el-form-item>

        <!-- 手动模式：选择目标节点 -->
        <el-form-item
          v-if="form.mode === 'manual'"
          :label="$t('node.selectTargetNodes')"
        >
          <el-select
            v-model="form.targetNodes"
            multiple
            collapse-tags
            collapse-tags-tooltip
            :placeholder="$t('node.selectTargetNodesPlaceholder')"
            style="width: 100%"
          >
            <el-option
              v-for="c in candidates"
              :key="c.node_id"
              :label="c.node_name"
              :value="c.node_id"
            >
              <div class="option-node">
                <span>{{ c.node_name }}</span>
                <el-tag size="small" :type="c.score > 70 ? 'success' : c.score > 40 ? 'warning' : 'danger'">
                  {{ c.score?.toFixed(0) }}分
                </el-tag>
              </div>
            </el-option>
          </el-select>
        </el-form-item>

        <el-form-item :label="$t('node.concurrency')">
          <el-slider v-model="form.concurrency" :min="1" :max="10" :step="1" show-input />
          <div class="form-tip">{{ $t('node.concurrencyTip') }}</div>
        </el-form-item>

        <el-form-item :label="$t('node.migrateOptions')">
          <el-checkbox v-model="form.onlineMigrate">{{ $t('node.onlineMigrate') }}</el-checkbox>
          <div class="form-tip">{{ $t('node.onlineMigrateTip') }}</div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
        <el-button type="primary" @click="confirmStartMaintenance" :loading="maintenanceLoading">
          {{ $t('common.confirm') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Monitor, Tools, Check, InfoFilled, Close } from "@element-plus/icons-vue";
import { fetchMigrateCandidates, fetchNodeVMs, startMaintenance, endMaintenance, createMaintenancePlan, getMaintenancePlanProgress, getMaintenanceHistory, cancelMaintenancePlan, type MigrateCandidate, type NodeVMItem, type MaintenancePlanDetail, type MaintenancePlanProgress, type HistoryRecord } from "@/api/pve";

const props = defineProps<{
  selectedNode?: { id: number; node_name: string };
}>();

const emit = defineEmits<{
  (e: 'refresh'): void;
}>();

const vmsLoading = ref(false);
const candidatesLoading = ref(false);
const maintenanceLoading = ref(false);
const dialogVisible = ref(false);
const pollingTimer = ref<number | null>(null);
const activeTab = ref("vms");
const showRunningOnly = ref(false);
const vmSearchKeyword = ref("");
const selectedVMs = ref<NodeVMItem[]>([]);

const nodeVMs = ref<NodeVMItem[]>([]);
const candidates = ref<MigrateCandidate[]>([]);
const currentPlan = ref<MaintenancePlanDetail | null>(null);
const maintenanceProgress = ref<MaintenancePlanProgress | null>(null);
const historyRecords = ref<HistoryRecord[]>([]);
const historyLoading = ref(false);
const historyPagination = ref({ page: 1, page_size: 10, total: 0 });

const form = ref({
  mode: "auto" as "auto" | "manual",
  strategy: "minimize_downtime",
  concurrency: 3,
  targetNodes: [] as number[],
  onlineMigrate: true
});

// 过滤后的 VM 列表
const filteredVMs = computed(() => {
  let result = nodeVMs.value;

  if (showRunningOnly.value) {
    result = result.filter(vm => vm.status === 'running');
  }

  if (vmSearchKeyword.value) {
    const keyword = vmSearchKeyword.value.toLowerCase();
    result = result.filter(vm =>
      vm.vm_name.toLowerCase().includes(keyword) ||
      String(vm.vm_id).includes(keyword)
    );
  }

  return result;
});

// 运行中的 VM 数量
const runningVMs = computed(() => {
  return nodeVMs.value.filter(vm => vm.status === 'running').length;
});

// 可用候选节点数量
const availableCandidates = computed(() => {
  return candidates.value.filter(c => c.score > 40).length;
});

// 状态标签类型
const getStatusTagType = computed(() => {
  if (!currentPlan.value) return 'info';
  const statusMap: Record<string, any> = {
    pending: 'info',
    running: 'warning',
    completed: 'success',
    failed: 'danger',
    cancelled: 'info'
  };
  return statusMap[currentPlan.value.status] || 'info';
});

// 状态文本
const getStatusText = computed(() => {
  if (!currentPlan.value) return '未开始';
  const textMap: Record<string, string> = {
    pending: '等待中',
    running: '迁移中',
    completed: '已完成',
    failed: '失败',
    cancelled: '已取消'
  };
  return textMap[currentPlan.value.status] || '未知';
});

// 已迁移数量
const migratedCount = computed(() => {
  return maintenanceProgress.value?.migrated_vms || 0;
});

// 迁移中数量
const migratingCount = computed(() => {
  const progress = maintenanceProgress.value;
  if (!progress) return 0;
  return progress.total_vms - progress.migrated_vms - progress.failed_vms;
});

// 失败数量
const failedCount = computed(() => {
  return maintenanceProgress.value?.failed_vms || 0;
});

watch(() => props.selectedNode, async (node) => {
  if (!node) return;

  // 加载 VM 列表
  vmsLoading.value = true;
  try {
    const res = await fetchNodeVMs(node.id);
    nodeVMs.value = res.data || [];
    // 初始化优先级
    nodeVMs.value.forEach(vm => {
      vm.priority = vm.status === 'running' ? 'normal' : 'low';
    });
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "获取 VM 列表失败");
  } finally {
    vmsLoading.value = false;
  }

  // 加载可迁移节点
  candidatesLoading.value = true;
  try {
    const res = await fetchMigrateCandidates(node.id);
    candidates.value = res.data || [];
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "获取候选节点失败");
  } finally {
    candidatesLoading.value = false;
  }
}, { immediate: true });

const filterVMs = () => {
  // 过滤逻辑已在 computed 中实现
};

const handleVMSelection = (selection: NodeVMItem[]) => {
  selectedVMs.value = selection;
};

const handleStartMaintenance = () => {
  form.value.mode = "auto";
  form.value.strategy = "minimize_downtime";
  form.value.concurrency = 3;
  form.value.targetNodes = [];
  form.value.onlineMigrate = true;
  dialogVisible.value = true;
};

const confirmStartMaintenance = async () => {
  if (!props.selectedNode) return;

  try {
    await ElMessageBox.confirm(
      "此操作将迁移该节点上的所有虚拟机，是否继续？",
      "警告",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
  } catch {
    return; // 用户取消
  }

  maintenanceLoading.value = true;
  try {
    const res = await createMaintenancePlan({
      node_id: String(props.selectedNode.id),
      mode: form.value.mode,
      concurrency: form.value.concurrency,
      target_nodes: form.value.mode === "manual" ? form.value.targetNodes : undefined
    });
    currentPlan.value = res.data?.data;
    ElMessage.success("维护计划已创建");
    dialogVisible.value = false;

    // 切换到进度标签页
    activeTab.value = "progress";

    // 开始轮询进度
    startPolling();
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "创建维护计划失败");
  } finally {
    maintenanceLoading.value = false;
  }
};

const handleEndMaintenance = async () => {
  if (!props.selectedNode) return;

  try {
    await ElMessageBox.confirm(
      "确定要结束维护吗？节点将恢复可调度状态。",
      "确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "info",
      }
    );
  } catch {
    return;
  }

  try {
    await endMaintenance({
      node_id: String(props.selectedNode.id)
    });
    ElMessage.success("维护已结束");
    currentPlan.value = null;
    maintenanceProgress.value = null;
    stopPolling();
    emit('refresh');
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "结束维护失败");
  }
};

const startPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value);
  }

  // 每 3 秒轮询一次
  pollingTimer.value = window.setInterval(async () => {
    if (!currentPlan.value) return;

    // 如果已经完成或失败或取消，停止轮询
    if (['completed', 'failed', 'cancelled'].includes(currentPlan.value.status)) {
      stopPolling();
      return;
    }

    try {
      const res = await getMaintenancePlanProgress(currentPlan.value.plan_id);
      maintenanceProgress.value = res.data?.data;
      // 同时更新 currentPlan 的状态
      if (res.data?.data) {
        currentPlan.value.status = res.data.data.status;
        currentPlan.value.migrated_vms = res.data.data.migrated_vms;
        currentPlan.value.failed_vms = res.data.data.failed_vms;
      }
    } catch (e) {
      console.error(e);
    }
  }, 3000);
};

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value);
    pollingTimer.value = null;
  }
};

const getStepActive = () => {
  if (!currentPlan.value) return 0;
  switch (currentPlan.value.status) {
    case 'pending': return 1;
    case 'running': return 2;
    case 'completed': return 3;
    case 'failed':
    case 'cancelled': return 2;
    default: return 0;
  }
};

const getStepStatus = (step: number) => {
  if (!currentPlan.value) return 'wait';
  if (currentPlan.value.status === 'failed' || currentPlan.value.status === 'cancelled') {
    return step === 2 ? 'error' : 'wait';
  }
  const active = getStepActive();
  if (step < active) return 'success';
  if (step === active) return 'process';
  return 'wait';
};

const getStatusType = (status: string) => {
  const map: Record<string, any> = {
    pending: "info",
    running: "warning",
    completed: "success",
    failed: "danger"
  };
  return map[status] || "info";
};

const getMigrateStatusText = (status: string) => {
  const map: Record<string, string> = {
    pending: "等待中",
    running: "迁移中",
    completed: "已完成",
    failed: "失败"
  };
  return map[status] || status;
};

// 取消维护计划
const handleCancelPlan = async () => {
  if (!currentPlan.value) return;

  try {
    await ElMessageBox.confirm(
      "确定要取消当前维护计划吗？",
      "确认",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
      }
    );
  } catch {
    return;
  }

  try {
    await cancelMaintenancePlan(currentPlan.value.plan_id);
    ElMessage.success("计划已取消");
    currentPlan.value.status = 'cancelled';
    stopPolling();
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "取消计划失败");
  }
};

// 加载历史记录
const loadHistory = async () => {
  historyLoading.value = true;
  try {
    const res = await getMaintenanceHistory(
      historyPagination.value.page,
      historyPagination.value.page_size,
      props.selectedNode?.id
    );
    historyRecords.value = res.data?.data?.records || [];
    historyPagination.value.total = res.data?.data?.total || 0;
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "获取历史记录失败");
  } finally {
    historyLoading.value = false;
  }
};

// 历史记录状态类型
const getHistoryStatusType = (status: string) => {
  const map: Record<string, any> = {
    completed: "success",
    failed: "danger",
    cancelled: "info"
  };
  return map[status] || "info";
};

// 历史记录状态文本
const getHistoryStatusText = (status: string) => {
  const map: Record<string, string> = {
    completed: "已完成",
    failed: "失败",
    cancelled: "已取消"
  };
  return map[status] || status;
};

const getUsageColor = (usage: number) => {
  if (usage < 50) return '#67c23a';
  if (usage < 80) return '#e6a23c';
  return '#f56c6c';
};

const fmtUsage = (percentage: number) => `${percentage.toFixed(1)}%`;

const getScoreTooltip = (score: number) => {
  if (score > 70) return '资源充足，推荐迁移';
  if (score > 40) return '资源适中，可以迁移';
  return '资源紧张，谨慎选择';
};

// 清理定时器
watch(() => currentPlan.value?.status, (status) => {
  if (status === 'completed' || status === 'failed' || status === 'cancelled') {
    stopPolling();
  }
});

// 监听标签页切换
watch(activeTab, (tab) => {
  if (tab === 'history' && props.selectedNode) {
    loadHistory();
  }
});
</script>

<style scoped>
.node-maintenance {
  padding: 16px;
}

/* 状态卡片 - 新设计 */
.status-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border: none;
  border-radius: 12px;
}

.status-card :deep(.el-card__body) {
  padding: 24px;
}

.status-overview {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #fff;
}

.overview-left {
  display: flex;
  align-items: center;
}

.node-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.node-icon {
  font-size: 48px;
  opacity: 0.9;
}

.node-details {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.node-name {
  margin: 0;
  font-size: 28px;
  font-weight: 600;
  color: #fff;
}

.node-subtitle {
  font-size: 14px;
  opacity: 0.8;
}

.overview-right {
  display: flex;
  gap: 32px;
}

.stat-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.stat-label {
  font-size: 13px;
  opacity: 0.8;
}

.stat-value {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 20px;
  font-weight: 600;
}

.stat-sub {
  font-size: 14px;
  opacity: 0.7;
}

/* 主卡片 */
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}

.card-actions {
  display: flex;
  gap: 12px;
}

/* 标签页 */
.maintenance-tabs :deep(.el-tabs__header) {
  margin-bottom: 16px;
}

/* 表格工具栏 */
.table-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.toolbar-right {
  display: flex;
  gap: 8px;
}

.vm-name {
  font-weight: 500;
}

/* 候选节点介绍 */
.candidates-intro {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  background: #f5f7fa;
  border-radius: 4px;
  margin-bottom: 16px;
  color: #606266;
  font-size: 14px;
}

.candidates-intro .el-icon {
  color: #409eff;
}

/* 进度区域 */
.progress-section {
  padding: 8px 0;
}

.progress-overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  padding: 16px;
  background: #f5f7fa;
  border-radius: 8px;
}

.section-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
  margin: 16px 0 12px;
}

.steps {
  max-width: 800px;
  margin: 0 auto;
}

/* 表单提示 */
.form-tip {
  font-size: 12px;
  color: #909399;
  margin-top: 4px;
}

/* 下拉选项 */
.option-node {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

/* 响应式 */
@media (max-width: 1200px) {
  .status-content {
    grid-template-columns: repeat(2, 1fr);
  }

  .progress-overview {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

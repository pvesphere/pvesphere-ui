<template>
  <div class="node-maintenance">
    <el-card class="box-card">
      <template #header>
        <div class="card-header">
          <span>{{ $t('node.maintenanceTitle') }}</span>
          <div>
            <el-button 
              v-if="maintenanceResult?.status === 'completed'" 
              type="success" 
              @click="handleEndMaintenance"
            >
              {{ $t('node.endMaintenance') }}
            </el-button>
            <el-button 
              type="primary" 
              @click="handleStartMaintenance" 
              :disabled="!selectedNode || maintenanceResult?.status === 'migrating'"
            >
              {{ $t('node.startMaintenance') }}
            </el-button>
          </div>
        </div>
      </template>
      
      <el-alert
        v-if="selectedNode"
        :title="$t('node.selectedNode')"
        :description="selectedNode.node_name"
        type="info"
        :closable="false"
        show-icon
      />

      <!-- VM列表 -->
      <el-table :data="nodeVMs" v-loading="vmsLoading" style="margin-top: 16px">
        <el-table-column prop="vm_id" label="VM ID" width="100" />
        <el-table-column prop="vm_name" label="VM名称" />
        <el-table-column prop="status" label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="row.status === 'running' ? 'success' : 'info'">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>

      <!-- 可迁移目标节点 -->
      <el-divider />
      <h4>{{ $t('node.candidates') }}</h4>
      <el-table :data="candidates" v-loading="candidatesLoading">
        <el-table-column prop="node_name" label="节点名称" />
        <el-table-column prop="cpu_cores" label="CPU核心" />
        <el-table-column prop="cpu_usage" label="CPU使用率">
          <template #default="{ row }">
            {{ (row.cpu_usage || 0).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column prop="mem_usage" label="内存使用率">
          <template #default="{ row }">
            {{ (row.mem_usage || 0).toFixed(1) }}%
          </template>
        </el-table-column>
        <el-table-column prop="vm_count" label="VM数量" />
        <el-table-column prop="score" label="调度评分">
          <template #default="{ row }">
            <el-progress :percentage="Math.round(row.score || 0)" :status="row.score > 70 ? 'success' : row.score > 40 ? 'warning' : 'exception'" />
          </template>
        </el-table-column>
      </el-table>

      <!-- 维护进度 -->
      <el-divider />
      <h4>{{ $t('node.progress') }}</h4>
      <el-steps v-if="maintenanceResult" :active="getStepActive()" finish-status="success">
        <el-step :title="$t('node.step1')" :status="maintenanceResult.status === 'failed' ? 'error' : 'wait'" />
        <el-step :title="$t('node.step2')" :status="maintenanceResult.status === 'migrating' ? 'process' : maintenanceResult.status === 'failed' ? 'error' : 'wait'" />
        <el-step :title="$t('node.step3')" :status="maintenanceResult.status === 'completed' ? 'success' : maintenanceResult.status === 'failed' ? 'error' : 'wait'" />
      </el-steps>

      <el-result
        v-if="maintenanceResult?.status === 'failed'"
        icon="error"
        title="维护失败"
        :sub-title="`成功: ${maintenanceResult.migrated_vms}, 失败: ${maintenanceResult.failed_vms}`"
      />

      <el-table v-if="maintenanceResult?.tasks?.length" :data="maintenanceResult.tasks" style="margin-top: 16px">
        <el-table-column prop="vm_name" label="VM" />
        <el-table-column prop="target_node" label="目标节点" />
        <el-table-column prop="status" label="状态">
          <template #default="{ row }">
            <el-tag :type="getStatusType(row.status)">
              {{ row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="error" label="错误信息" v-if="maintenanceResult.tasks?.some(t => t.error)" />
      </el-table>
    </el-card>

    <!-- 开始维护对话框 -->
    <el-dialog v-model="dialogVisible" :title="$t('node.dialogTitle')" width="600px">
      <el-alert
        :title="$t('node.confirmMaintenance')"
        type="warning"
        :closable="false"
        style="margin-bottom: 16px"
      />
      
      <el-form :model="form" label-width="120px">
        <el-form-item :label="$t('node.mode')">
          <el-radio-group v-model="form.mode">
            <el-radio value="auto">{{ $t('node.modeAuto') }}</el-radio>
            <el-radio value="manual">{{ $t('node.modeManual') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        
        <!-- 手动模式：选择目标节点 -->
        <el-form-item :label="$t('node.selectTargetNodes')" v-if="form.mode === 'manual'">
          <el-select
            v-model="form.targetNodes"
            multiple
            collapse-tags
            collapse-tags-tooltip
            placeholder="选择目标节点"
            style="width: 100%"
          >
            <el-option
              v-for="c in candidates"
              :key="c.node_id"
              :label="c.node_name"
              :value="c.node_id"
            >
              <span>{{ c.node_name }}</span>
              <span style="float: right; color: #8492a6; font-size: 13px">
                Score: {{ c.score?.toFixed(1) }}
              </span>
            </el-option>
          </el-select>
        </el-form-item>
        
        <el-form-item :label="$t('node.concurrency')">
          <el-input-number v-model="form.concurrency" :min="1" :max="10" />
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
import { ref, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { fetchMigrateCandidates, fetchNodeVMs, startMaintenance, endMaintenance, type MigrateCandidate, type NodeVMItem, type NodeMaintenanceResult } from "@/api/pve";

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

const nodeVMs = ref<NodeVMItem[]>([]);
const candidates = ref<MigrateCandidate[]>([]);
const maintenanceResult = ref<NodeMaintenanceResult | null>(null);

const form = ref({
  mode: "auto" as "auto" | "manual",
  concurrency: 3,
  targetNodes: [] as number[]
});

watch(() => props.selectedNode, async (node) => {
  if (!node) return;
  
  // 加载VM列表
  vmsLoading.value = true;
  try {
    const res = await fetchNodeVMs(node.id);
    nodeVMs.value = res.data?.data || [];
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "获取VM列表失败");
  } finally {
    vmsLoading.value = false;
  }

  // 加载可迁移节点
  candidatesLoading.value = true;
  try {
    const res = await fetchMigrateCandidates(node.id);
    candidates.value = res.data?.data || [];
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "获取候选节点失败");
  } finally {
    candidatesLoading.value = false;
  }
}, { immediate: true });

const handleStartMaintenance = () => {
  form.value.mode = "auto";
  form.value.concurrency = 3;
  form.value.targetNodes = [];
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
    const res = await startMaintenance({
      node_id: String(props.selectedNode.id),
      mode: form.value.mode,
      concurrency: form.value.concurrency,
      target_nodes: form.value.mode === "manual" ? form.value.targetNodes : undefined
    });
    maintenanceResult.value = res.data?.data;
    ElMessage.success("维护已开始");
    dialogVisible.value = false;
    
    // 开始轮询进度
    startPolling();
  } catch (e: any) {
    console.error(e);
    ElMessage.error(e?.response?.data?.message || "启动维护失败");
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
    maintenanceResult.value = null;
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
  
  // 每5秒轮询一次
  pollingTimer.value = window.setInterval(async () => {
    if (!props.selectedNode || !maintenanceResult.value) return;
    
    // 如果已经完成或失败，停止轮询
    if (maintenanceResult.value.status === 'completed' || maintenanceResult.value.status === 'failed') {
      stopPolling();
      return;
    }
    
    try {
      // 这里可以添加获取进度的API，目前暂时重新获取状态
      // 实际应该添加专门的进度查询接口
    } catch (e) {
      console.error(e);
    }
  }, 5000);
};

const stopPolling = () => {
  if (pollingTimer.value) {
    clearInterval(pollingTimer.value);
    pollingTimer.value = null;
  }
};

const getStepActive = () => {
  if (!maintenanceResult.value) return 0;
  switch (maintenanceResult.value.status) {
    case 'maintenance': return 1;
    case 'migrating': return 2;
    case 'completed': return 3;
    case 'failed': return 2;
    default: return 0;
  }
};

const getStatusType = (status: string) => {
  const map: Record<string, any> = {
    pending: "info",
    migrating: "warning",
    completed: "success",
    failed: "exception"
  };
  return map[status] || "info";
};
</script>

<style scoped>
.node-maintenance {
  padding: 16px;
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { ElMessage } from "element-plus";
import { useI18n } from "vue-i18n";
import IconifyIconOffline from "@/components/ReIcon/src/iconifyIconOffline";
import {
  fetchClusterTasks,
  fetchNodeTasks,
  fetchTaskLog,
  fetchTaskStatus,
  stopTask,
  fetchClusters,
  fetchNodes,
  type Task,
  type Cluster,
  type Node
} from "@/api/pve";

const { t } = useI18n();

defineOptions({
  name: "LayTaskbar"
});

const visible = ref(true); // 默认显示
const collapsed = ref(true); // 是否折叠，默认折叠
const loading = ref(false);
const tasks = ref<Task[]>([]);
const clusters = ref<Cluster[]>([]);
const selectedClusterId = ref<number | null>(null);
const selectedTask = ref<Task | null>(null);
const taskLogs = ref<any[]>([]);
const logLoading = ref(false);
const logVisible = ref(false);
const activeTab = ref("tasks");
const stopLoading = ref(false);

let refreshTimer: number | null = null;

// Tasks 标签页显示所有任务
const allTasksList = computed(() => {
  return tasks.value;
});

// 运行中的任务数量（用于 badge 显示）
const activeTasksCount = computed(() => {
  return tasks.value.filter(t => {
    const status = (t.status || "").toLowerCase();
    return status === "running" || status === "active" || (!t.endtime || t.endtime === 0);
  }).length;
});

const loadClusters = async () => {
  try {
    const res = await fetchClusters();
    clusters.value = res?.data?.list ?? [];
    if (clusters.value.length > 0 && !selectedClusterId.value) {
      selectedClusterId.value = clusters.value[0].id;
    }
  } catch (error) {
    console.warn("加载集群列表失败", error);
  }
};

const loadTasks = async () => {
  if (!selectedClusterId.value) return;
  loading.value = true;
  try {
    // 先获取集群下的所有节点
    let nodes: Node[] = [];
    try {
      const nodeRes = await fetchNodes({
        cluster_id: selectedClusterId.value,
        page: 1,
        page_size: 100
      });
      nodes = nodeRes?.data?.list ?? [];
    } catch (error) {
      console.warn("获取节点列表失败，继续尝试获取任务:", error);
      // 即使获取节点失败，也继续尝试获取集群任务
    }

    // 使用 Promise.allSettled 而不是 Promise.all，这样单个请求失败不会影响其他请求
    const taskPromises: Promise<any>[] = [
      fetchClusterTasks({ cluster_id: selectedClusterId.value }).catch(err => {
        console.warn("获取集群任务失败:", err);
        return { data: [] };
      })
    ];

    // 为每个节点获取任务
    nodes.forEach(node => {
      taskPromises.push(
        fetchNodeTasks({
          cluster_id: selectedClusterId.value,
          node_name: node.node_name
        }).catch(err => {
          console.warn(`获取节点 ${node.node_name} 任务失败:`, err);
          return { data: [] };
        })
      );
    });

    // 使用 Promise.allSettled 确保所有请求都完成，即使有失败的
    const taskResults = await Promise.allSettled(taskPromises);

    const allTasks: Task[] = [];
    taskResults.forEach((result, index) => {
      // 检查请求是否成功
      if (result.status === 'fulfilled') {
        const res = result.value;
        if (res?.data && Array.isArray(res.data)) {
          // 第一个是集群任务，后续是节点任务
          if (index === 0) {
            // 集群任务，data 直接是 Task[]
            allTasks.push(...res.data);
          } else {
            // 节点任务，data 直接是 Task[]，需要从 extra.node 或节点名称获取 node 字段
            const nodeName = nodes[index - 1]?.node_name;
            const nodeTasks = res.data.map((task: Task) => ({
              ...task,
              node: task.node || task.extra?.node || nodeName
            }));
            allTasks.push(...nodeTasks);
          }
        }
      } else {
        // 请求失败，记录错误但不中断流程
        console.warn(`任务请求 ${index} 失败:`, result.reason);
      }
    });

    // 去重并排序（最新的在前）
    const taskMap = new Map<string, Task>();
    allTasks.forEach(task => {
      const key = task.upid || `${task.type}-${task.id}-${task.node || ''}`;
      if (!taskMap.has(key) || (task.starttime || 0) > (taskMap.get(key)?.starttime || 0)) {
        taskMap.set(key, task);
      }
    });
    tasks.value = Array.from(taskMap.values()).sort(
      (a, b) => (b.starttime || 0) - (a.starttime || 0)
    );
    
    // 调试信息
    console.log("加载的任务数据:", {
      total: tasks.value.length,
      tasks: tasks.value,
      activeTasksCount: activeTasksCount.value
    });
  } catch (error) {
    console.error("获取任务列表失败:", error);
    // 只在严重错误时显示错误消息，避免频繁弹窗
    // ElMessage.error("获取任务列表失败");
  } finally {
    loading.value = false;
  }
};

const loadTaskLog = async (task: Task) => {
  if (!task.upid || !selectedClusterId.value) return;
  logLoading.value = true;
  logVisible.value = true;
  selectedTask.value = task;
  try {
    // 构建参数，只传必要的字段，node_name 只在有值时才传
    const params: any = {
      cluster_id: selectedClusterId.value,
      upid: task.upid,
      start: 0,
      limit: 100
    };
    // 从 task.node 或 task.extra?.node 获取节点名称
    const nodeName = task.node || task.extra?.node;
    if (nodeName) {
      params.node_name = nodeName;
    }
    const res = await fetchTaskLog(params);
    taskLogs.value = res?.data ?? [];
  } catch (error) {
    ElMessage.error("获取任务日志失败");
    taskLogs.value = [];
  } finally {
    logLoading.value = false;
  }
};

const handleStopTask = async () => {
  if (!selectedTask.value || !selectedTask.value.upid || !selectedClusterId.value) return;
  stopLoading.value = true;
  try {
    const nodeName = selectedTask.value.node || selectedTask.value.extra?.node;
    await stopTask({
      cluster_id: selectedClusterId.value,
      node_name: nodeName,
      upid: selectedTask.value.upid
    });
    ElMessage.success("已发送终止任务请求");
    // 终止后刷新任务列表和日志
    await loadTasks();
    await loadTaskStatus(selectedTask.value);
  } catch (error) {
    ElMessage.error("终止任务失败");
  } finally {
    stopLoading.value = false;
  }
};

const loadTaskStatus = async (task: Task) => {
  if (!task.upid || !selectedClusterId.value) return;
  try {
    // 构建参数，只传必要的字段，node_name 只在有值时才传
    const params: any = {
      cluster_id: selectedClusterId.value,
      upid: task.upid
    };
    // 从 task.node 或 task.extra?.node 获取节点名称
    const nodeName = task.node || task.extra?.node;
    if (nodeName) {
      params.node_name = nodeName;
    }
    const res = await fetchTaskStatus(params);
    // 更新任务状态
    const index = tasks.value.findIndex(t => t.upid === task.upid);
    if (index !== -1 && res?.data) {
      // 合并状态数据，确保 node 字段正确
      const updatedTask = {
        ...tasks.value[index],
        ...res.data,
        node: res.data.node || res.data.extra?.node || tasks.value[index].node
      };
      tasks.value[index] = updatedTask;
    }
  } catch (error) {
    console.warn("获取任务状态失败", error);
  }
};

const startAutoRefresh = () => {
  if (refreshTimer) return;
  // 只在展开且可见时启动自动刷新
  if (!collapsed.value && visible.value) {
    refreshTimer = window.setInterval(() => {
      if (visible.value && !collapsed.value && selectedClusterId.value) {
        loadTasks();
        // 更新运行中任务的状态
        tasks.value.forEach(task => {
          const status = (task.status || "").toLowerCase();
          if (status === "running" || status === "active" || (!task.endtime || task.endtime === 0)) {
            loadTaskStatus(task);
          }
        });
      }
    }, 3000); // 每3秒刷新一次
  }
};

const stopAutoRefresh = () => {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
};

const toggleCollapse = () => {
  collapsed.value = !collapsed.value;
  if (!collapsed.value && visible.value) {
    // 展开时加载任务并启动自动刷新
    loadTasks();
    startAutoRefresh();
  } else {
    // 折叠时停止自动刷新
    stopAutoRefresh();
  }
};

// 格式化时间为 ProxmoxVE 风格：Dec 02 12:55:50
const formatTime = (timestamp?: number) => {
  if (!timestamp) return "-";
  const date = new Date(timestamp * 1000);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${month} ${day} ${hours}:${minutes}:${seconds}`;
};

// 获取任务描述
const getTaskDescription = (task: Task) => {
  // 尝试从不同字段获取描述
  if (task.description) return task.description;
  if (task.type && task.id) {
    // 根据类型生成描述
    const typeMap: Record<string, string> = {
      vncproxy: "VNC Proxy",
      vncwebsocket: "VNC WebSocket",
      startall: "Start All",
      stopall: "Stop All",
      migrate: "Migrate",
      clone: "Clone",
      create: "Create",
      start: "Start",
      stop: "Stop",
      shutdown: "Shutdown",
      reboot: "Reboot",
      suspend: "Suspend",
      resume: "Resume",
      destroy: "Destroy"
    };
    const typeName = typeMap[task.type] || task.type;
    if (task.id.startsWith("VM ") || task.id.startsWith("vm-")) {
      return `${task.id} - ${typeName}`;
    }
    return `${typeName} ${task.id}`;
  }
  return task.type || "-";
};

// 获取状态文本和样式
const getStatusInfo = (task: Task) => {
  const status = (task.status || "").toLowerCase();
  const exitstatus = task.exitstatus;
  
  if (status === "ok" || (status === "stopped" && exitstatus === "OK")) {
    return { text: "OK", type: "success", isError: false };
  }
  if (status === "error" || status === "failed" || exitstatus === "ERROR") {
    const errorMsg = task.exitstatus || task.status || "Error";
    return { text: `Error: ${errorMsg}`, type: "danger", isError: true };
  }
  if (status === "running" || status === "active") {
    return { text: "Running", type: "info", isError: false };
  }
  return { text: status || "-", type: "info", isError: false };
};

// 获取行样式类（Element Plus row-class-name 格式）
const getRowClassName = ({ row }: { row: Task }) => {
  const statusInfo = getStatusInfo(row);
  return statusInfo.isError ? "task-row-error" : "";
};


onMounted(async () => {
  await loadClusters();
  // 默认折叠状态，不自动加载任务和启动刷新
  // 只有在用户点击展开时才会加载任务
});

onUnmounted(() => {
  stopAutoRefresh();
});
</script>

<template>
  <div class="taskbar-container">
    <!-- 任务栏底部面板 -->
    <div class="taskbar-panel" :class="{ collapsed: collapsed }">
      <!-- 任务栏头部 -->
      <div class="taskbar-header-bar" @click="toggleCollapse">
        <div class="taskbar-header-left">
          <IconifyIconOffline 
            :icon="collapsed ? 'ep:arrow-up' : 'ep:arrow-down'" 
            class="taskbar-collapse-icon"
          />
          <span class="taskbar-header-title">{{ t('pve.cluster.taskList') }}</span>
          <el-badge
            v-if="activeTasksCount > 0"
            :value="activeTasksCount"
            class="ml-2"
          />
        </div>
        <div class="taskbar-header-right">
          <span class="taskbar-header-info">{{ t('pve.cluster.clusterTasks') }}</span>
        </div>
      </div>

      <!-- 任务栏内容 -->
      <div v-show="!collapsed" class="taskbar-content-wrapper">
        <div class="taskbar-content">
        <!-- 集群选择 -->
        <div class="mb-4 flex items-center gap-2">
          <span class="text-sm">{{ t('pve.cluster.clusterName') }}：</span>
          <el-select
            v-model="selectedClusterId"
            class="w-64"
            filterable
            :placeholder="t('pve.common.pleaseSelect')"
            @change="loadTasks"
          >
            <el-option
              v-for="item in clusters"
              :key="item.id"
              :label="item.cluster_name_alias || item.cluster_name"
              :value="item.id"
            />
          </el-select>
          <el-button type="primary" size="small" @click="loadTasks">
            {{ t('pve.common.refresh') }}
          </el-button>
        </div>

        <el-tabs v-model="activeTab" class="task-tabs">
          <el-tab-pane :label="t('pve.cluster.taskList')" name="tasks">
            <div v-if="!loading && allTasksList.length === 0" class="text-center py-8 text-gray-400">
              {{ t('pve.cluster.noTasksAvailable') }}
            </div>
            <el-table
              v-else
              v-loading="loading"
              :data="allTasksList"
              border
              stripe
              size="small"
              max-height="500"
              :row-class-name="getRowClassName"
              @row-click="(row) => loadTaskLog(row)"
              style="cursor: pointer;"
            >
              <el-table-column :label="t('pve.cluster.taskStartTime')" width="140" sortable prop="starttime">
                <template #default="{ row }">
                  {{ formatTime(row.starttime) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.cluster.taskEndTime')" width="140" sortable prop="endtime">
                <template #default="{ row }">
                  {{ formatTime(row.endtime) }}
                </template>
              </el-table-column>
              <el-table-column prop="node" :label="t('pve.cluster.taskNode')" width="120" />
              <el-table-column prop="user" label="User" width="140" />
              <el-table-column :label="t('pve.common.description')" min-width="200">
                <template #default="{ row }">
                  {{ getTaskDescription(row) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.cluster.taskStatus')" width="200">
                <template #default="{ row }">
                  <span :class="getStatusInfo(row).isError ? 'status-error' : 'status-ok'">
                    {{ getStatusInfo(row).text }}
                  </span>
                </template>
              </el-table-column>
            </el-table>
          </el-tab-pane>
        </el-tabs>
        </div>
      </div>
    </div>

    <!-- 任务日志对话框 -->
    <el-dialog
      v-model="logVisible"
      :title="`${t('pve.cluster.taskList')} - ${selectedTask?.type || ''} ${selectedTask?.id || ''}`"
      width="70%"
      :destroy-on-close="true"
      :append-to-body="true"
      :close-on-click-modal="true"
    >
      <el-skeleton v-if="logLoading" animated :rows="10" />
      <div v-else class="task-log-container">
        <pre class="task-log-content">{{
          taskLogs.map(log => (typeof log === 'string' ? log : log.t || JSON.stringify(log))).join('\n')
        }}</pre>
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="logVisible = false">{{ t('pve.common.close') }}</el-button>
          <el-button
            type="danger"
            :loading="stopLoading"
            :disabled="!selectedTask"
            @click="handleStopTask"
          >
            {{ t('pve.cluster.taskList') }}
          </el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
.taskbar-container {
  position: relative;
  width: 100%;
  margin-top: 0; // 外层包裹已处理间距
  pointer-events: auto; // 允许内部弹窗可点击
}

.taskbar-panel {
  width: 100%;
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color);
  border-radius: 4px; // 与列表卡片圆角保持一致
  box-shadow: none; // 与上方列表保持一致，不做凸起阴影
  pointer-events: auto; // 面板本身可以交互
  transition: max-height 0.3s ease;
  max-height: 50vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  &.collapsed {
    max-height: 40px;
    overflow: hidden;
  }
}

.taskbar-header-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 16px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color);
  cursor: pointer;
  user-select: none;
  min-height: 44px;

  &:hover {
    background: var(--el-fill-color-lighter);
  }

  .taskbar-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .taskbar-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--el-text-color-regular);
    font-size: 13px;
  }

  .taskbar-collapse-icon {
    font-size: 16px;
    color: var(--el-text-color-regular);
    transition: transform 0.3s ease;
  }

  .taskbar-header-title {
    font-weight: 600;
    font-size: 14px;
    color: var(--el-text-color-primary);
  }

  .taskbar-header-info {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.taskbar-content-wrapper {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.taskbar-content {
  padding: 16px;
  overflow-y: auto;
  flex: 1;
  background: var(--el-bg-color);
}

.task-log-container {
  max-height: 500px;
  overflow: auto;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
  padding: 12px;
}

.task-log-content {
  margin: 0;
  font-family: "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-wrap: break-word;
  color: var(--el-text-color-primary);
}

// 任务行样式
:deep(.task-row-error) {
  background-color: var(--el-color-error-light-9) !important;
  
  &:hover {
    background-color: var(--el-color-error-light-8) !important;
  }
}

// 状态样式
.status-ok {
  color: var(--el-text-color-regular);
}

.status-error {
  color: var(--el-color-error);
  font-weight: 500;
}
</style>


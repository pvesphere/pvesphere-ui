<!--
  ~ Copyright (c) 2025 PveSphere Contributors
  ~
  ~ Licensed under the Apache License, Version 2.0 (the "License");
  ~ you may not use this file except in compliance with the License.
  ~ You may obtain a copy of the License at
  ~
  ~     http://www.apache.org/licenses/LICENSE-2.0
  ~
  ~ Unless required by applicable law or agreed to in writing, software
  ~ distributed under the License is distributed on an "AS IS" BASIS,
  ~ WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
  ~ See the License for the specific language governing permissions and
  ~ limitations under the License.
-->

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import { Check, Close, VideoPlay, VideoPause, Document, Plus, ArrowDown } from "@element-plus/icons-vue";
import { 
  fetchClusters, 
  fetchClusterDetail, 
  fetchClusterStatus,
  fetchClusterResources,
  deleteCluster,
  verifyClusterApi,
  updateCluster,
  type Cluster,
  type ClusterResource
} from "@/api/pve";
import ClusterFormDialog from "./components/ClusterFormDialog.vue";

const { t } = useI18n();

const loading = ref(false);
const allClusters = ref<Cluster[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 筛选条件
const envFilter = ref<string | null>(null);
const regionFilter = ref<string | null>(null);
const keyword = ref("");

const detailVisible = ref(false);
const detailLoading = ref(false);
const detailData = ref<Cluster | null>(null);
const clusterStatus = ref<any>(null);
const clusterResources = ref<ClusterResource[]>([]);
const selectedClusterId = ref<number | null>(null);

// 表单对话框
const formDialogVisible = ref(false);
const formDialogCluster = ref<Cluster | null>(null);
const verifyingApi = ref<Record<number, boolean>>({});

const envOptions = computed(() => {
  const set = new Set<string>();
  allClusters.value.forEach(c => c.env && set.add(c.env));
  return Array.from(set);
});

const regionOptions = computed(() => {
  const set = new Set<string>();
  allClusters.value.forEach(c => c.region && set.add(c.region));
  return Array.from(set);
});

const filteredClusters = computed(() => {
  return allClusters.value.filter(c => {
    if (envFilter.value && c.env !== envFilter.value) return false;
    if (regionFilter.value && c.region !== regionFilter.value) return false;

    if (keyword.value) {
      const kw = keyword.value.toLowerCase();
      const combined =
        (c.cluster_name || "") +
        (c.cluster_name_alias || "") +
        (c.datacenter || "");
      if (!combined.toLowerCase().includes(kw)) return false;
    }

    return true;
  });
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  const list = filteredClusters.value.slice(start, end);
  total.value = filteredClusters.value.length;
  return list;
});

const handleSearch = async () => {
  loading.value = true;
  try {
    const res = await fetchClusters();
    allClusters.value = res?.data?.list ?? [];
    currentPage.value = 1;
  } catch (error) {
    ElMessage.error("获取集群列表失败");
  } finally {
    loading.value = false;
  }
};

// 计算属性：从资源列表中统计各类信息
const clusterInfo = computed(() => {
  if (!clusterStatus.value || clusterStatus.value.length === 0) return null;
  return clusterStatus.value.find((item: any) => item.type === 'cluster');
});

const nodesFromStatus = computed(() => {
  if (!clusterStatus.value) return [];
  return clusterStatus.value.filter((item: any) => item.type === 'node');
});

const onlineNodes = computed(() => {
  return nodesFromStatus.value.filter((node: any) => node.online === 1).length;
});

const offlineNodes = computed(() => {
  return nodesFromStatus.value.filter((node: any) => node.online !== 1).length;
});

// 虚拟机统计
const vmResources = computed(() => {
  if (!clusterResources.value) return [];
  return clusterResources.value.filter(r => r.type === 'qemu');
});

const runningVMs = computed(() => {
  return vmResources.value.filter(vm => vm.status === 'running').length;
});

const stoppedVMs = computed(() => {
  return vmResources.value.filter(vm => vm.status === 'stopped').length;
});

const templateVMs = computed(() => {
  return vmResources.value.filter(vm => vm.template === 1).length;
});

// LXC Container统计
const lxcResources = computed(() => {
  if (!clusterResources.value) return [];
  return clusterResources.value.filter(r => r.type === 'lxc');
});

const runningLXC = computed(() => {
  return lxcResources.value.filter(lxc => lxc.status === 'running').length;
});

const stoppedLXC = computed(() => {
  return lxcResources.value.filter(lxc => lxc.status === 'stopped').length;
});

// 节点资源列表（合并status和resources数据）
const nodeResources = computed(() => {
  // 从 status 中获取节点基本信息（包含 online, ip, nodeid 等）
  const statusNodes = nodesFromStatus.value || [];
  
  // 从 resources 中获取节点资源数据（包含 cpu, mem, uptime 等）
  const resourceNodes = clusterResources.value?.filter(r => r.type === 'node') || [];
  
  // 合并两个数据源
  // 优先使用 resources 中的数据，因为它包含资源使用情况
  // 然后用 status 中的数据补充 online, ip, nodeid 等字段
  const mergedNodes = resourceNodes.map(resourceNode => {
    // 通过 name 或 id 匹配 status 中的节点
    // resources 中的 id 格式是 "node/nodename"
    const nodeName = resourceNode.name || resourceNode.id?.replace('node/', '');
    const statusNode = statusNodes.find((sn: any) => 
      sn.name === nodeName || sn.id === resourceNode.id
    );
    
    // 合并数据，确保 name 字段正确获取
    return {
      ...resourceNode,
      // 优先从 status 获取 name，如果没有则使用 resources 中的
      name: statusNode?.name || resourceNode.name || resourceNode.id?.replace('node/', ''),
      // 从 status 补充缺失的字段
      online: statusNode?.online ?? resourceNode.online,
      ip: statusNode?.ip ?? resourceNode.ip,
      nodeid: statusNode?.nodeid ?? resourceNode.nodeid,
      local: statusNode?.local ?? resourceNode.local,
      level: statusNode?.level ?? resourceNode.level
    };
  });
  
  // 如果 resources 中没有某些节点，但 status 中有，也要加入
  statusNodes.forEach((statusNode: any) => {
    const exists = mergedNodes.find(n => 
      n.name === statusNode.name || n.id === statusNode.id
    );
    if (!exists) {
      // 添加仅在 status 中存在的节点
      mergedNodes.push({
        id: statusNode.id,
        name: statusNode.name,
        type: 'node',
        online: statusNode.online,
        ip: statusNode.ip,
        nodeid: statusNode.nodeid,
        local: statusNode.local,
        level: statusNode.level,
        // 资源字段为 undefined，表格会显示为 0 或 -
        cpu: undefined,
        maxcpu: undefined,
        mem: undefined,
        maxmem: undefined,
        uptime: undefined
      } as any);
    }
  });
  
  // 按 nodeid 排序
  return mergedNodes.sort((a, b) => (a.nodeid || 0) - (b.nodeid || 0));
});

// 计算总资源
const totalCPU = computed(() => {
  let total = 0;
  let used = 0;
  nodeResources.value.forEach(node => {
    if (node.maxcpu) total += node.maxcpu;
    if (node.cpu && node.maxcpu) used += node.cpu * node.maxcpu;
  });
  return { total, used, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
});

const totalMemory = computed(() => {
  let total = 0;
  let used = 0;
  nodeResources.value.forEach(node => {
    if (node.maxmem) total += node.maxmem;
    if (node.mem) used += node.mem;
  });
  return { total, used, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
});

const totalStorage = computed(() => {
  let total = 0;
  let used = 0;
  nodeResources.value.forEach(node => {
    if (node.maxdisk) total += node.maxdisk;
    if (node.disk) used += node.disk;
  });
  return { total, used, percentage: total > 0 ? Math.round((used / total) * 100) : 0 };
});

// 格式化字节
const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
};

// 格式化运行时间
const formatUptime = (seconds: number) => {
  if (!seconds) return '-';
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${days} ${t('pve.node.days')} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

// 加载集群详情
const loadClusterDetail = async (clusterId: number) => {
  try {
    const [statusRes, resourcesRes] = await Promise.all([
      fetchClusterStatus({ cluster_id: clusterId }),
      fetchClusterResources({ cluster_id: clusterId })
    ]);
    
    clusterStatus.value = statusRes?.data || [];
    clusterResources.value = resourcesRes?.data || [];
    
    console.log("集群状态数据:", clusterStatus.value);
    console.log("集群资源数据:", clusterResources.value);
    console.log("合并后的节点数据:", nodeResources.value);
  } catch (error) {
    console.error("获取集群详情失败:", error);
    ElMessage.error("获取集群详情失败");
  }
};

const handleShowDetail = async (row: Cluster) => {
  detailVisible.value = true;
  detailLoading.value = true;
  selectedClusterId.value = row.id;
  
  try {
    detailData.value = row;
    await loadClusterDetail(row.id);
  } catch (error) {
    console.error(error);
  } finally {
    detailLoading.value = false;
  }
};

// 添加集群
const handleAdd = () => {
  formDialogCluster.value = null;
  formDialogVisible.value = true;
};

// 编辑集群
const handleEdit = (row: Cluster, event?: Event) => {
  event?.stopPropagation();
  formDialogCluster.value = row;
  formDialogVisible.value = true;
};

// 删除集群
const handleDelete = async (row: Cluster, event?: Event) => {
  event?.stopPropagation();
  
  try {
    await ElMessageBox.confirm(
      t('pve.cluster.deleteConfirmMessage', { name: row.cluster_name_alias || row.cluster_name }),
      t('pve.cluster.deleteConfirm'),
      {
        type: "warning",
        confirmButtonText: t('pve.common.delete'),
        cancelButtonText: t('pve.common.cancel')
      }
    );
  } catch {
    return;
  }

  loading.value = true;
  try {
    const res = await deleteCluster(row.id);
    if (res.code === 0) {
      ElMessage.success(t('pve.common.deleteSuccess'));
      await handleSearch();
    } else {
      ElMessage.error(res.message || t('pve.common.deleteFailed'));
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || t('pve.common.deleteFailed'));
  } finally {
    loading.value = false;
  }
};

// 验证API状态
const handleVerifyApi = async (row: Cluster, event?: Event) => {
  event?.stopPropagation();
  
  verifyingApi.value[row.id] = true;
  try {
    const res = await verifyClusterApi({
      cluster_id: row.id
    });

    if (res.code === 0) {
      if (res.data?.success) {
        const versionText = res.data.version ? ` (${t('pve.cluster.version')}: ${res.data.version})` : "";
        ElMessage.success(
          res.data.message || `${t('pve.cluster.verifyApiSuccess')}${versionText}`
        );
      } else {
        ElMessage.warning(res.data?.message || t('pve.cluster.verifyApiFailed'));
      }
    } else {
      ElMessage.error(res.message || t('pve.cluster.verifyApiFailed'));
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || t('pve.cluster.verifyApiFailed'));
  } finally {
    verifyingApi.value[row.id] = false;
  }
};

// 切换启用状态
const handleToggleEnabled = async (row: Cluster, event?: Event) => {
  event?.stopPropagation();
  
  const newStatus = row.is_enabled === 1 ? 0 : 1;
  const actionText = newStatus === 1 ? t('pve.cluster.enable') : t('pve.cluster.disable');
  const confirmTitle = newStatus === 1 ? t('pve.cluster.confirmEnable') : t('pve.cluster.confirmDisable');
  const confirmMessage = newStatus === 1 
    ? t('pve.cluster.confirmEnableMessage', { name: row.cluster_name_alias || row.cluster_name })
    : t('pve.cluster.confirmDisableMessage', { name: row.cluster_name_alias || row.cluster_name });
  
  try {
    await ElMessageBox.confirm(
      confirmMessage,
      confirmTitle,
      {
        type: "warning",
        confirmButtonText: actionText,
        cancelButtonText: t('pve.common.cancel')
      }
    );
  } catch {
    return;
  }

  loading.value = true;
  try {
    const res = await updateCluster(row.id, {
      is_enabled: newStatus
    });
    
    if (res.code === 0) {
      ElMessage.success(newStatus === 1 ? t('pve.cluster.enableSuccess') : t('pve.cluster.disableSuccess'));
      await handleSearch();
    } else {
      ElMessage.error(res.message || (newStatus === 1 ? t('pve.cluster.enableFailed') : t('pve.cluster.disableFailed')));
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || (newStatus === 1 ? t('pve.cluster.enableFailed') : t('pve.cluster.disableFailed')));
  } finally {
    loading.value = false;
  }
};

// 表单提交成功回调
const handleFormSuccess = () => {
  handleSearch();
};

// 处理更多操作
const handleMoreAction = (command: string, row: Cluster, event?: Event) => {
  event?.stopPropagation();
  
  switch (command) {
    case "edit":
      handleEdit(row, event);
      break;
    case "verify":
      handleVerifyApi(row, event);
      break;
    case "delete":
      handleDelete(row, event);
      break;
  }
};

// 处理行点击（排除操作列）
const handleRowClick = (row: Cluster) => {
  handleShowDetail(row);
};

onMounted(() => {
  handleSearch();
});
</script>

<template>
  <div class="pve-page">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-medium">{{ t('pve.cluster.title') }}</span>
          <el-button type="primary" @click="handleAdd">
            <el-icon><Plus /></el-icon>
            {{ t('pve.cluster.addCluster') }}
          </el-button>
        </div>
      </template>

      <div class="mb-4 flex items-center gap-3 overflow-x-auto">
        <el-select
          v-model="envFilter"
          class="w-44"
          clearable
          :placeholder="t('pve.node.env')"
        >
          <el-option
            v-for="item in envOptions"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>

        <el-select
          v-model="regionFilter"
          class="w-44"
          clearable
          :placeholder="t('pve.common.pleaseSelect')"
        >
          <el-option
            v-for="item in regionOptions"
            :key="item"
            :label="item"
            :value="item"
          />
        </el-select>

        <el-input
          v-model="keyword"
          class="w-72"
          clearable
          :placeholder="t('pve.common.search')"
        />

        <el-button type="primary" @click="handleSearch">
          {{ t('pve.common.refresh') }}
        </el-button>
      </div>

      <el-table
        v-loading="loading"
        :data="pagedData"
        border
        stripe
        style="width: 100%;"
        @row-click="handleRowClick"
      >
        <el-table-column prop="id" label="ID" min-width="80" />
        <el-table-column
          prop="cluster_name"
          :label="t('pve.cluster.clusterName')"
          min-width="160"
        />
        <el-table-column
          prop="cluster_name_alias"
          :label="t('pve.common.name')"
          min-width="180"
        />
        <el-table-column prop="env" :label="t('pve.node.env')" width="100" />
        <el-table-column prop="datacenter" :label="t('pve.cluster.datacenter')" min-width="140" />
        <el-table-column prop="region" :label="t('pve.cluster.region')" width="100" />
        <el-table-column
          :label="t('pve.node.schedulable')"
          width="120"
        >
          <template #default="{ row }">
            <el-tag :type="row.is_schedulable === 1 ? 'success' : 'info'" size="small">
              {{ row.is_schedulable === 1 ? t('pve.node.schedulableEnabled') : t('pve.node.schedulableDisabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('pve.common.status')"
          width="100"
        >
          <template #default="{ row }">
            <el-tag :type="row.is_enabled === 1 ? 'success' : 'info'" size="small">
              {{ row.is_enabled === 1 ? t('pve.cluster.enabled') : t('pve.cluster.disabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('pve.common.operate')" width="200" fixed="right">
          <template #default="{ row }">
            <div class="operate-buttons">
              <el-button
                type="primary"
                link
                size="small"
                :type="row.is_enabled === 1 ? 'warning' : 'success'"
                @click.stop="handleToggleEnabled(row, $event)"
              >
                {{ row.is_enabled === 1 ? t('pve.cluster.disable') : t('pve.cluster.enable') }}
              </el-button>
              <el-dropdown trigger="click" @command="(cmd) => handleMoreAction(cmd, row, $event)">
                <el-button type="primary" link size="small" @click.stop>
                  {{ t('pve.common.more') }} <el-icon class="el-icon--right"><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="edit">{{ t('pve.common.edit') }}</el-dropdown-item>
                    <el-dropdown-item command="verify" :disabled="verifyingApi[row.id]">
                      <span v-if="verifyingApi[row.id]">{{ t('pve.cluster.verifyingApi') }}</span>
                      <span v-else>{{ t('pve.cluster.verifyApi') }}</span>
                    </el-dropdown-item>
                    <el-dropdown-item command="delete" style="color: #f56c6c">
                      {{ t('pve.cluster.deleteCluster') }}
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </template>
        </el-table-column>
      </el-table>

      <div class="mt-4 flex justify-end">
        <el-pagination
          v-model:current-page="currentPage"
          v-model:page-size="pageSize"
          :page-sizes="[10, 20, 50, 100]"
          layout="total, sizes, prev, pager, next, jumper"
          :total="total"
        />
      </div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      :title="`${t('pve.cluster.clusterInfo')} - ${detailData?.cluster_name || ''}`"
      size="70%"
      :destroy-on-close="true"
    >
      <el-skeleton v-if="detailLoading" animated :rows="10" />
      <div v-else class="cluster-detail-container">
        <!-- Status & Nodes Section -->
        <div class="cluster-top-section">
          <!-- Status -->
          <el-card shadow="never" class="status-card">
            <template #header>
              <div class="card-title">{{ t('pve.common.status') }}</div>
            </template>
            <div class="status-content">
              <div class="status-icon">
                <el-icon :size="60" color="#67c23a"><Check /></el-icon>
              </div>
              <div class="status-info">
                <div class="status-text">
                  Cluster: {{ clusterInfo?.name || detailData?.cluster_name }}
                </div>
                <div class="status-text">
                  Quorate: {{ clusterInfo?.quorate === 1 ? 'Yes' : 'No' }}
                </div>
              </div>
            </div>
          </el-card>

          <!-- Nodes -->
          <el-card shadow="never" class="nodes-card">
            <template #header>
              <div class="card-title">Nodes</div>
            </template>
            <div class="nodes-stats">
              <div class="node-stat-item">
                <el-icon :size="20" color="#67c23a"><Check /></el-icon>
                <span class="node-stat-text">{{ t('pve.node.online') }}</span>
                <span class="node-stat-value">{{ onlineNodes }}</span>
              </div>
              <div class="node-stat-item">
                <el-icon :size="20" color="#f56c6c"><Close /></el-icon>
                <span class="node-stat-text">{{ t('pve.node.offline') }}</span>
                <span class="node-stat-value">{{ offlineNodes }}</span>
              </div>
            </div>
          </el-card>
        </div>

        <!-- Guests Section -->
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-title">Guests</div>
          </template>
          <div class="guests-section">
            <!-- Virtual Machines -->
            <div class="guest-category">
              <div class="guest-category-title">Virtual Machines</div>
              <div class="guest-stats">
                <div class="guest-stat-item">
                  <el-icon color="#67c23a"><VideoPlay /></el-icon>
                  <span>{{ t('pve.vm.running') }}</span>
                  <span class="stat-value">{{ runningVMs }}</span>
                </div>
                <div class="guest-stat-item">
                  <el-icon color="#909399"><VideoPause /></el-icon>
                  <span>{{ t('pve.vm.stopped') }}</span>
                  <span class="stat-value">{{ stoppedVMs }}</span>
                </div>
                <div class="guest-stat-item">
                  <el-icon color="#909399"><Document /></el-icon>
                  <span>Templates</span>
                  <span class="stat-value">{{ templateVMs }}</span>
                </div>
              </div>
            </div>

            <!-- LXC Container -->
            <div class="guest-category">
              <div class="guest-category-title">LXC Container</div>
              <div class="guest-stats">
                <div class="guest-stat-item">
                  <el-icon color="#67c23a"><VideoPlay /></el-icon>
                  <span>{{ t('pve.vm.running') }}</span>
                  <span class="stat-value">{{ runningLXC }}</span>
                </div>
                <div class="guest-stat-item">
                  <el-icon color="#909399"><VideoPause /></el-icon>
                  <span>{{ t('pve.vm.stopped') }}</span>
                  <span class="stat-value">{{ stoppedLXC }}</span>
                </div>
              </div>
            </div>
          </div>
        </el-card>

        <!-- Resources Section -->
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-title">Resources</div>
          </template>
          <div class="resources-section">
            <!-- CPU -->
            <div class="resource-item">
              <div class="resource-title">CPU</div>
              <div class="resource-chart">
                <el-progress 
                  type="circle" 
                  :percentage="totalCPU.percentage" 
                  :width="120"
                  :stroke-width="12"
                />
              </div>
              <div class="resource-info">
                {{ t('pve.node.of') }} {{ totalCPU.total }} CPU(s)
              </div>
            </div>

            <!-- Memory -->
            <div class="resource-item">
              <div class="resource-title">Memory</div>
              <div class="resource-chart">
                <el-progress 
                  type="circle" 
                  :percentage="totalMemory.percentage" 
                  :width="120"
                  :stroke-width="12"
                />
              </div>
              <div class="resource-info">
                {{ formatBytes(totalMemory.used) }} {{ t('pve.node.of') }} {{ formatBytes(totalMemory.total) }}
              </div>
            </div>

            <!-- Storage -->
            <div class="resource-item">
              <div class="resource-title">Storage</div>
              <div class="resource-chart">
                <el-progress 
                  type="circle" 
                  :percentage="totalStorage.percentage" 
                  :width="120"
                  :stroke-width="12"
                />
              </div>
              <div class="resource-info">
                {{ formatBytes(totalStorage.used) }} {{ t('pve.node.of') }} {{ formatBytes(totalStorage.total) }}
              </div>
            </div>
          </div>
        </el-card>

        <!-- Nodes List -->
        <el-card shadow="never" class="section-card">
          <template #header>
            <div class="card-title">Nodes</div>
          </template>
          <el-table :data="nodeResources" border stripe size="small">
            <el-table-column prop="name" :label="t('pve.common.name')" min-width="120" />
            <el-table-column label="ID" width="80">
              <template #default="{ row }">
                {{ row.nodeid || '-' }}
              </template>
            </el-table-column>
            <el-table-column :label="t('pve.node.online')" width="100">
              <template #default="{ row }">
                <el-tag :type="row.online === 1 ? 'success' : 'danger'" size="small">
                  {{ row.online === 1 ? '✓' : '✗' }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="Support" width="100">
              <template #default>
                <span>-</span>
              </template>
            </el-table-column>
            <el-table-column label="Server Address" min-width="140">
              <template #default="{ row }">
                {{ row.ip || '-' }}
              </template>
            </el-table-column>
            <el-table-column :label="t('pve.node.cpuUsage')" width="150">
              <template #default="{ row }">
                <el-progress 
                  :percentage="row.maxcpu ? Math.round((row.cpu || 0) * 100) : 0"
                  :show-text="true"
                  :stroke-width="6"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('pve.node.memUsage')" width="150">
              <template #default="{ row }">
                <el-progress 
                  :percentage="row.maxmem ? Math.round(((row.mem || 0) / row.maxmem) * 100) : 0"
                  :show-text="true"
                  :stroke-width="6"
                />
              </template>
            </el-table-column>
            <el-table-column :label="t('pve.node.uptime')" min-width="140">
              <template #default="{ row }">
                {{ formatUptime(row.uptime || 0) }}
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </el-drawer>

    <!-- 集群表单对话框 -->
    <ClusterFormDialog
      v-model="formDialogVisible"
      :cluster="formDialogCluster"
      @success="handleFormSuccess"
    />
  </div>
</template>

<style scoped>
.pve-page {
  padding: 12px;
}

.operate-buttons {
  display: flex;
  align-items: center;
  gap: 8px;
}

.cluster-detail-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.cluster-top-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.status-card,
.nodes-card,
.section-card {
  margin-bottom: 0;
}

.card-title {
  font-size: 16px;
  font-weight: 600;
}

.status-content {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 16px;
}

.status-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 80px;
  height: 80px;
  background-color: #f0f9ff;
  border-radius: 50%;
}

.status-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.status-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
}

.nodes-stats {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 16px;
}

.node-stat-item {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 14px;
}

.node-stat-text {
  flex: 1;
}

.node-stat-value {
  font-weight: 600;
  font-size: 16px;
}

.guests-section {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding: 16px;
}

.guest-category-title {
  font-size: 15px;
  font-weight: 600;
  margin-bottom: 12px;
}

.guest-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guest-stat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
}

.guest-stat-item .stat-value {
  margin-left: auto;
  font-weight: 600;
}

.resources-section {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  padding: 24px;
}

.resource-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.resource-title {
  font-size: 16px;
  font-weight: 600;
}

.resource-chart {
  display: flex;
  align-items: center;
  justify-content: center;
}

.resource-info {
  font-size: 13px;
  color: var(--el-text-color-secondary);
  text-align: center;
}

@media (max-width: 768px) {
  .cluster-top-section {
    grid-template-columns: 1fr;
  }

  .guests-section {
    grid-template-columns: 1fr;
  }

  .resources-section {
    grid-template-columns: 1fr;
  }
}
</style>



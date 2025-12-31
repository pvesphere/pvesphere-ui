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
import { ref, computed, onMounted, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import {
  fetchTemplates,
  fetchTemplateDetail,
  fetchClusters,
  fetchStorages,
  fetchNodes,
  uploadTemplate,
  importTemplate,
  fetchNodeStorageContent,
  syncTemplate,
  fetchTemplateInstances,
  fetchTemplateSyncTasks,
  retryTemplateSyncTask,
  deleteTemplate,
  type Template,
  type Cluster,
  type Storage,
  type Node,
  type TemplateDetail,
  type TemplateInstance,
  type TemplateSyncTask,
  type StorageContentItem
} from "@/api/pve";
import type { AxiosProgressEvent } from "axios";

const { t } = useI18n();

const loading = ref(false);
const allTemplates = ref<Template[]>([]);
const clusters = ref<Cluster[]>([]);
const storages = ref<Storage[]>([]);
const nodes = ref<Node[]>([]);

const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 筛选条件
const selectedClusterId = ref<number | null>(null);
const nameKeyword = ref("");
const descKeyword = ref("");

// 详情抽屉
const detailVisible = ref(false);
const detailLoading = ref(false);
const detailData = ref<TemplateDetail | null>(null);
const templateInstances = ref<TemplateInstance[]>([]);
const templateSyncTasks = ref<TemplateSyncTask[]>([]);

// 导入对话框（原上传对话框）
const uploadVisible = ref(false);
const uploadLoading = ref(false);
const uploadForm = ref({
  template_name: "",
  cluster_id: null as number | null,
  backup_storage_id: null as number | null,
  target_storage_id: null as number | null,
  node_id: null as number | null,
  backup_file: "",
  description: "",
  sync_node_names: [] as string[]
});
const clusterStorages = ref<Array<{ storage: Storage; node: Node; usagePercent: number }>>([]);
const loadingClusterStorages = ref(false);
const backupFiles = ref<StorageContentItem[]>([]);
const loadingBackupFiles = ref(false);

// 同步对话框
const syncVisible = ref(false);
const syncLoading = ref(false);
const syncForm = ref({
  template_id: null as number | null,
  enable_sync: false,
  target_node_names: [] as string[]
});
const availableNodes = ref<Array<{ id: number; name: string }>>([]);

const filteredTemplates = computed(() => {
  return allTemplates.value.filter(t => {
    if (
      selectedClusterId.value != null &&
      t.cluster_id !== selectedClusterId.value
    ) {
      return false;
    }

    if (
      nameKeyword.value &&
      !String(t.template_name)
        .toLowerCase()
        .includes(nameKeyword.value.toLowerCase())
    ) {
      return false;
    }

    if (
      descKeyword.value &&
      !String(t.description)
        .toLowerCase()
        .includes(descKeyword.value.toLowerCase())
    ) {
      return false;
    }

    return true;
  });
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  const list = filteredTemplates.value.slice(start, end);
  total.value = filteredTemplates.value.length;
  return list;
});

// 监听集群变化，加载节点存储信息
watch(() => uploadForm.value.cluster_id, async (newClusterId) => {
  if (!newClusterId) {
    clusterStorages.value = [];
    uploadForm.value.backup_storage_id = null;
    uploadForm.value.target_storage_id = null;
    uploadForm.value.node_id = null;
    uploadForm.value.backup_file = "";
    backupFiles.value = [];
    return;
  }
  
  loadingClusterStorages.value = true;
  try {
    // 获取该集群下的所有节点
    const nodeRes = await fetchNodes({ cluster_id: newClusterId });
    const clusterNodes = nodeRes?.data?.list ?? [];
    nodes.value = clusterNodes;
    
    // 按节点循环获取存储，确保获取所有数据
    clusterStorages.value = [];
    for (const node of clusterNodes) {
      try {
        // 按节点名称获取存储（后端可能支持按节点过滤）
        const storageRes = await fetchStorages({ 
          node_name: node.node_name,
          page_size: 100 
        });
        const nodeStorages = storageRes?.data?.list ?? [];
        
        // 过滤出属于当前集群的存储
        const clusterNodeStorages = nodeStorages.filter(s => 
          s.cluster_id === newClusterId
        );
        
        for (const storage of clusterNodeStorages) {
          const usagePercent = storage.total > 0 
            ? Math.round((storage.used / storage.total) * 100) 
            : 0;
          clusterStorages.value.push({
            storage,
            node,
            usagePercent
          });
        }
      } catch (error) {
        console.warn(`获取节点 ${node.node_name} 的存储失败:`, error);
      }
    }
  } catch (error) {
    console.warn("加载集群存储信息失败", error);
    clusterStorages.value = [];
  } finally {
    loadingClusterStorages.value = false;
  }
});

// 监听备份存储选择变化，加载备份文件列表
watch(() => uploadForm.value.backup_storage_id, async (newStorageId) => {
  if (!newStorageId) {
    uploadForm.value.backup_file = "";
    backupFiles.value = [];
    return;
  }
  
  const selectedStorage = clusterStorages.value.find(cs => cs.storage.id === newStorageId);
  if (!selectedStorage) {
    uploadForm.value.backup_file = "";
    backupFiles.value = [];
    return;
  }
  
  // 设置节点ID
  uploadForm.value.node_id = selectedStorage.node.id;
  
  // 加载备份文件列表
  loadingBackupFiles.value = true;
  try {
    const res = await fetchNodeStorageContent({
      node_id: selectedStorage.node.id,
      storage: selectedStorage.storage.storage_name,
      content: "backup"
    });
    backupFiles.value = res.data || [];
  } catch (error) {
    console.warn("获取备份文件列表失败", error);
    backupFiles.value = [];
    ElMessage.warning(t('pve.template.fetchBackupFilesFailed'));
  } finally {
    loadingBackupFiles.value = false;
  }
});

// 获取已选择备份存储对应的节点名称
const selectedStorageNodeName = computed(() => {
  if (!uploadForm.value.backup_storage_id) return null;
  const selectedStorage = clusterStorages.value.find(
    cs => cs.storage.id === uploadForm.value.backup_storage_id
  );
  return selectedStorage?.node.node_name || null;
});

// 可选的同步节点列表（排除已选择备份存储的节点）
const availableSyncNodes = computed(() => {
  if (!uploadForm.value.backup_storage_id) {
    // 如果没有选择备份存储，返回所有节点
    return nodes.value;
  }
  
  // 排除已选择备份存储对应的节点
  const excludedNodeName = selectedStorageNodeName.value;
  if (!excludedNodeName) {
    return nodes.value;
  }
  
  return nodes.value.filter(node => node.node_name !== excludedNodeName);
});

// 监听存储选择变化，自动从同步节点列表中移除对应的节点
watch(() => uploadForm.value.storage_id, (newStorageId, oldStorageId) => {
  if (newStorageId !== oldStorageId && newStorageId) {
    const selectedStorage = clusterStorages.value.find(
      cs => cs.storage.id === newStorageId
    );
    if (selectedStorage) {
      // 从同步节点列表中移除已选择存储对应的节点
      uploadForm.value.sync_node_names = uploadForm.value.sync_node_names.filter(
        name => name !== selectedStorage.node.node_name
      );
    }
  }
});

const loadBaseData = async () => {
  try {
    // 分别获取集群和存储，避免存储获取失败影响集群数据
    const clusterRes = await fetchClusters();
    clusters.value = clusterRes?.data?.list ?? [];
    
    // 存储数据在模板上传时按需加载，这里不需要预加载
    storages.value = [];
  } catch (error) {
    console.warn("加载基础数据失败", error);
    // 确保即使出错，clusters 也有默认值
    if (!clusters.value.length) {
      clusters.value = [];
    }
  }
};

const handleSearch = async () => {
  loading.value = true;
  try {
    const res = await fetchTemplates();
    allTemplates.value = res?.data?.list ?? [];
    currentPage.value = 1;
  } catch (error) {
    ElMessage.error(t('pve.template.fetchListFailed'));
  } finally {
    loading.value = false;
  }
};

const handleShowDetail = async (row: Template) => {
  detailVisible.value = true;
  detailLoading.value = true;
  try {
    const res = await fetchTemplateDetail(row.id, true);
    detailData.value = res.data;
    templateInstances.value = res.data.instances ?? [];
    
    // 加载同步任务
    const taskRes = await fetchTemplateSyncTasks({ template_id: row.id });
    templateSyncTasks.value = taskRes.data.list ?? [];
  } catch (error) {
    ElMessage.warning(t('pve.template.fetchDetailFailed'));
  } finally {
    detailLoading.value = false;
  }
};

const handleOpenUpload = () => {
  uploadVisible.value = true;
  uploadForm.value = {
    template_name: "",
    cluster_id: null,
    backup_storage_id: null,
    target_storage_id: null,
    node_id: null,
    backup_file: "",
    description: "",
    sync_node_names: []
  };
  clusterStorages.value = [];
  backupFiles.value = [];
};

const handleUpload = async () => {
  if (!uploadForm.value.template_name) {
    ElMessage.warning(t('pve.template.pleaseInputTemplateName'));
    return;
  }
  if (!uploadForm.value.cluster_id) {
    ElMessage.warning(t('pve.template.pleaseSelectCluster'));
    return;
  }
  if (!uploadForm.value.backup_storage_id) {
    ElMessage.warning(t('pve.template.pleaseSelectBackupStorage'));
    return;
  }
  if (!uploadForm.value.target_storage_id) {
    ElMessage.warning(t('pve.template.pleaseSelectTargetStorage'));
    return;
  }
  if (!uploadForm.value.node_id) {
    ElMessage.warning(t('pve.template.pleaseSelectBackupStorage'));
    return;
  }
  if (!uploadForm.value.backup_file) {
    ElMessage.warning(t('pve.template.pleaseSelectBackupFile'));
    return;
  }

  uploadLoading.value = true;
  try {
    // 将节点名称转换为节点ID
    const syncNodeIds = uploadForm.value.sync_node_names.length > 0
      ? nodes.value
          .filter(n => uploadForm.value.sync_node_names.includes(n.node_name))
          .map(n => n.id)
      : [];
    
    // 提取备份文件名（去除存储前缀）
    const backupFileName = extractBackupFileName(uploadForm.value.backup_file);
    
    await importTemplate({
      template_name: uploadForm.value.template_name,
      cluster_id: uploadForm.value.cluster_id!,
      node_id: uploadForm.value.node_id!,
      backup_storage_id: uploadForm.value.backup_storage_id!,
      backup_file: backupFileName,
      target_storage_id: uploadForm.value.target_storage_id!,
      description: uploadForm.value.description,
      sync_node_ids: syncNodeIds.length > 0 ? syncNodeIds : undefined
    });
    
    ElMessage.success(t('pve.template.importSuccess'));
    uploadVisible.value = false;
    await handleSearch();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.template.importFailed');
    ElMessage.error(msg);
  } finally {
    uploadLoading.value = false;
  }
};

const handleOpenSync = async (row: Template) => {
  syncVisible.value = true;
  syncForm.value = {
    template_id: row.id,
    enable_sync: false,
    target_node_names: []
  };
  
  // 加载可用节点
  try {
    const nodeRes = await fetchNodes({ cluster_id: row.cluster_id });
    availableNodes.value = (nodeRes?.data?.list ?? []).map(node => ({
      id: node.id,
      name: node.node_name
    }));
  } catch (error) {
    console.warn("加载节点列表失败", error);
    availableNodes.value = [];
  }
};

const handleSync = async () => {
  if (!syncForm.value.template_id || !syncForm.value.enable_sync) {
    ElMessage.warning(t('pve.template.pleaseEnableSync'));
    return;
  }
  if (syncForm.value.target_node_names.length === 0) {
    ElMessage.warning(t('pve.template.pleaseSelectTargetNodes'));
    return;
  }

  syncLoading.value = true;
  try {
    // 将节点名称转换为节点ID
    const targetNodeIds = availableNodes.value
      .filter(n => syncForm.value.target_node_names.includes(n.name))
      .map(n => n.id);
    
    await syncTemplate(syncForm.value.template_id, {
      target_node_ids: targetNodeIds
    });
    ElMessage.success(t('pve.template.syncTaskCreated'));
    syncVisible.value = false;
    if (detailVisible.value && detailData.value) {
      await handleShowDetail({ id: syncForm.value.template_id } as Template);
    }
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.template.syncFailed');
    ElMessage.error(msg);
  } finally {
    syncLoading.value = false;
  }
};

// 格式化文件大小
const formatFileSize = (bytes: number): string => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
};

// 从备份文件路径中提取文件名（去除存储前缀）
// 例如: "local:backup/vzdump-qemu-63054460-2025_12_25-09_41_20.vma.zst" -> "vzdump-qemu-63054460-2025_12_25-09_41_20.vma.zst"
const extractBackupFileName = (volid: string): string => {
  if (!volid) return '';
  // 如果包含冒号，说明有存储前缀，需要提取文件名
  if (volid.includes(':')) {
    // 格式: "storage:path/filename" 或 "local:backup/filename"
    const parts = volid.split(':');
    if (parts.length > 1) {
      const pathPart = parts[1];
      // 取最后一个斜杠之后的部分
      const lastSlashIndex = pathPart.lastIndexOf('/');
      if (lastSlashIndex >= 0) {
        return pathPart.substring(lastSlashIndex + 1);
      }
      return pathPart;
    }
  }
  // 如果没有冒号，可能已经是文件名，或者需要提取最后一个斜杠之后的部分
  const lastSlashIndex = volid.lastIndexOf('/');
  if (lastSlashIndex >= 0) {
    return volid.substring(lastSlashIndex + 1);
  }
  return volid;
};

const handleRetrySyncTask = async (taskId: number) => {
  try {
    await retryTemplateSyncTask(taskId);
    ElMessage.success(t('pve.template.retrySuccess'));
    if (detailData.value) {
      const taskRes = await fetchTemplateSyncTasks({ template_id: detailData.value.id });
      templateSyncTasks.value = taskRes.data.list ?? [];
    }
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.template.retryFailed');
    ElMessage.error(msg);
  }
};

const handleDelete = async (row: Template) => {
  try {
    await ElMessageBox.confirm(
      t('pve.template.deleteConfirmMessage', { name: row.template_name || row.id }),
      t('pve.template.deleteConfirm'),
      {
        type: "warning",
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        distinguishCancelAndClose: true
      }
    );
    
    // 删除模板，关联删除底层模板（cascade=true）
    await deleteTemplate(row.id, true);
    ElMessage.success(t('pve.template.deleteSuccess'));
    
    // 如果删除的是当前查看的模板，关闭详情抽屉
    if (detailVisible.value && detailData.value?.id === row.id) {
      detailVisible.value = false;
    }
    
    // 刷新列表
    await handleSearch();
  } catch (error: any) {
    // 用户取消删除，不显示错误
    if (error === 'cancel') {
      return;
    }
    const msg = error?.response?.data?.message || error?.message || t('pve.template.deleteFailed');
    ElMessage.error(msg);
  }
};

const getStatusType = (status: string) => {
  const statusMap: Record<string, string> = {
    pending: "info",
    syncing: "warning",
    completed: "success",
    failed: "danger",
    available: "success"
  };
  return statusMap[status] || "info";
};

onMounted(async () => {
  await loadBaseData();
  await handleSearch();
});
</script>

<template>
  <div class="pve-page">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-medium">{{ t('pve.template.title') }}</span>
          <el-button type="primary" @click="handleOpenUpload">
            {{ t('pve.template.uploadTemplate') }}
          </el-button>
        </div>
      </template>

      <div class="mb-4 flex items-center gap-3 overflow-x-auto">
        <el-select
          v-model="selectedClusterId"
          class="w-52"
          clearable
          filterable
          :placeholder="t('pve.common.pleaseSelect') + t('pve.cluster.clusterName')"
        >
          <el-option
            v-for="item in clusters"
            :key="item.id"
            :label="item.cluster_name_alias || item.cluster_name"
            :value="item.id"
          />
        </el-select>

        <el-input
          v-model="nameKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.template.templateName')"
        />

        <el-input
          v-model="descKeyword"
          class="w-72"
          clearable
          :placeholder="t('pve.common.description')"
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
        style="width: 100%"
        @row-click="handleShowDetail"
      >
        <el-table-column prop="id" label="ID" min-width="80" />
        <el-table-column
          prop="template_name"
          :label="t('pve.template.templateName')"
          min-width="200"
        />
        <el-table-column 
          prop="cluster_id" 
          :label="t('pve.cluster.clusterName')" 
          min-width="140"
        >
          <template #default="{ row }">
            {{ clusters.find(c => c.id === row.cluster_id)?.cluster_name_alias || clusters.find(c => c.id === row.cluster_id)?.cluster_name || row.cluster_id }}
          </template>
        </el-table-column>
        <el-table-column prop="description" :label="t('pve.common.description')" min-width="240" />
        <el-table-column :label="t('pve.common.operate')" width="250" fixed="right">
          <template #default="{ row }">
            <el-button type="primary" link @click.stop="handleShowDetail(row)">
              {{ t('pve.common.detail') }}
            </el-button>
            <el-button type="info" link @click.stop="handleOpenSync(row)">
              {{ t('pve.template.sync') }}
            </el-button>
            <el-button type="danger" link @click.stop="handleDelete(row)">
              {{ t('pve.common.delete') }}
            </el-button>
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

    <!-- 模板详情抽屉 -->
    <el-drawer
      v-model="detailVisible"
      :title="t('pve.template.templateDetail')"
      size="50%"
      :destroy-on-close="true"
    >
      <el-skeleton v-if="detailLoading" animated :rows="8" />
      <div v-else-if="detailData" class="space-y-4">
        <!-- 基本信息 -->
        <el-card shadow="never">
          <template #header>
            <span class="font-medium">{{ t('pve.vm.basicInfo') }}</span>
          </template>
          <div class="space-y-2 text-sm">
            <div><strong>ID：</strong>{{ detailData.id }}</div>
            <div><strong>{{ t('pve.template.templateName') }}：</strong>{{ detailData.template_name }}</div>
            <div><strong>{{ t('pve.cluster.clusterName') }}：</strong>{{ detailData.cluster_name || detailData.cluster_id }}</div>
            <div><strong>{{ t('pve.common.description') }}：</strong>{{ detailData.description || '-' }}</div>
            <div v-if="detailData.upload_info">
              <strong>{{ t('pve.template.uploadInfo') }}：</strong>
              <div class="ml-4 mt-1 space-y-1 text-xs">
                <div>{{ t('pve.template.storage') }}: {{ detailData.upload_info.storage_name }}</div>
                <div>{{ t('pve.template.fileName') }}: {{ detailData.upload_info.file_name }}</div>
                <div>{{ t('pve.template.fileSize') }}: {{ (detailData.upload_info.file_size / 1024 / 1024).toFixed(2) }} MB</div>
                <div>{{ t('pve.template.isShared') }}: {{ detailData.upload_info.is_shared ? t('pve.common.yes') : t('pve.common.no') }}</div>
                <div>{{ t('pve.common.status') }}: {{ detailData.upload_info.status }}</div>
              </div>
            </div>
          </div>
        </el-card>

        <!-- 模板实例 -->
        <el-card shadow="never" v-if="templateInstances.length > 0">
          <template #header>
            <span class="font-medium">{{ t('pve.template.instances') }}</span>
          </template>
          <el-table :data="templateInstances" border size="small">
            <el-table-column prop="node_name" :label="t('pve.node.nodeName')" min-width="120" />
            <el-table-column prop="vmid" label="VMID" width="100" />
            <el-table-column prop="storage_name" :label="t('pve.template.storage')" min-width="120" />
            <el-table-column prop="status" :label="t('pve.common.status')" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="is_primary" :label="t('pve.template.isPrimary')" width="100">
              <template #default="{ row }">
                <el-tag :type="row.is_primary ? 'success' : 'info'" size="small">
                  {{ row.is_primary ? t('pve.common.yes') : t('pve.common.no') }}
                </el-tag>
              </template>
            </el-table-column>
          </el-table>
        </el-card>

        <!-- 同步任务 -->
        <el-card shadow="never" v-if="templateSyncTasks.length > 0">
          <template #header>
            <span class="font-medium">{{ t('pve.template.syncTasks') }}</span>
          </template>
          <el-table :data="templateSyncTasks" border size="small">
            <el-table-column prop="target_node.node_name" :label="t('pve.template.targetNode')" min-width="120">
              <template #default="{ row }">
                {{ row.target_node?.node_name || '-' }}
              </template>
            </el-table-column>
            <el-table-column prop="status" :label="t('pve.common.status')" width="100">
              <template #default="{ row }">
                <el-tag :type="getStatusType(row.status)" size="small">
                  {{ row.status }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="progress" :label="t('pve.template.progress')" width="120">
              <template #default="{ row }">
                <el-progress v-if="row.status === 'syncing'" :percentage="row.progress" :stroke-width="10" />
                <span v-else>-</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('pve.common.operate')" width="120">
              <template #default="{ row }">
                <el-button
                  v-if="row.status === 'failed'"
                  type="primary"
                  link
                  size="small"
                  @click="handleRetrySyncTask(row.task_id)"
                >
                  {{ t('pve.template.retry') }}
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </div>
    </el-drawer>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="uploadVisible"
      :title="t('pve.template.uploadTemplate')"
      width="600px"
      :close-on-click-modal="false"
    >
      <el-form :model="uploadForm" label-width="140px">
        <el-form-item :label="t('pve.template.templateName')" required>
          <el-input v-model="uploadForm.template_name" :placeholder="t('pve.template.pleaseInputTemplateName')" />
        </el-form-item>
        <el-form-item :label="t('pve.cluster.clusterName')" required>
          <el-select
            v-model="uploadForm.cluster_id"
            class="w-full"
            filterable
            :placeholder="t('pve.template.pleaseSelectCluster')"
          >
            <el-option
              v-for="item in clusters"
              :key="item.id"
              :label="item.cluster_name_alias || item.cluster_name"
              :value="item.id"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.template.backupStorage')" required>
          <el-select
            v-model="uploadForm.backup_storage_id"
            class="w-full"
            filterable
            :disabled="!uploadForm.cluster_id || loadingClusterStorages"
            :loading="loadingClusterStorages"
            :placeholder="uploadForm.cluster_id ? t('pve.template.pleaseSelectBackupStorage') : t('pve.template.pleaseSelectClusterFirst')"
          >
            <el-option
              v-for="item in clusterStorages"
              :key="`${item.storage.id}-${item.node.id}`"
              :label="`${item.storage.storage_name} ${item.node.node_name} ${item.usagePercent}%`"
              :value="item.storage.id"
            >
              <span>{{ item.storage.storage_name }} {{ item.node.node_name }} {{ item.usagePercent }}%</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.template.targetStorage')" required>
          <el-select
            v-model="uploadForm.target_storage_id"
            class="w-full"
            filterable
            :disabled="!uploadForm.cluster_id || loadingClusterStorages"
            :loading="loadingClusterStorages"
            :placeholder="uploadForm.cluster_id ? t('pve.template.pleaseSelectTargetStorage') : t('pve.template.pleaseSelectClusterFirst')"
          >
            <el-option
              v-for="item in clusterStorages"
              :key="`${item.storage.id}-${item.node.id}`"
              :label="`${item.storage.storage_name} ${item.node.node_name} ${item.usagePercent}%`"
              :value="item.storage.id"
            >
              <span>{{ item.storage.storage_name }} {{ item.node.node_name }} {{ item.usagePercent }}%</span>
            </el-option>
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.common.description')">
          <el-input
            v-model="uploadForm.description"
            type="textarea"
            :rows="3"
            :placeholder="t('pve.common.description')"
          />
        </el-form-item>
        <el-form-item :label="t('pve.template.syncNodes')">
          <el-select
            v-model="uploadForm.sync_node_names"
            class="w-full"
            multiple
            filterable
            :disabled="!uploadForm.cluster_id"
            :placeholder="t('pve.template.pleaseSelectSyncNodes')"
          >
            <el-option
              v-for="node in availableSyncNodes"
              :key="node.id"
              :label="node.node_name"
              :value="node.node_name"
            />
          </el-select>
          <div class="text-xs text-gray-500 mt-1">
            <span v-if="selectedStorageNodeName">
              {{ t('pve.template.syncNodesHintWithExcluded') }}: {{ selectedStorageNodeName }}
            </span>
            <span v-else>
              {{ t('pve.template.syncNodesHint') }}
            </span>
          </div>
        </el-form-item>
        <el-form-item :label="t('pve.template.backupFile')" required>
          <el-select
            v-model="uploadForm.backup_file"
            class="w-full"
            filterable
            :disabled="!uploadForm.backup_storage_id || loadingBackupFiles"
            :loading="loadingBackupFiles"
            :placeholder="uploadForm.backup_storage_id ? t('pve.template.pleaseSelectBackupFile') : t('pve.template.pleaseSelectBackupStorageFirst')"
          >
            <el-option
              v-for="file in backupFiles"
              :key="file.volid"
              :label="file.volid"
              :value="file.volid"
            >
              <div class="flex items-center justify-between">
                <span>{{ file.volid }}</span>
                <span v-if="file.size" class="text-xs text-gray-500 ml-2">
                  {{ formatFileSize(file.size) }}
                </span>
              </div>
            </el-option>
          </el-select>
          <div v-if="!backupFiles.length && uploadForm.backup_storage_id && !loadingBackupFiles" class="text-xs text-gray-500 mt-1">
            {{ t('pve.template.noBackupFiles') }}
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="uploadVisible = false">{{ t('pve.common.cancel') }}</el-button>
        <el-button type="primary" :loading="uploadLoading" @click="handleUpload">
          {{ t('pve.template.upload') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- 同步对话框 -->
    <el-dialog
      v-model="syncVisible"
      :title="t('pve.template.syncTemplate')"
      width="500px"
    >
      <el-form :model="syncForm" label-width="140px">
        <el-form-item :label="t('pve.template.enableSync')">
          <el-switch v-model="syncForm.enable_sync" />
        </el-form-item>
        <el-form-item 
          v-if="syncForm.enable_sync"
          :label="t('pve.template.targetNodes')" 
          required
        >
          <el-select
            v-model="syncForm.target_node_names"
            class="w-full"
            multiple
            filterable
            :placeholder="t('pve.template.pleaseSelectTargetNodes')"
          >
            <el-option
              v-for="node in availableNodes"
              :key="node.id"
              :label="node.name"
              :value="node.name"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="syncVisible = false">{{ t('pve.common.cancel') }}</el-button>
        <el-button type="primary" :loading="syncLoading" @click="handleSync">
          {{ t('pve.template.sync') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.pve-page {
  padding: 12px;
}
</style>

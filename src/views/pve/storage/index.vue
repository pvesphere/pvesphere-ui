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
import { ref, computed, onMounted, nextTick, onUnmounted, watch } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import * as echarts from "echarts";
import dayjs from "dayjs";
import { useI18n } from "vue-i18n";
import {
  fetchStorages,
  fetchStorageDetail,
  fetchClusters,
  fetchNodes,
  fetchNodeStorageStatus,
  fetchNodeStorageRrd,
  fetchNodeStorageContent,
  fetchNodeStorageVolumeDetail,
  uploadStorageFile,
  deleteStorageContent,
  type Storage,
  type Cluster,
  type Node,
  type StorageStatus,
  type StorageRrdResponse,
  type StorageContentItem,
  type StorageVolumeDetail
} from "@/api/pve";

const { t } = useI18n();

const loading = ref(false);
const allStorages = ref<Storage[]>([]);
const clusters = ref<Cluster[]>([]);
const nodes = ref<Node[]>([]);

const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 筛选条件
const selectedClusterId = ref<number | null>(null);
const selectedNodeName = ref<string | null>(null);
const storageKeyword = ref("");
const typeKeyword = ref("");

const detailVisible = ref(false);
const detailActiveTab = ref<"overview" | "content">("overview");
const detailLoading = ref(false);
const detailData = ref<Storage | null>(null);

// 概览 & 状态
const storageStatus = ref<StorageStatus | null>(null);
const statusLoading = ref(false);

// 监控相关
const rrdLoading = ref(false);
const storageRrdData = ref<StorageRrdResponse["data"] | null>(null);
const storageUsageChartRef = ref<HTMLDivElement | null>(null);
let storageUsageChartInstance: echarts.ECharts | null = null;

// 内容列表
const contentLoading = ref(false);
const activeContentType = ref<"images" | "iso" | "backup">("images");
const contentList = ref<StorageContentItem[]>([]);
const volumeDetailVisible = ref(false);
const volumeDetailLoading = ref(false);
const volumeDetailData = ref<StorageVolumeDetail | null>(null);

// 上传相关
const uploadVisible = ref(false);
const uploadLoading = ref(false);
const selectedFile = ref<File | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const hashAlgorithm = ref<string>("none");
const checksum = ref<string>("none");
const uploadProgress = ref<number>(0); // 上传进度百分比
const uploadProgressBytes = ref<number>(0); // 已上传字节数
const uploadStatusText = ref<string>(""); // 上传状态文案

// 删除相关
const selectedContentItems = ref<StorageContentItem[]>([]); // 选中的内容项

const filteredNodeOptions = computed(() => {
  if (selectedClusterId.value == null) return nodes.value;
  return nodes.value.filter(n => n.cluster_id === selectedClusterId.value);
});

const filteredStorages = computed(() => {
  return allStorages.value.filter(s => {
    if (
      selectedClusterId.value != null &&
      s.cluster_id !== selectedClusterId.value
    ) {
      return false;
    }

    if (selectedNodeName.value && s.node_name !== selectedNodeName.value) {
      return false;
    }

    if (
      storageKeyword.value &&
      !String(s.storage_name)
        .toLowerCase()
        .includes(storageKeyword.value.toLowerCase())
    ) {
      return false;
    }

    if (
      typeKeyword.value &&
      !String(s.type)
        .toLowerCase()
        .includes(typeKeyword.value.toLowerCase())
    ) {
      return false;
    }

    return true;
  });
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  const list = filteredStorages.value.slice(start, end);
  total.value = filteredStorages.value.length;
  return list;
});

const loadBaseData = async () => {
  try {
    const [clusterRes, nodeRes] = await Promise.all([
      fetchClusters(),
      fetchNodes()
    ]);
    clusters.value = clusterRes?.data?.list ?? [];
    nodes.value = nodeRes?.data?.list ?? [];
  } catch (error) {
    console.warn("加载集群或节点失败", error);
  }
};

const handleSearch = async () => {
  loading.value = true;
  try {
    // 后端限制最大 page_size 为 100，这里拉取最大允许的数据量
    // 在前端做筛选 + 分页（如果数据超过100条，筛选可能不完整）
    const res = await fetchStorages({
      page: 1,
      page_size: 100
    });
    allStorages.value = res?.data?.list ?? [];
    currentPage.value = 1;
  } catch (error) {
    ElMessage.error("获取存储列表失败");
  } finally {
    loading.value = false;
  }
};

const handleShowDetail = async (row: Storage) => {
  detailVisible.value = true;
  detailLoading.value = true;
  detailActiveTab.value = "overview";
  try {
    const res = await fetchStorageDetail(row.id);
    // 合并列表行与详情，优先使用后端详情字段，但保留 node_name / storage_name 等列表信息
    detailData.value = { ...row, ...(res || {}) };
    // 加载状态和监控
    if (detailData.value.node_name && detailData.value.storage_name) {
      loadStorageStatus(detailData.value as Storage);
      // 先加载 RRD 数据，再在抽屉完全展开后初始化图表
      loadStorageRrd(detailData.value as Storage);
    }
  } catch (error) {
    // @ts-ignore
    detailData.value = (error as any)?.data ?? row;
    ElMessage.warning("获取存储详情失败，已展示基础信息");
  } finally {
    detailLoading.value = false;
  }
};

const resolveNodeId = (row: Storage): number | string | null => {
  if (!row?.node_name) return null;
  const node = nodes.value.find(n => n.node_name === row.node_name);
  return node?.id ?? null;
};

const loadStorageStatus = async (row: Storage) => {
  const nodeId = resolveNodeId(row);
  if (!nodeId || !row.storage_name) return;
  statusLoading.value = true;
  try {
    const res = await fetchNodeStorageStatus({
      node_id: nodeId,
      storage: row.storage_name
    });
    storageStatus.value = res.data;
  } catch (error) {
    console.warn("获取存储状态失败", error);
  } finally {
    statusLoading.value = false;
  }
};

const loadStorageRrd = async (row: Storage) => {
  const nodeId = resolveNodeId(row);
  if (!nodeId || !row.storage_name) return;
  rrdLoading.value = true;
  try {
    const res = await fetchNodeStorageRrd({
      node_id: nodeId,
      storage: row.storage_name,
      timeframe: "day",
      cf: "AVERAGE"
    });
    storageRrdData.value = res.data;
    await nextTick();
    updateUsageChart();
  } catch (error) {
    console.warn("获取存储监控数据失败", error);
  } finally {
    rrdLoading.value = false;
  }
};

const initUsageChart = () => {
  if (!storageUsageChartRef.value) return;
  if (!storageUsageChartInstance) {
    storageUsageChartInstance = echarts.init(storageUsageChartRef.value);
  }
  storageUsageChartInstance.setOption({
    title: { text: "Usage", left: "center", textStyle: { fontSize: 14 } },
    tooltip: { trigger: "axis" },
    legend: { data: ["Total Size", "Used Size"], bottom: 0 },
    grid: { left: "3%", right: "4%", bottom: "15%", containLabel: true },
    xAxis: { type: "category", boundaryGap: false, data: [] },
    yAxis: { type: "value", name: "Bytes" },
    series: [
      { name: "Total Size", type: "line", smooth: true, data: [] },
      { name: "Used Size", type: "line", smooth: true, data: [] }
    ]
  });
};

const updateUsageChart = () => {
  if (!storageUsageChartInstance || !storageRrdData.value) return;

  const extractRecords = (rrd: any) => {
    if (!rrd) return [];
    if (Array.isArray(rrd?.data)) return rrd.data;
    if (Array.isArray(rrd)) return rrd;
    return [];
  };

  const records = extractRecords(storageRrdData.value);
  if (!records.length) return;

  const xData = records.map((r: any) =>
    r.time ? dayjs(r.time * 1000).format("MM-DD HH:mm") : ""
  );
  const rawTotal = records.map((r: any) => r.total ?? 0);
  const rawUsed = records.map((r: any) => r.used ?? 0);

  // 根据最大值自动选择合适的单位（B/KB/MB/GB/TB），并缩放数据
  const allValues = [...rawTotal, ...rawUsed];
  const maxVal = Math.max(...allValues, 0);
  const k = 1024;
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  let unitIndex = 0;
  let scale = 1;
  if (maxVal > 0) {
    unitIndex = Math.min(
      Math.floor(Math.log(maxVal) / Math.log(k)),
      units.length - 1
    );
    scale = Math.pow(k, unitIndex);
  }

  const totalData = rawTotal.map(v => (v || 0) / scale);
  const usedData = rawUsed.map(v => (v || 0) / scale);

  storageUsageChartInstance.setOption({
    xAxis: { data: xData },
    yAxis: { name: units[unitIndex] },
    series: [
      { name: "Total Size", data: totalData },
      { name: "Used Size", data: usedData }
    ]
  });
};

const loadStorageContent = async () => {
  if (!detailData.value) return;
  const nodeId = resolveNodeId(detailData.value);
  if (!nodeId) return;
  contentLoading.value = true;
  // 切换内容类型时清空选择
  selectedContentItems.value = [];
  try {
    const res = await fetchNodeStorageContent({
      node_id: nodeId,
      storage: detailData.value.storage_name,
      content: activeContentType.value
    });
    contentList.value = res.data || [];
  } catch (error) {
    console.warn("获取存储内容失败", error);
    contentList.value = [];
  } finally {
    contentLoading.value = false;
  }
};

const handleShowVolumeDetail = async (row: StorageContentItem) => {
  if (!detailData.value || !row?.volid) return;
  const nodeId = resolveNodeId(detailData.value);
  if (!nodeId) return;
  volumeDetailVisible.value = true;
  volumeDetailLoading.value = true;
  try {
    const res = await fetchNodeStorageVolumeDetail({
      node_id: nodeId,
      storage: detailData.value.storage_name,
      volume: row.volid
    });
    volumeDetailData.value = res.data;
  } catch (error) {
    console.warn("获取卷属性失败", error);
  } finally {
    volumeDetailLoading.value = false;
  }
};

// 处理内容项选择变化
const handleContentSelectionChange = (selection: StorageContentItem[]) => {
  selectedContentItems.value = selection;
};

// 删除存储内容
const handleDeleteContent = async () => {
  if (selectedContentItems.value.length === 0) {
    ElMessage.warning("请选择要删除的内容");
    return;
  }
  
  if (!detailData.value) {
    ElMessage.warning("存储信息不存在");
    return;
  }
  
  const nodeId = resolveNodeId(detailData.value);
  if (!nodeId) {
    ElMessage.warning("无法获取节点ID");
    return;
  }
  
  const itemsToDelete = [...selectedContentItems.value];
  let successCount = 0;
  
  // 逐个确认删除
  for (const item of itemsToDelete) {
    try {
      await ElMessageBox.confirm(
        `Are you sure you want to remove entry '${item.volid}'`,
        "Confirm",
        {
          type: "warning",
          confirmButtonText: "Yes",
          cancelButtonText: "No",
          distinguishCancelAndClose: true
        }
      );
    } catch {
      // 用户取消，跳过此项，继续下一个
      continue;
    }
    
    try {
      // 后端要求：volume 需要带前导 “/”，例如：/local-dir:iso/xxx.iso
      const volumeParam = item.volid?.startsWith("/") ? item.volid : `/${item.volid}`;
      // 执行删除（延迟5秒）
      await deleteStorageContent({
        node_id: nodeId,
        storage: detailData.value!.storage_name,
        volume: volumeParam,
        delay: 5
      });
      successCount++;
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || "删除失败";
      ElMessage.error(`删除 ${item.volid} 失败: ${msg}`);
      console.error(error);
    }
  }
  
  // 刷新内容列表
  await loadStorageContent();
  // 清空选择
  selectedContentItems.value = [];
  
  // 显示成功消息
  if (successCount > 0) {
    ElMessage.success(`已提交删除 ${successCount} 项内容`);
  }
};

const percent = (used?: number, total?: number) => {
  if (!used || !total || total === 0) return "-";
  return ((used / total) * 100).toFixed(1) + "%";
};

// 字节转为人类可读存储单位
const formatBytes = (bytes?: number) => {
  if (bytes === undefined || bytes === null) return "-";
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(2)} ${sizes[i]}`;
};

// 计算文件哈希值（客户端计算，用于显示）
const calculateFileHash = async (file: File, algorithm: string): Promise<string> => {
  if (algorithm === "none") return "none";
  
  try {
    const buffer = await file.arrayBuffer();
    let hashBuffer: ArrayBuffer;
    
    // 浏览器 crypto.subtle 只支持 SHA-256 和 SHA-512
    if (algorithm === "sha256") {
      hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    } else if (algorithm === "sha512") {
      hashBuffer = await crypto.subtle.digest("SHA-512", buffer);
    } else if (algorithm === "md5") {
      // MD5 浏览器不支持，返回提示
      return "MD5 需要后端计算";
    } else {
      return "不支持的算法";
    }
    
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
    return hashHex;
  } catch (error) {
    console.warn("计算哈希失败:", error);
    return "计算失败";
  }
};

// 处理文件选择
const handleFileSelect = async (event: Event) => {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;
  
  selectedFile.value = file;
  
  // 如果选择了哈希算法，计算哈希值
  if (hashAlgorithm.value !== "none") {
    checksum.value = "计算中...";
    const hash = await calculateFileHash(file, hashAlgorithm.value);
    checksum.value = hash;
  } else {
    checksum.value = "none";
  }
};

// 打开文件选择器
const handleSelectFile = () => {
  fileInputRef.value?.click();
};

// 打开上传对话框
const handleOpenUpload = () => {
  if (!detailData.value) {
    ElMessage.warning("请先选择存储");
    return;
  }
  uploadVisible.value = true;
  selectedFile.value = null;
  hashAlgorithm.value = "none";
  checksum.value = "none";
  uploadProgress.value = 0;
  uploadProgressBytes.value = 0;
  uploadStatusText.value = "";
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

// 关闭上传对话框
const handleCloseUpload = () => {
  uploadVisible.value = false;
  selectedFile.value = null;
  hashAlgorithm.value = "none";
  checksum.value = "none";
  uploadProgress.value = 0;
  uploadProgressBytes.value = 0;
  uploadStatusText.value = "";
  if (fileInputRef.value) {
    fileInputRef.value.value = "";
  }
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// 监听哈希算法变化，重新计算
watch(hashAlgorithm, async (newVal) => {
  if (selectedFile.value && newVal !== "none") {
    checksum.value = "计算中...";
    const hash = await calculateFileHash(selectedFile.value, newVal);
    checksum.value = hash;
  } else {
    checksum.value = "none";
  }
});

// 提交上传
const handleSubmitUpload = async () => {
  if (!selectedFile.value || !detailData.value) {
    ElMessage.warning("请选择要上传的文件");
    return;
  }
  
  const nodeId = resolveNodeId(detailData.value);
  if (!nodeId) {
    ElMessage.warning("无法获取节点ID");
    return;
  }
  
  const contentTypeAtSubmit = activeContentType.value;
  const uploadedFileName = selectedFile.value.name;

  uploadLoading.value = true;
  uploadProgress.value = 0;
  uploadProgressBytes.value = 0;
  uploadStatusText.value = "正在上传...";
  
  try {
    await uploadStorageFile({
      node_id: nodeId,
      storage: detailData.value.storage_name,
      content: contentTypeAtSubmit,
      file: selectedFile.value,
      hash_algorithm: hashAlgorithm.value !== "none" ? hashAlgorithm.value : undefined,
      onUploadProgress: (progressEvent) => {
        if (progressEvent.total) {
          const percent = (progressEvent.loaded / progressEvent.total) * 100;
          uploadProgress.value = Math.min(percent, 99); // 最多显示到 99%
          uploadProgressBytes.value = progressEvent.loaded;
          
          // 根据进度更新状态文案
          if (percent >= 99) {
            uploadStatusText.value = "上传完成，等待后端处理...";
          } else {
            uploadStatusText.value = "正在上传...";
          }
        }
      }
    });
    
    // 上传成功
    uploadProgress.value = 100;
    uploadProgressBytes.value = selectedFile.value.size;
    uploadStatusText.value = "上传成功";
    
    ElMessage.success("文件上传成功");
    handleCloseUpload();
    // 关闭弹窗后，延迟刷新内容列表，避免后端落盘延迟导致第一次看不到新条目
    activeContentType.value = contentTypeAtSubmit;
    await nextTick();
    for (let i = 0; i < 5; i++) {
      await sleep(i === 0 ? 500 : 1000);
      await loadStorageContent();
      if (
        contentTypeAtSubmit === "iso" &&
        uploadedFileName &&
        contentList.value?.some(item => (item.volid || "").includes(uploadedFileName))
      ) {
        break;
      }
    }
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || "文件上传失败";
    ElMessage.error(msg);
    console.error(error);
    uploadStatusText.value = "上传失败";
  } finally {
    uploadLoading.value = false;
  }
};

onMounted(async () => {
  await loadBaseData();
  await handleSearch();
});

// 抽屉打开/关闭时处理图表生命周期，避免容器尺寸为 0 导致空白
watch(detailVisible, newVal => {
  if (newVal && detailActiveTab.value === "overview") {
    // 等待抽屉动画结束后再初始化图表
    nextTick(() => {
      setTimeout(() => {
        initUsageChart();
        updateUsageChart();
      }, 300);
    });
  } else if (!newVal && storageUsageChartInstance) {
    storageUsageChartInstance.dispose();
    storageUsageChartInstance = null;
  }
});

// 抽屉内 Tab 切换到概览时，确保图表正确初始化并刷新
watch(detailActiveTab, newVal => {
  if (newVal === "overview" && detailVisible.value && detailData.value) {
    nextTick(() => {
      setTimeout(() => {
        initUsageChart();
        updateUsageChart();
      }, 300);
    });
  }
});

onUnmounted(() => {
  if (storageUsageChartInstance) {
    storageUsageChartInstance.dispose();
    storageUsageChartInstance = null;
  }
});
</script>

<template>
  <div class="pve-page">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-medium">{{ t('pve.storage.title') }}</span>
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

        <el-select
          v-model="selectedNodeName"
          class="w-52"
          clearable
          filterable
          :placeholder="t('pve.common.pleaseSelect') + t('pve.node.nodeName')"
        >
          <el-option
            v-for="item in filteredNodeOptions"
            :key="item.id"
            :label="item.node_name"
            :value="item.node_name"
          />
        </el-select>

        <el-input
          v-model="storageKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.storage.storageName')"
        />

        <el-input
          v-model="typeKeyword"
          class="w-52"
          clearable
          :placeholder="t('pve.storage.storageType')"
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
        @row-click="(row: Storage) => handleShowDetail(row)"
      >
        <el-table-column prop="id" label="ID" min-width="80" />
        <el-table-column
          prop="storage_name"
          :label="t('pve.storage.storageName')"
          min-width="160"
        />
        <el-table-column prop="node_name" :label="t('pve.node.nodeName')" min-width="140" />
        <el-table-column prop="type" :label="t('pve.storage.storageType')" width="120" />
        <el-table-column prop="total" :label="t('pve.storage.capacity')" width="140">
          <template #default="{ row }">
            {{ formatBytes(row.total) }}
          </template>
        </el-table-column>
        <el-table-column prop="used" :label="t('pve.node.used')" width="140">
          <template #default="{ row }">
            {{ formatBytes(row.used) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('pve.storage.usageRate')" width="120">
          <template #default="{ row }">
            {{ percent(row.used, row.total) }}
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
      :title="t('pve.storage.title')"
      size="70%"
      :destroy-on-close="true"
    >
      <el-skeleton v-if="detailLoading" animated :rows="10" />
      <div v-else-if="detailData" class="storage-drawer">
        <el-tabs v-model="detailActiveTab">
          <!-- 概览 -->
          <el-tab-pane :label="t('pve.node.overview')" name="overview">
            <div class="storage-overview-wrapper">
              <el-card shadow="never" class="overview-card">
                <template #header>
                  <span class="card-title">{{ t('pve.storage.title') }}</span>
                </template>
                <div class="info-grid">
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.storage.storageName') }}：</span>
                    <span class="info-value">{{ detailData.storage_name || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.node.nodeName') }}：</span>
                    <span class="info-value">{{ detailData.node_name || '-' }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.storage.storageType') }}：</span>
                    <span class="info-value">{{ storageStatus?.type ?? detailData.type }}</span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.storage.capacity') }}：</span>
                    <span class="info-value">
                      {{ formatBytes(storageStatus?.total ?? detailData.total) }}
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.node.used') }}：</span>
                    <span class="info-value">
                      {{ formatBytes(storageStatus?.used ?? detailData.used) }}
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">{{ t('pve.storage.available') }}：</span>
                    <span class="info-value">
                      {{ formatBytes(storageStatus?.avail ?? detailData.avail) }}
                    </span>
                  </div>
                  <div class="info-item full-width">
                    <span class="info-label">{{ t('pve.storage.usageRate') }}：</span>
                    <div class="info-value">
                      <el-progress
                        :percentage="Number(((((storageStatus?.used ?? detailData.used) || 0) / ((storageStatus?.total ?? detailData.total) || 1)) * 100).toFixed(2))"
                        style="flex: 1; max-width: 300px;"
                      />
                      <span style="margin-left: 8px;">
                        {{ ((((storageStatus?.used ?? detailData.used) || 0) / ((storageStatus?.total ?? detailData.total) || 1)) * 100).toFixed(2) }}%
                      </span>
                    </div>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Enabled：</span>
                    <span class="info-value">
                      {{ (storageStatus?.enabled ?? 1) ? 'Yes' : 'No' }}
                    </span>
                  </div>
                  <div class="info-item">
                    <span class="info-label">Active：</span>
                    <span class="info-value">
                      {{ (storageStatus?.active ?? 1) ? 'Yes' : 'No' }}
                    </span>
                  </div>
                  <div class="info-item full-width">
                    <span class="info-label">Content：</span>
                    <span class="info-value">
                      {{ storageStatus?.content || detailData.content || '-' }}
                    </span>
                  </div>
                  <div class="info-item full-width">
                    <span class="info-label">Shared：</span>
                    <span class="info-value">
                      {{ (storageStatus?.shared ?? detailData.shared) ? t('pve.node.schedulableEnabled') : t('pve.node.schedulableDisabled') }}
                    </span>
                  </div>
                </div>
              </el-card>

              <el-card shadow="never" class="overview-card">
                <template #header>
                  <span class="card-title">Usage</span>
                </template>
                <div v-loading="rrdLoading" class="charts-wrapper">
                  <div ref="storageUsageChartRef" class="chart-container"></div>
                  <div v-if="!storageRrdData && !rrdLoading" class="chart-empty">
                    <el-empty :description="t('pve.common.noData')" />
                  </div>
                </div>
              </el-card>
            </div>
          </el-tab-pane>

          <!-- 内容 -->
          <el-tab-pane :label="t('pve.storage.content')" name="content">
            <div class="storage-content-wrapper">
              <div class="content-layout">
                <!-- 左侧菜单 -->
                <el-menu
                  class="content-menu"
                  :default-active="activeContentType"
                  @select="(key: string) => { activeContentType = key as any; loadStorageContent(); }"
                >
                  <el-menu-item index="images">
                    <span>VM Disks</span>
                  </el-menu-item>
                  <el-menu-item index="iso">
                    <span>ISO Images</span>
                  </el-menu-item>
                  <el-menu-item index="backup">
                    <span>Backups</span>
                  </el-menu-item>
                </el-menu>

                <!-- 右侧表格区域 -->
                <div class="content-main">
                  <!-- VM Disks -->
                  <div v-if="activeContentType === 'images'">
                    <div class="content-toolbar">
                      <el-button
                        type="danger"
                        :disabled="selectedContentItems.length === 0"
                        @click="handleDeleteContent"
                      >
                        Remove
                      </el-button>
                    </div>
                    <el-table
                      v-loading="contentLoading"
                      :data="contentList"
                      border
                      stripe
                      style="width: 100%"
                      row-key="volid"
                      @selection-change="handleContentSelectionChange"
                    >
                      <el-table-column type="selection" width="55" />
                      <el-table-column prop="volid" label="Name" min-width="260" />
                      <el-table-column prop="vmid" label="VMID" width="100" />
                      <el-table-column
                        prop="ctime"
                        label="Date"
                        width="180"
                      >
                        <template #default="{ row }">
                          {{ row.ctime ? dayjs(row.ctime * 1000).format("YYYY-MM-DD HH:mm:ss") : "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="format" label="Format" width="120" />
                      <el-table-column prop="size" label="Size" width="140">
                        <template #default="{ row }">
                          {{ row.size ?? "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="used" label="Used" width="140">
                        <template #default="{ row }">
                          {{ row.used ?? "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column :label="t('pve.common.operate')" width="120" fixed="right">
                        <template #default="{ row }">
                          <el-button type="primary" link size="small" @click="handleShowVolumeDetail(row)">
                            详情
                          </el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>

                  <!-- ISO Images -->
                  <div v-else-if="activeContentType === 'iso'">
                    <div class="content-toolbar">
                      <el-button type="primary" @click="handleOpenUpload">
                        Upload
                      </el-button>
                      <el-button
                        type="danger"
                        :disabled="selectedContentItems.length === 0"
                        @click="handleDeleteContent"
                      >
                        Remove
                      </el-button>
                    </div>
                    <el-table
                      v-loading="contentLoading"
                      :data="contentList"
                      border
                      stripe
                      style="width: 100%"
                      row-key="volid"
                      @selection-change="handleContentSelectionChange"
                    >
                      <el-table-column type="selection" width="55" />
                      <el-table-column prop="volid" label="Name" min-width="260" />
                      <el-table-column
                        prop="ctime"
                        label="Date"
                        width="180"
                      >
                        <template #default="{ row }">
                          {{ row.ctime ? dayjs(row.ctime * 1000).format("YYYY-MM-DD HH:mm:ss") : "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="format" label="Format" width="120" />
                      <el-table-column prop="size" label="Size" width="140">
                        <template #default="{ row }">
                          {{ row.size ?? "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column :label="t('pve.common.operate')" width="120" fixed="right">
                        <template #default="{ row }">
                          <el-button type="primary" link size="small" @click="handleShowVolumeDetail(row)">
                            详情
                          </el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>

                  <!-- Backups -->
                  <div v-else>
                    <el-table
                      v-loading="contentLoading"
                      :data="contentList"
                      border
                      stripe
                      style="width: 100%"
                    >
                      <el-table-column prop="volid" label="Name" min-width="260" />
                      <el-table-column
                        prop="ctime"
                        label="Date"
                        width="180"
                      >
                        <template #default="{ row }">
                          {{ row.ctime ? dayjs(row.ctime * 1000).format("YYYY-MM-DD HH:mm:ss") : "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column prop="format" label="Format" width="120" />
                      <el-table-column prop="size" label="Size" width="140">
                        <template #default="{ row }">
                          {{ row.size ?? "-" }}
                        </template>
                      </el-table-column>
                      <el-table-column :label="t('pve.common.operate')" width="120" fixed="right">
                        <template #default="{ row }">
                          <el-button type="primary" link size="small" @click="handleShowVolumeDetail(row)">
                            详情
                          </el-button>
                        </template>
                      </el-table-column>
                    </el-table>
                  </div>

                  <div v-if="!contentLoading && contentList.length === 0" class="content-empty">
                    <el-empty :description="t('pve.common.noData')" />
                  </div>
                </div>
              </div>
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 上传对话框 -->
    <el-dialog
      v-model="uploadVisible"
      title="Upload"
      width="600px"
      :destroy-on-close="true"
      @close="handleCloseUpload"
    >
      <el-form label-width="140px" label-position="right">
        <el-form-item label="File:">
          <div class="flex items-center gap-2">
            <el-input
              :model-value="selectedFile ? selectedFile.name : ''"
              placeholder="请选择文件"
              readonly
              style="flex: 1"
            />
            <el-button type="primary" @click="handleSelectFile">
              Select File
            </el-button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".iso"
              style="display: none"
              @change="handleFileSelect"
            />
          </div>
        </el-form-item>
        
        <el-form-item label="File name:">
          <el-input
            :model-value="selectedFile?.name || '-'"
            readonly
          />
        </el-form-item>
        
        <el-form-item label="File size:">
          <el-input
            :model-value="selectedFile ? formatBytes(selectedFile.size) : '-'"
            readonly
          />
        </el-form-item>
        
        <el-form-item label="MIME type:">
          <el-input
            :model-value="selectedFile?.type || '-'"
            readonly
          />
        </el-form-item>
        
        <el-form-item label="Hash algorithm:">
          <el-select v-model="hashAlgorithm" style="width: 100%">
            <el-option label="None" value="none" />
            <el-option label="MD5" value="md5" />
            <el-option label="SHA256" value="sha256" />
            <el-option label="SHA512" value="sha512" />
          </el-select>
        </el-form-item>
        
        <el-form-item label="Checksum:">
          <el-input
            :model-value="checksum"
            readonly
          />
        </el-form-item>
        
        <!-- 上传进度 -->
        <el-form-item v-if="uploadLoading || uploadProgress > 0" label="Upload progress:">
          <div class="upload-progress-wrapper">
            <el-progress
              :percentage="Number(uploadProgress.toFixed(2))"
              :status="uploadProgress === 100 ? 'success' : undefined"
              style="margin-bottom: 8px;"
            />
            <div class="upload-progress-text">
              {{ uploadProgress.toFixed(2) }}% ({{ formatBytes(uploadProgressBytes) }})
              <span v-if="uploadStatusText" class="task-status-hint">
                - {{ uploadStatusText }}
              </span>
            </div>
          </div>
        </el-form-item>
      </el-form>
      
      <template #footer>
        <div class="dialog-footer">
          <el-button @click="handleCloseUpload">Abort</el-button>
          <el-button
            type="primary"
            :loading="uploadLoading"
            :disabled="!selectedFile"
            @click="handleSubmitUpload"
          >
            Upload
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 卷属性对话框 -->
    <el-dialog
      v-model="volumeDetailVisible"
      title="Volume Detail"
      width="520px"
      :destroy-on-close="true"
    >
      <el-skeleton v-if="volumeDetailLoading" animated :rows="6" />
      <div v-else-if="volumeDetailData" class="space-y-2 text-sm">
        <div><strong>Volid：</strong>{{ volumeDetailData.volid }}</div>
        <div><strong>Size：</strong>{{ volumeDetailData.size ?? "-" }}</div>
        <div><strong>Format：</strong>{{ volumeDetailData.format ?? "-" }}</div>
        <div><strong>VMID：</strong>{{ volumeDetailData.vmid ?? "-" }}</div>
        <div>
          <strong>Date：</strong>
          {{ volumeDetailData.ctime ? dayjs(volumeDetailData.ctime * 1000).format("YYYY-MM-DD HH:mm:ss") : "-" }}
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped>
.pve-page {
  padding: 12px;
}

.raw-json {
  margin-top: 8px;
  padding: 8px;
  background-color: var(--el-fill-color-light);
  border-radius: 4px;
  font-size: 12px;
  max-height: 400px;
  overflow: auto;
}

.storage-drawer {
  padding: 0;
}

.storage-overview-wrapper {
  padding: 12px 0;
}

.overview-card {
  margin-bottom: 16px;
}

.card-title {
  font-weight: 600;
  font-size: 14px;
}

.info-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.info-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-weight: 500;
  color: var(--el-text-color-regular);
  min-width: 120px;
  flex-shrink: 0;
}

.info-value {
  color: var(--el-text-color-primary);
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}

.charts-wrapper {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 12px 0;
}

.chart-container {
  width: 100%;
  height: 280px;
  min-height: 280px;
}

.chart-empty {
  text-align: center;
  padding: 24px 0;
}

.storage-content-wrapper {
  padding: 12px 0;
}

.content-layout {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 16px;
}

.content-menu {
  border-right: 1px solid var(--el-border-color);
}

.content-main {
  width: 100%;
}

.content-empty {
  margin-top: 16px;
}

.content-toolbar {
  margin-bottom: 12px;
  display: flex;
  justify-content: flex-start;
  align-items: center;
  gap: 12px;
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}

.upload-progress-wrapper {
  width: 100%;
}

.upload-progress-text {
  font-size: 14px;
  color: var(--el-text-color-regular);
  text-align: center;
}

.task-status-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-left: 8px;
}
</style>



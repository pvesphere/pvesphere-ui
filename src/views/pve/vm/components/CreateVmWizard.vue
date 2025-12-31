<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import {
  fetchNodes,
  fetchClusters,
  fetchTemplates,
  fetchStorages,
  fetchNodeStorageContent,
  fetchNodeNetworks,
  createVmFull,
  type Node,
  type Cluster,
  type Template,
  type Storage,
  type StorageContentItem,
  type CreateVmFullPayload,
  type NodeNetwork
} from "@/api/pve";

const { t } = useI18n();

interface Emits {
  (e: "close"): void;
  (e: "success"): void;
}

const emit = defineEmits<Emits>();

const loading = ref(false);
const submitting = ref(false);

// 基础数据
const nodes = ref<Node[]>([]);
const clusters = ref<Cluster[]>([]);
const templates = ref<Template[]>([]);
const storages = ref<Storage[]>([]);
const isoVolumes = ref<StorageContentItem[]>([]);
const nodeNetworks = ref<NodeNetwork[]>([]); // 节点网络接口列表

// 过滤后的节点（根据集群）
const filteredNodes = computed(() => {
  if (!formData.value.cluster_id) return nodes.value;
  return nodes.value.filter(n => n.cluster_id === formData.value.cluster_id);
});

// 过滤后的模板（根据集群）
const filteredTemplates = computed(() => {
  if (!formData.value.cluster_id) return templates.value;
  return templates.value.filter(t => t.cluster_id === formData.value.cluster_id);
});

const selectedNode = computed(() => {
  if (!formData.value.node_id) return undefined;
  return nodes.value.find(n => n.id === formData.value.node_id);
});

const selectedNodeName = computed(() => selectedNode.value?.node_name || "");

// 过滤后的存储（根据集群+节点）
const filteredStorages = computed(() => {
  if (!selectedNodeName.value) return [];
  return storages.value.filter(
    s => s.cluster_id === formData.value.cluster_id && s.node_name === selectedNodeName.value
  );
});

const diskStorages = computed(() => {
  // 磁盘存储需要支持 images
  return filteredStorages.value.filter(s => {
    const content = (s.content || "")
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);
    const enabled = Number(s.enabled ?? 1) === 1;
    const active = Number(s.active ?? 1) === 1;
    return enabled && active && content.includes("images");
  });
});

// ISO可选存储（根据节点 + 存储content包含iso）
const isoStorages = computed(() => {
  return filteredStorages.value.filter(s => {
    const content = (s.content || "")
      .split(",")
      .map(i => i.trim())
      .filter(Boolean);
    const enabled = Number(s.enabled ?? 1) === 1;
    const active = Number(s.active ?? 1) === 1;
    return enabled && active && content.includes("iso");
  });
});

const isTemplateMode = computed(() => formData.value.create_mode === "template");
const isIsoMode = computed(() => formData.value.create_mode === "iso");
const isEmptyMode = computed(() => formData.value.create_mode === "empty");

// 表单数据
const formData = ref({
  // General
  cluster_id: 0,
  node_id: undefined as number | undefined,
  vm_name: "",
  
  // Create mode
  create_mode: "template" as "template" | "iso" | "empty",

  // Template clone
  template_id: undefined as number | undefined,
  full_clone: 1,
  
  // Resource
  cpu_num: 2,
  memory_size: 4096,
  
  // Disk storage (all modes)
      storage: "",

  // ISO / Empty
  disk_size_gb: 32,
  iso_storage: "",
  iso_volume: "",
  
  // Network configuration
  no_network_device: false,
  bridge: "vmbr0",
  vlan_tag: undefined as number | undefined,
  firewall: true,
  disconnect: false,
  mtu: 1500,
  net_model: "virtio",
  mac_address: "auto",
  rate_limit: undefined as number | undefined, // MB/s, undefined = unlimited
  multiqueue: undefined as number | undefined,
  
  os_type: "l26",
  
  // Other
  description: "",
  start_after_created: false
});

// 加载基础数据
const loadBaseData = async () => {
  loading.value = true;
  try {
    const [nodesRes, clustersRes, templatesRes] = await Promise.all([
      fetchNodes(),
      fetchClusters(),
      fetchTemplates()
    ]);
    
    nodes.value = nodesRes?.data?.list || [];
    clusters.value = clustersRes?.data?.list || [];
    templates.value = templatesRes?.data?.list || [];
    
    // 存储数据在节点选择时按需加载，避免一次性加载过多数据
    storages.value = [];
    
    if (clusters.value.length > 0 && !formData.value.cluster_id) {
      formData.value.cluster_id = clusters.value[0].id;
    }
  } catch (error) {
    ElMessage.error(t('pve.common.loading') + t('pve.common.failed'));
    console.error(error);
  } finally {
    loading.value = false;
  }
};

// 加载指定节点的存储
const loadNodeStorages = async (nodeId: number | undefined) => {
  if (!nodeId) {
    storages.value = [];
    return;
  }
  
  const node = nodes.value.find(n => n.id === nodeId);
  if (!node) {
    storages.value = [];
    return;
  }
  
  try {
    // 按节点名称获取存储，确保获取该节点的所有存储
    const storageRes = await fetchStorages({ 
      node_name: node.node_name,
      page_size: 100 
    });
    const nodeStorages = storageRes?.data?.list ?? [];
    
    // 过滤出属于当前集群的存储
    const clusterStorages = nodeStorages.filter(s => 
      s.cluster_id === formData.value.cluster_id
    );
    
    storages.value = clusterStorages;
  } catch (error) {
    console.warn(`获取节点 ${node.node_name} 的存储失败:`, error);
    storages.value = [];
  }
};

// 加载指定存储下的 ISO 列表（根据节点 + 存储）
const loadIsoVolumes = async () => {
  isoVolumes.value = [];
  if (!isIsoMode.value) return;
  if (!formData.value.node_id || !formData.value.iso_storage) return;

  try {
    const res = await fetchNodeStorageContent({
      node_id: formData.value.node_id,
      storage: formData.value.iso_storage,
      content: "iso"
    });
    isoVolumes.value = res?.data || [];
  } catch (error) {
    console.error("加载 ISO 列表失败:", error);
    isoVolumes.value = [];
  }
};

// 加载节点网络接口列表
const loadNodeNetworks = async (nodeId: number | undefined) => {
  nodeNetworks.value = [];
  if (!nodeId) return;

  try {
    const res = await fetchNodeNetworks(nodeId);
    // 只获取 bridge 类型的网络接口
    nodeNetworks.value = (res?.data || []).filter((n: NodeNetwork) => n.type === 'bridge' && n.iface);
    
    // 如果当前选择的 bridge 不在列表中，重置为第一个可用的 bridge
    if (nodeNetworks.value.length > 0) {
      const availableBridges = nodeNetworks.value.map((n: NodeNetwork) => n.iface).filter(Boolean) as string[];
      if (!availableBridges.includes(formData.value.bridge)) {
        formData.value.bridge = availableBridges[0] || "vmbr0";
      }
    }
  } catch (error) {
    console.warn(`获取节点 ${nodeId} 的网络接口失败:`, error);
    nodeNetworks.value = [];
  }
};

// 获取可用的 Bridge 选项
const availableBridges = computed(() => {
  return nodeNetworks.value
    .filter((n: NodeNetwork) => n.type === 'bridge' && n.iface)
    .map((n: NodeNetwork) => ({
      label: n.iface || '',
      value: n.iface || ''
    }));
});

watch(() => formData.value.cluster_id, () => {
  formData.value.node_id = undefined;
  formData.value.storage = "";
  formData.value.iso_storage = "";
  formData.value.iso_volume = "";
  isoVolumes.value = [];
});

watch(() => formData.value.node_id, async (newNodeId) => {
  formData.value.storage = "";
  formData.value.iso_storage = "";
  formData.value.iso_volume = "";
  isoVolumes.value = [];
  
  // 当选择节点时，加载该节点的存储和网络接口
  await Promise.all([
    loadNodeStorages(newNodeId),
    loadNodeNetworks(newNodeId)
  ]);
});

watch(() => formData.value.create_mode, () => {
  // 切换模式时清理与模式相关字段
  formData.value.template_id = undefined;
  formData.value.storage = "";
  formData.value.iso_storage = "";
  formData.value.iso_volume = "";
  isoVolumes.value = [];
});

watch(() => formData.value.iso_storage, () => {
  formData.value.iso_volume = "";
  loadIsoVolumes();
});

// 验证表单
const validateForm = (): boolean => {
  if (!formData.value.vm_name) {
    ElMessage.warning(t('pve.vm.create.pleaseInputVmName'));
    return false;
  }
  if (!formData.value.cluster_id) {
    ElMessage.warning(t('pve.vm.create.pleaseSelectCluster'));
    return false;
  }
  if (!formData.value.node_id) {
    ElMessage.warning(t('pve.vm.create.pleaseSelectNode'));
    return false;
  }
  if (!formData.value.cpu_num || formData.value.cpu_num < 1) {
    ElMessage.warning(t('pve.vm.create.pleaseSetCpuNum'));
    return false;
  }
  if (!formData.value.memory_size || formData.value.memory_size < 256) {
    ElMessage.warning(t('pve.vm.create.pleaseSetMemorySize'));
    return false;
  }

  if (isTemplateMode.value) {
    if (!formData.value.template_id) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectTemplate'));
      return false;
    }
    if (!formData.value.storage) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectStorage'));
      return false;
    }
  }

  if (isIsoMode.value) {
    if (!formData.value.storage) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectDiskStorage'));
      return false;
    }
    if (!formData.value.disk_size_gb || formData.value.disk_size_gb < 1) {
      ElMessage.warning(t('pve.vm.create.pleaseSetDiskSize'));
      return false;
    }
    if (!formData.value.iso_storage) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectIsoStorage'));
      return false;
    }
    if (!formData.value.iso_volume) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectIso'));
      return false;
    }
    if (!formData.value.no_network_device && (!formData.value.bridge || !formData.value.net_model)) {
      ElMessage.warning(t('pve.vm.create.pleaseConfigNetwork'));
      return false;
    }
    if (!formData.value.os_type) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectOsType'));
      return false;
    }
  }

  if (isEmptyMode.value) {
    if (!formData.value.storage) {
      ElMessage.warning(t('pve.vm.create.pleaseSelectDiskStorage'));
      return false;
    }
    if (!formData.value.disk_size_gb || formData.value.disk_size_gb < 1) {
      ElMessage.warning(t('pve.vm.create.pleaseSetDiskSize'));
      return false;
    }
  }
  
  return true;
};

// 提交创建
const handleSubmit = async () => {
  if (!validateForm()) {
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      t('pve.vm.create.confirmCreateVm'),
      t('pve.common.confirm'),
      {
        type: "warning"
      }
    );
  } catch {
    return;
  }
  
  submitting.value = true;
  try {
    let payload: any;

    if (isTemplateMode.value) {
      // 模板克隆：默认模式（不传 create_mode）
      payload = {
        vm_name: formData.value.vm_name,
        cluster_id: formData.value.cluster_id,
        node_id: formData.value.node_id,
        template_id: formData.value.template_id,
        cpu_num: formData.value.cpu_num,
        memory_size: formData.value.memory_size,
        storage: formData.value.storage,
        full_clone: formData.value.full_clone ? 1 : 0,
        description: formData.value.description
      };
      
      // 添加网络配置（如果不选择"无网络设备"）
      if (!formData.value.no_network_device) {
        payload.bridge = formData.value.bridge;
        payload.net_model = formData.value.net_model;
        if (formData.value.vlan_tag) payload.vlan_tag = formData.value.vlan_tag;
        if (formData.value.mac_address && formData.value.mac_address !== 'auto') {
          payload.mac_address = formData.value.mac_address;
        }
        payload.firewall = formData.value.firewall ? 1 : 0;
        if (formData.value.disconnect) payload.disconnect = 1;
        if (formData.value.mtu && formData.value.mtu !== 1500) payload.mtu = formData.value.mtu;
        if (formData.value.rate_limit) payload.rate_limit = formData.value.rate_limit;
        if (formData.value.multiqueue) payload.multiqueue = formData.value.multiqueue;
      }
    } else if (isIsoMode.value) {
      payload = {
        create_mode: "iso",
        vm_name: formData.value.vm_name,
        cluster_id: formData.value.cluster_id,
        node_id: formData.value.node_id,
        storage: formData.value.storage,
        disk_size_gb: formData.value.disk_size_gb,
        iso_volume: formData.value.iso_volume,
        cpu_num: formData.value.cpu_num,
        memory_size: formData.value.memory_size,
        os_type: formData.value.os_type,
        description: formData.value.description
      };
      
      // 添加网络配置（如果不选择"无网络设备"）
      if (!formData.value.no_network_device) {
        payload.bridge = formData.value.bridge;
        payload.net_model = formData.value.net_model;
        if (formData.value.vlan_tag) payload.vlan_tag = formData.value.vlan_tag;
        if (formData.value.mac_address && formData.value.mac_address !== 'auto') {
          payload.mac_address = formData.value.mac_address;
        }
        payload.firewall = formData.value.firewall ? 1 : 0;
        if (formData.value.disconnect) payload.disconnect = 1;
        if (formData.value.mtu && formData.value.mtu !== 1500) payload.mtu = formData.value.mtu;
        if (formData.value.rate_limit) payload.rate_limit = formData.value.rate_limit;
        if (formData.value.multiqueue) payload.multiqueue = formData.value.multiqueue;
      }
    } else {
      payload = {
        create_mode: "empty",
        vm_name: formData.value.vm_name,
        cluster_id: formData.value.cluster_id,
        node_id: formData.value.node_id,
        storage: formData.value.storage,
        disk_size_gb: formData.value.disk_size_gb,
        cpu_num: formData.value.cpu_num,
        memory_size: formData.value.memory_size,
        description: formData.value.description
      };
      
      // 添加网络配置（如果不选择"无网络设备"）
      if (!formData.value.no_network_device) {
        payload.bridge = formData.value.bridge;
        payload.net_model = formData.value.net_model;
        if (formData.value.vlan_tag) payload.vlan_tag = formData.value.vlan_tag;
        if (formData.value.mac_address && formData.value.mac_address !== 'auto') {
          payload.mac_address = formData.value.mac_address;
        }
        payload.firewall = formData.value.firewall ? 1 : 0;
        if (formData.value.disconnect) payload.disconnect = 1;
        if (formData.value.mtu && formData.value.mtu !== 1500) payload.mtu = formData.value.mtu;
        if (formData.value.rate_limit) payload.rate_limit = formData.value.rate_limit;
        if (formData.value.multiqueue) payload.multiqueue = formData.value.multiqueue;
      }
    }
    
    await createVmFull(payload);
    ElMessage.success(t('pve.vm.create.createSuccess'));
    emit("success");
    emit("close");
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.create.createFailed');
    ElMessage.error(msg);
    console.error(error);
  } finally {
    submitting.value = false;
  }
};

onMounted(() => {
  loadBaseData();
});
</script>

<template>
  <div class="create-vm-wizard" v-loading="loading">
    <el-scrollbar height="calc(70vh - 100px)">
      <el-form label-width="140px" label-position="right" class="vm-form">
        <!-- 基本信息区域 -->
        <el-card shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.basicInfoTitle') }}</span>
          </template>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.clusterLabel')" required>
                <el-select
                  v-model="formData.cluster_id"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectCluster')"
                  style="width: 100%"
                  @change="formData.node_id = undefined"
                >
            <el-option
              v-for="cluster in clusters"
              :key="cluster.id"
              :label="cluster.cluster_name_alias || cluster.cluster_name"
              :value="cluster.id"
            />
          </el-select>
              </el-form-item>
            </el-col>
        
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.nodeLabel')" required>
                <el-select
                  v-model="formData.node_id"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectNode')"
                  style="width: 100%"
                  :disabled="!formData.cluster_id"
                >
            <el-option
              v-for="node in filteredNodes"
              :key="node.id"
              :label="node.node_name"
                    :value="node.id"
            />
          </el-select>
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.vmNameLabel')" required>
                <el-input
                  v-model="formData.vm_name"
                  :placeholder="t('pve.vm.create.pleaseInputVmName')"
                />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.createModeLabel')" required>
                <el-radio-group v-model="formData.create_mode">
                  <el-radio label="template">{{ t('pve.vm.create.templateClone') }}</el-radio>
                  <el-radio label="iso">{{ t('pve.vm.create.isoInstall') }}</el-radio>
                  <el-radio label="empty">{{ t('pve.vm.create.emptyVm') }}</el-radio>
          </el-radio-group>
              </el-form-item>
            </el-col>
          </el-row>
        
          <el-row :gutter="20" v-if="isTemplateMode">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.templateLabel')" required>
                <el-select
                  v-model="formData.template_id"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectTemplate')"
                  style="width: 100%"
                  :disabled="!formData.cluster_id"
                >
              <el-option
                v-for="template in filteredTemplates"
                :key="template.id"
                :label="template.template_name"
                :value="template.id"
              />
            </el-select>
              </el-form-item>
            </el-col>
        
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.fullClone')" required>
                <el-switch
                  v-model="formData.full_clone"
                  :active-value="1"
                  :inactive-value="0"
                />
              </el-form-item>
            </el-col>
          </el-row>
          
          <el-row :gutter="20" v-if="isTemplateMode">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.storageLabel')" required>
                <el-select
                  v-model="formData.storage"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectStorage')"
                  style="width: 100%"
                  :disabled="!formData.node_id"
                >
              <el-option
                    v-for="storage in diskStorages"
                    :key="storage.id"
                    :label="storage.storage_name"
                    :value="storage.storage_name"
              />
            </el-select>
              </el-form-item>
            </el-col>
          </el-row>

          <el-row :gutter="20" v-if="isIsoMode || isEmptyMode">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.diskStorageLabel')" required>
                <el-select
                  v-model="formData.storage"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectDiskStorage')"
                  style="width: 100%"
                  :disabled="!formData.node_id"
                >
                  <el-option
                    v-for="storage in diskStorages"
                    :key="storage.id"
                    :label="storage.storage_name"
                    :value="storage.storage_name"
                  />
                </el-select>
              </el-form-item>
            </el-col>

            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.diskSizeLabel')" required>
                <el-input-number
                  v-model="formData.disk_size_gb"
                  :min="1"
                  :max="10000"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>

        <!-- ISO 安装：ISO存储 + ISO镜像 -->
        <el-card v-if="isIsoMode" shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.isoImage') }}</span>
          </template>

          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.isoStorageLabel')" required>
                <el-select
                  v-model="formData.iso_storage"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectIsoStorage')"
                  style="width: 100%"
                  :disabled="!formData.node_id"
                >
                    <el-option
                    v-for="storage in isoStorages"
                      :key="storage.id"
                      :label="storage.storage_name"
                      :value="storage.storage_name"
                    />
                  </el-select>
              </el-form-item>
            </el-col>
                
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.isoImageLabel')" required>
                <el-select
                  v-model="formData.iso_volume"
                  filterable
                  :placeholder="t('pve.vm.create.pleaseSelectIso')"
                  style="width: 100%"
                  :disabled="!formData.node_id || !formData.iso_storage"
                >
                  <el-option
                    v-for="iso in isoVolumes"
                    :key="iso.volid"
                    :label="iso.volid"
                    :value="iso.volid"
                  />
                  </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>

        <!-- CPU / Memory（所有模式） -->
        <el-card shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.cpuMemory') }}</span>
          </template>
          
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.cpuLabel')" required>
                <el-input-number v-model="formData.cpu_num" :min="1" :max="128" style="width: 100%" />
              </el-form-item>
            </el-col>
            
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.memoryLabel')" required>
                <el-input-number v-model="formData.memory_size" :min="256" :max="1048576" :step="256" style="width: 100%" />
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>

        <!-- Network Configuration (所有模式) -->
        <el-card shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.networkConfig') }}</span>
          </template>

          <el-row :gutter="20">
            <!-- 左列 -->
            <el-col :span="12">
              <el-form-item>
                <el-checkbox v-model="formData.no_network_device">
                  {{ t('pve.vm.create.noNetworkDevice') }}
                </el-checkbox>
              </el-form-item>
              
              <el-form-item :label="t('pve.vm.create.bridge')" :disabled="formData.no_network_device">
                <el-select 
                  v-model="formData.bridge" 
                  style="width: 100%"
                  :disabled="formData.no_network_device || !formData.node_id"
                  :placeholder="t('pve.vm.create.pleaseSelectBridge')"
                >
                  <el-option
                    v-for="bridge in availableBridges"
                    :key="bridge.value"
                    :label="bridge.label"
                    :value="bridge.value"
                  />
                </el-select>
              </el-form-item>
              
              <el-form-item :label="t('pve.vm.create.vlanTag')" :disabled="formData.no_network_device">
                <el-input
                  v-model="formData.vlan_tag"
                  type="number"
                  :min="1"
                  :max="4094"
                  :placeholder="t('pve.vm.create.noVlan')"
                  style="width: 100%"
                />
              </el-form-item>
              
              <el-form-item :disabled="formData.no_network_device">
                <el-checkbox v-model="formData.firewall">
                  {{ t('pve.vm.create.firewall') }}
                </el-checkbox>
              </el-form-item>
              
              <el-divider />
              
              <el-form-item :disabled="formData.no_network_device">
                <el-checkbox v-model="formData.disconnect">
                  {{ t('pve.vm.create.disconnect') }}
                </el-checkbox>
              </el-form-item>
              
              <el-form-item :label="t('pve.vm.create.mtu')" :disabled="formData.no_network_device">
                <el-input-number
                  v-model="formData.mtu"
                  :min="1"
                  :max="65535"
                  :placeholder="t('pve.vm.create.mtuPlaceholder')"
                  style="width: 100%"
                />
                <div class="form-item-hint">{{ t('pve.vm.create.mtuHint') }}</div>
              </el-form-item>
            </el-col>
            
            <!-- 右列 -->
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.netModel')" :disabled="formData.no_network_device">
                <el-select v-model="formData.net_model" style="width: 100%" :disabled="formData.no_network_device">
                  <el-option :label="t('pve.vm.create.netModelVirtio')" value="virtio" />
                  <el-option :label="t('pve.vm.create.netModelE1000')" value="e1000" />
                  <el-option :label="t('pve.vm.create.netModelRtl8139')" value="rtl8139" />
                  <el-option :label="t('pve.vm.create.netModelIntelE1000')" value="e1000-82540em" />
                  <el-option :label="t('pve.vm.create.netModelVmxnet3')" value="vmxnet3" />
                </el-select>
              </el-form-item>
              
              <el-form-item :label="t('pve.vm.create.macAddress')" :disabled="formData.no_network_device">
                <el-input
                  v-model="formData.mac_address"
                  :placeholder="t('pve.vm.create.macAddressPlaceholder')"
                  style="width: 100%"
                />
              </el-form-item>
              
              <el-divider />
              
              <el-form-item :label="t('pve.vm.create.rateLimit')" :disabled="formData.no_network_device">
                <el-input-number
                  v-model="formData.rate_limit"
                  :min="0"
                  :placeholder="t('pve.vm.create.unlimited')"
                  style="width: 100%"
                />
                <div class="form-item-hint">{{ t('pve.vm.create.rateLimitHint') }}</div>
              </el-form-item>
              
              <el-form-item :label="t('pve.vm.create.multiqueue')" :disabled="formData.no_network_device">
                <el-input-number
                  v-model="formData.multiqueue"
                  :min="0"
                  :max="64"
                  style="width: 100%"
                />
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>

        <el-card v-if="isIsoMode" shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.osTypeLabel') }}</span>
          </template>
          <el-row :gutter="20">
            <el-col :span="12">
              <el-form-item :label="t('pve.vm.create.osTypeLabel')" required>
                <el-select v-model="formData.os_type" style="width: 100%">
                  <el-option :label="t('pve.vm.create.osTypeLinux')" value="l26" />
                  <el-option :label="t('pve.vm.create.osTypeWindows')" value="w10" />
                  <el-option :label="t('pve.vm.create.osTypeOther')" value="other" />
                </el-select>
              </el-form-item>
            </el-col>
          </el-row>
        </el-card>

        <!-- 其他配置 -->
        <el-card shadow="never" class="form-section">
          <template #header>
            <span class="section-title">{{ t('pve.vm.create.otherConfig') }}</span>
              </template>
          
          <el-form-item :label="t('pve.vm.create.descriptionLabel')">
            <el-input
              v-model="formData.description"
              type="textarea"
              :rows="3"
              :placeholder="t('pve.common.pleaseInput')"
            />
          </el-form-item>
        
          <el-form-item>
          <el-checkbox v-model="formData.start_after_created">
              {{ t('pve.vm.create.startAfterCreated') }}
          </el-checkbox>
          </el-form-item>
        </el-card>
      </el-form>
    </el-scrollbar>

    <!-- 底部按钮 -->
    <div class="wizard-footer">
      <el-button @click="emit('close')">{{ t('pve.common.cancel') }}</el-button>
        <el-button
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
        >
        {{ t('pve.common.create') }}
        </el-button>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.create-vm-wizard {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.vm-form {
  padding: 20px;
}

.form-section {
  margin-bottom: 20px;
  
  :deep(.el-card__header) {
    padding: 16px 20px;
    background-color: var(--el-fill-color-lighter);
    border-bottom: 1px solid var(--el-border-color);
  }
  
  :deep(.el-card__body) {
    padding: 20px;
  }
}

.section-title {
  font-size: 16px;
  font-weight: 600;
    color: var(--el-text-color-primary);
  }

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.disk-item,
.network-item {
  padding: 16px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
  margin-bottom: 16px;
  background-color: var(--el-fill-color-lighter);
  
  &:last-child {
    margin-bottom: 0;
  }
}

.disk-header,
.network-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color);
}

.disk-title,
.network-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.wizard-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  padding: 16px 20px;
  border-top: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color);
}

.form-item-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 4px;
}
</style>

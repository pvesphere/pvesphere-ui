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
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useI18n } from "vue-i18n";
import ArrowDown from "~icons/ep/arrow-down";
import * as echarts from "echarts";
import dayjs from "dayjs";

const { t } = useI18n();
import {
  fetchNodes,
  fetchNodeDetail,
  fetchClusters,
  fetchNodeStatus,
  fetchNodeServices,
  fetchNodeRrd,
  updateNode,
  updateNodeStatus,
  fetchNodeDisks,
  fetchNodeDirectoryStorage,
  fetchNodeLvmStorage,
  fetchNodeLvmThinStorage,
  fetchNodeZfsStorage,
  initGptDisk,
  wipeDisk,
  startNodeService,
  stopNodeService,
  restartNodeService,
  fetchNodeNetworks,
  createNodeNetwork,
  reloadNodeNetwork,
  revertNodeNetwork,
  type Node,
  type Cluster,
  type NodeStatus,
  type NodeService,
  type NodeRrdData,
  type NodeNetwork,
  type Disk,
  type DirectoryStorage,
  type LvmStorage,
  type LvmThinStorage,
  type ZfsStorage
} from "@/api/pve";
import NodeConsoleDialog from "./components/NodeConsoleDialog.vue";

const loading = ref(false);
const allNodes = ref<Node[]>([]);
const clusters = ref<Cluster[]>([]);

const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 查询条件
const selectedClusterId = ref<number | null>(null);
const nodeNameKeyword = ref("");
const nodeIpKeyword = ref("");

const detailVisible = ref(false);
const detailLoading = ref(false);
const overviewLoading = ref(false);
const servicesLoading = ref(false);
const rrdLoading = ref(false);
const selectedNodeId = ref<number | null>(null);
const nodeBasicInfo = ref<Node | null>(null);
const nodeStatus = ref<NodeStatus | null>(null);
const nodeServices = ref<NodeService[]>([]);
const nodeRrdData = ref<NodeRrdData | null>(null);
const detailActiveTab = ref("overview");

// 磁盘相关
const disksLoading = ref(false);
const disksList = ref<any[]>([]); // 使用 any[] 因为不同存储类型返回的数据结构不同
const selectedStorageType = ref<string>("list"); // list, lvm, lvmthin, directory, zfs
const selectedDisks = ref<any[]>([]);
const initGptDialogVisible = ref(false);
const wipeDiskDialogVisible = ref(false);
const currentDisk = ref<any | null>(null);
const initGptLoading = ref(false);
const wipeDiskLoading = ref(false);

// 编辑相关
const editingVMLimit = ref(false);
const vmLimitValue = ref<number | null>(null);
const updatingNode = ref(false);

// 网络配置相关
const networksLoading = ref(false);
const networksList = ref<NodeNetwork[]>([]);
const networkDialogVisible = ref(false);
const networkDialogLoading = ref(false);
const networkDialogMode = ref<'create' | 'edit'>('create');
const networkFormRef = ref();
const networkForm = ref<any>({
  iface: '',
  type: 'bridge',
  bridge_ports: '',
  bond_slaves: '',
  bond_mode: '802.3ad',
  bond_hash_policy: 'layer2+3',
  bond_primary: '',
  autostart: 1,
  address: '',
  address6: '',
  gateway: '',
  gateway6: '',
  mtu: 1500,
  vlan_aware: 0,
  vlan_ids: '',
  comment: ''
});
const selectedNetwork = ref<NodeNetwork | null>(null);
const networkFormRules = {
  iface: [{ required: true, message: t('pve.node.networkNameRequired'), trigger: 'blur' }],
  type: [{ required: true, message: t('pve.node.networkTypeRequired'), trigger: 'change' }]
};

// 图表实例
const cpuChartRef = ref<HTMLDivElement | null>(null);
const memoryChartRef = ref<HTMLDivElement | null>(null);
const networkChartRef = ref<HTMLDivElement | null>(null);
let cpuChartInstance: echarts.ECharts | null = null;
let memoryChartInstance: echarts.ECharts | null = null;
let networkChartInstance: echarts.ECharts | null = null;
let rrdRefreshTimer: number | null = null;

// 格式化字节大小
const formatBytes = (bytes: number) => {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
};

// 格式化运行时间
const formatUptime = (seconds: number) => {
  if (!seconds) return `0${t('pve.node.seconds')}`;
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}${t('pve.node.days')}`);
  if (hours > 0) parts.push(`${hours}${t('pve.node.hours')}`);
  if (minutes > 0) parts.push(`${minutes}${t('pve.node.minutes')}`);
  if (secs > 0 || parts.length === 0) parts.push(`${secs}${t('pve.node.seconds')}`);
  
  return parts.join(' ');
};

// 获取进度条颜色
const getProgressColor = (percentage: number) => {
  if (percentage < 50) return '#67c23a';
  if (percentage < 80) return '#e6a23c';
  return '#f56c6c';
};

// 格式化 CPU 信息
const formatCpuInfo = (status: NodeStatus | null): string => {
  if (!status) return '-';
  
  // 优先从 cpuinfo.cpus 获取 CPU 数量
  let cpus = 0;
  if (status.cpuinfo && typeof status.cpuinfo === 'object') {
    cpus = (status.cpuinfo as any).cpus || 0;
  }
  // 如果 cpuinfo 中没有 cpus，则从其他字段获取
  if (!cpus) {
    cpus = status.cpus || status.cpu || 0;
  }
  
  const sockets = status.sockets || status.socket || 1;
  
  // CPU 型号信息可能在不同字段中
  let cpuModel = '';
  if (status.cpuinfo) {
    // 如果 cpuinfo 是字符串，直接使用
    if (typeof status.cpuinfo === 'string') {
      cpuModel = status.cpuinfo;
    } else if (typeof status.cpuinfo === 'object') {
      // 如果是对象，尝试提取 model 字段
      cpuModel = (status.cpuinfo as any).model || (status.cpuinfo as any).name || '';
    }
  } else if (status.model) {
    cpuModel = status.model;
  } else if (status.cpu_model) {
    cpuModel = status.cpu_model;
  }
  
  // 如果都没有，尝试从 cpuinfo 字符串中提取
  if (!cpuModel && status.cpuinfo && typeof status.cpuinfo === 'string') {
    cpuModel = status.cpuinfo;
  }
  
  // 格式化输出：8 x Intel(R) Xeon(R) Gold 5218 CPU @ 2.30GHz (1 Socket)
  if (cpuModel) {
    const socketText = sockets > 1 ? `${sockets} Sockets` : '1 Socket';
    return `${cpus} x ${cpuModel} (${socketText})`;
  } else if (cpus > 0) {
    const socketText = sockets > 1 ? `${sockets} Sockets` : '1 Socket';
    return `${cpus} CPU(s) (${socketText})`;
  }
  
  return '-';
};

const filteredNodes = computed(() => {
  return allNodes.value.filter(node => {
    // 按集群过滤
    if (
      selectedClusterId.value != null &&
      node.cluster_id !== selectedClusterId.value
    ) {
      return false;
    }

    // 按节点名称模糊查询
    if (
      nodeNameKeyword.value &&
      !String(node.node_name)
        .toLowerCase()
        .includes(nodeNameKeyword.value.toLowerCase())
    ) {
      return false;
    }

    // 按 IP 模糊查询
    if (
      nodeIpKeyword.value &&
      !String(node.ip_address)
        .toLowerCase()
        .includes(nodeIpKeyword.value.toLowerCase())
    ) {
      return false;
    }

    return true;
  });
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  const list = filteredNodes.value.slice(start, end);
  total.value = filteredNodes.value.length;
  return list;
});

const loadBaseData = async () => {
  try {
    const [clusterRes, nodeRes] = await Promise.all([
      fetchClusters(),
      fetchNodes()
    ]);
    clusters.value = clusterRes?.data?.list ?? [];
    allNodes.value = nodeRes?.data?.list ?? [];
  } catch (error) {
    console.warn("加载集群或节点列表失败", error);
  }
};

const handleSearch = async () => {
  loading.value = true;
  try {
    // 后端限制最大 page_size 为 100，这里拉取最大允许的数据量
    // 在前端做筛选 + 分页（如果数据超过100条，筛选可能不完整）
    const res = await fetchNodes({
      page: 1,
      page_size: 100
    });
    allNodes.value = res?.data?.list ?? [];
    currentPage.value = 1;
  } catch (error) {
    ElMessage.error("获取节点列表失败");
  } finally {
    loading.value = false;
  }
};

// 加载节点基本信息
const loadNodeBasicInfo = async () => {
  if (!selectedNodeId.value) return;
  
  overviewLoading.value = true;
  try {
    const res = await fetchNodeDetail(selectedNodeId.value);
    nodeBasicInfo.value = res?.data || null;
  } catch (error) {
    ElMessage.error("获取节点基本信息失败");
    console.error(error);
  } finally {
    overviewLoading.value = false;
  }
};

// 加载节点状态
const loadNodeStatus = async () => {
  if (!selectedNodeId.value) return;
  
  overviewLoading.value = true;
  try {
    const res = await fetchNodeStatus(selectedNodeId.value);
    nodeStatus.value = res?.data || null;
    console.log("节点状态数据:", nodeStatus.value);
    console.log("内存相关字段:", {
      maxmem: nodeStatus.value?.maxmem,
      freemem: nodeStatus.value?.freemem,
      memtotal: nodeStatus.value?.memtotal,
      memused: nodeStatus.value?.memused,
      memory: nodeStatus.value?.memory
    });
  } catch (error) {
    ElMessage.error("获取节点状态失败");
    console.error(error);
  } finally {
    overviewLoading.value = false;
  }
};

// 加载节点系统服务
const loadNodeServices = async () => {
  if (!selectedNodeId.value) return;
  
  servicesLoading.value = true;
  try {
    const res = await fetchNodeServices(selectedNodeId.value);
    // 处理服务数据，确保字段映射正确
    // 后端可能返回数组或对象，需要统一处理
    let servicesData = res?.data || [];
    
    // 如果后端返回的是对象（key-value 格式），转换为数组
    if (!Array.isArray(servicesData) && typeof servicesData === 'object') {
      servicesData = Object.entries(servicesData).map(([key, value]: [string, any]) => ({
        name: key,
        service_name: key,
        ...value
      }));
    }
    
    // 统一字段映射，确保前端能正确显示
    const services = servicesData.map((service: any) => {
      return {
        name: service.name || service.service_name || service.key || '',
        service_name: service.service_name || service.name || service.key || '',
        state: service.state || service.status || 'unknown',
        description: service.description || service.desc || service.info || '-'
      };
    });
    nodeServices.value = services;
  } catch (error) {
    ElMessage.error("获取节点系统服务失败");
    console.error(error);
  } finally {
    servicesLoading.value = false;
  }
};

// 启动服务
const handleStartService = async (service: NodeService) => {
  if (!selectedNodeId.value || !service.service_name) return;
  
  try {
    await startNodeService({
      node_id: selectedNodeId.value,
      service_name: service.service_name
    });
    ElMessage.success(t('pve.node.serviceStartSuccess'));
    // 等待服务状态更新后刷新服务列表
    setTimeout(async () => {
      await loadNodeServices();
    }, 1000);
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.node.serviceStartFailed');
    ElMessage.error(msg);
  }
};

// 停止服务
const handleStopService = async (service: NodeService) => {
  if (!selectedNodeId.value || !service.service_name) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.serviceStopConfirm', { name: service.name || service.service_name }),
      t('pve.node.serviceStop'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    await stopNodeService({
      node_id: selectedNodeId.value,
      service_name: service.service_name
    });
    ElMessage.success(t('pve.node.serviceStopSuccess'));
    // 等待服务状态更新后刷新服务列表
    setTimeout(async () => {
      await loadNodeServices();
    }, 1000);
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.node.serviceStopFailed');
      ElMessage.error(msg);
    }
  }
};

// 重启服务
const handleRestartService = async (service: NodeService) => {
  if (!selectedNodeId.value || !service.service_name) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.serviceRestartConfirm', { name: service.name || service.service_name }),
      t('pve.node.serviceRestart'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    await restartNodeService({
      node_id: selectedNodeId.value,
      service_name: service.service_name
    });
    ElMessage.success(t('pve.node.serviceRestartSuccess'));
    // 等待服务状态更新后刷新服务列表
    setTimeout(async () => {
      await loadNodeServices();
    }, 1000);
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.node.serviceRestartFailed');
      ElMessage.error(msg);
    }
  }
};

// 加载节点网络配置
const loadNodeNetworks = async () => {
  if (!selectedNodeId.value) return;
  
  networksLoading.value = true;
  try {
    const res = await fetchNodeNetworks(selectedNodeId.value);
    networksList.value = res?.data || [];
  } catch (error) {
    ElMessage.error(t('pve.node.networkLoadFailed'));
    console.error(error);
  } finally {
    networksLoading.value = false;
  }
};

// 打开创建网络配置对话框
const handleCreateNetwork = () => {
  networkDialogMode.value = 'create';
  networkForm.value = {
    iface: '',
    type: 'bridge',
    bridge_ports: '',
    bond_slaves: '',
    bond_mode: '802.3ad',
    bond_hash_policy: 'layer2+3',
    bond_primary: '',
    autostart: 1,
    address: '',
    address6: '',
    gateway: '',
    gateway6: '',
    mtu: 1500,
    vlan_aware: 0,
    vlan_ids: '',
    comment: ''
  };
  selectedNetwork.value = null;
  networkDialogVisible.value = true;
};

// 解析地址字段，分离 IPv4 和 IPv6
const parseAddress = (address?: string) => {
  if (!address) return { ipv4: '', ipv6: '' };
  
  // 去除首尾空格
  const trimmedAddress = address.trim();
  if (!trimmedAddress) return { ipv4: '', ipv6: '' };
  
  // 如果地址中包含空格，说明可能有多个地址（IPv4 和 IPv6）
  const parts = trimmedAddress.split(/\s+/);
  
  // 查找 IPv4 地址（包含 . 的 CIDR 格式，如 10.7.114.121/24）
  let ipv4 = '';
  for (const part of parts) {
    const trimmed = part.trim();
    // IPv4 CIDR 格式：包含 . 和 /，使用正则匹配确保完整格式
    // 匹配格式：xxx.xxx.xxx.xxx/xx
    if (trimmed.includes('.') && trimmed.includes('/')) {
      // 使用正则表达式匹配完整的 IPv4 CIDR 格式
      const ipv4Match = trimmed.match(/^\d+\.\d+\.\d+\.\d+\/\d+$/);
      if (ipv4Match) {
        ipv4 = trimmed;
        break;
      }
    }
  }
  
  // 查找 IPv6 地址（包含 : 的 CIDR 格式）
  let ipv6 = '';
  for (const part of parts) {
    const trimmed = part.trim();
    // IPv6 CIDR 格式：包含 : 和 /
    if (trimmed.includes(':') && trimmed.includes('/')) {
      ipv6 = trimmed;
      break;
    }
  }
  
  return { ipv4, ipv6 };
};

// 解析网关字段，分离 IPv4 和 IPv6
const parseGateway = (gateway?: string) => {
  if (!gateway) return { ipv4: '', ipv6: '' };
  const parts = gateway.split(' ');
  const ipv4 = parts.find(p => p.includes('.')) || '';
  const ipv6 = parts.find(p => p.includes(':')) || '';
  return { ipv4, ipv6 };
};

// 打开编辑网络配置对话框
const handleEditNetwork = (network: NodeNetwork) => {
  networkDialogMode.value = 'edit';
  selectedNetwork.value = network;
  
  // 解析地址：优先使用 address 字段，如果没有则尝试从网桥端口对应的网络接口中查找
  let addressValue = network.address || (network as any).cidr || (network as any).ipv4_cidr || '';
  
  // 如果 address 为空，且是网桥类型，尝试从 bridge_ports 对应的网络接口中查找地址
  if (!addressValue && network.type === 'bridge' && network.bridge_ports) {
    const bridgePort = network.bridge_ports.split(/\s+/)[0]; // 取第一个端口
    if (bridgePort) {
      // 从网络列表中查找对应的物理网卡接口
      const portInterface = networksList.value.find((n: NodeNetwork) => n.iface === bridgePort);
      if (portInterface && portInterface.address) {
        addressValue = portInterface.address;
      }
    }
  }
  
  // 解析地址字段
  let finalAddress = '';
  let address6 = '';
  
  if (addressValue) {
    const trimmed = addressValue.trim();
    // 先检查是否是单个 IPv4 CIDR 格式（如 10.7.114.121/24），直接使用
    if (trimmed.includes('.') && trimmed.includes('/')) {
      const ipv4Match = trimmed.match(/(\d+\.\d+\.\d+\.\d+\/\d+)/);
      if (ipv4Match) {
        finalAddress = ipv4Match[1]; // 提取匹配的 CIDR 部分
      } else {
        // 如果正则匹配失败，但包含 . 和 /，直接使用整个字符串
        finalAddress = trimmed;
      }
    }
    
    // 如果还没有找到，使用 parseAddress 函数解析（可能包含多个地址）
    if (!finalAddress) {
      const parsed = parseAddress(addressValue);
      finalAddress = parsed.ipv4;
      address6 = parsed.ipv6;
    } else {
      // 如果已经找到 IPv4，再检查是否有 IPv6
      const parsed = parseAddress(addressValue);
      address6 = parsed.ipv6;
    }
  }
  
  // 解析网关
  const gatewayValue = network.gateway || (network as any).gateway_ipv4 || '';
  const { ipv4: gateway, ipv6: gateway6 } = parseGateway(gatewayValue);
  
  networkForm.value = {
    iface: network.iface || '',
    type: network.type || 'bridge',
    bridge_ports: network.bridge_ports || '',
    bond_slaves: network.bond_slaves || '',
    bond_mode: network.bond_mode || '802.3ad',
    bond_hash_policy: network.bond_hash_policy || 'layer2+3',
    bond_primary: network.bond_primary || '',
    autostart: network.autostart ? 1 : 0,
    address: finalAddress, // 使用最终解析的地址，确保包含完整的 CIDR
    address6: address6,
    gateway: gateway,
    gateway6: gateway6,
    mtu: network.mtu || 1500,
    vlan_aware: network.vlan_aware ? 1 : 0,
    vlan_ids: network.vlan_ids || '',
    comment: network.comment || ''
  };
  networkDialogVisible.value = true;
};

// 保存网络配置
const handleSaveNetwork = async () => {
  if (!selectedNodeId.value) return;
  
  if (!networkFormRef.value) return;
  const valid = await networkFormRef.value.validate().catch(() => false);
  if (!valid) return;
  
  networkDialogLoading.value = true;
  try {
    const payload: any = {
      node_id: selectedNodeId.value,
      iface: networkForm.value.iface,
      type: networkForm.value.type,
      autostart: networkForm.value.autostart,
      vlan_aware: networkForm.value.vlan_aware
    };
    
    if (networkForm.value.type === 'bridge' && networkForm.value.bridge_ports) {
      payload.bridge_ports = networkForm.value.bridge_ports;
    }
    
    if (networkForm.value.type === 'bond') {
      if (networkForm.value.bond_slaves) {
        payload.bond_slaves = networkForm.value.bond_slaves;
      }
      if (networkForm.value.bond_mode) {
        payload.bond_mode = networkForm.value.bond_mode;
      }
      if (networkForm.value.bond_hash_policy) {
        payload.bond_hash_policy = networkForm.value.bond_hash_policy;
      }
      if (networkForm.value.bond_primary) {
        payload.bond_primary = networkForm.value.bond_primary;
      }
    }
    
    // 合并 IPv4 和 IPv6 地址
    const addresses = [];
    if (networkForm.value.address) {
      addresses.push(networkForm.value.address);
    }
    if (networkForm.value.address6) {
      addresses.push(networkForm.value.address6);
    }
    if (addresses.length > 0) {
      payload.address = addresses.join(' ');
    }
    
    // 合并 IPv4 和 IPv6 网关
    const gateways = [];
    if (networkForm.value.gateway) {
      gateways.push(networkForm.value.gateway);
    }
    if (networkForm.value.gateway6) {
      gateways.push(networkForm.value.gateway6);
    }
    if (gateways.length > 0) {
      payload.gateway = gateways.join(' ');
    }
    
    if (networkForm.value.mtu && networkForm.value.mtu !== 1500) {
      payload.mtu = networkForm.value.mtu;
    }
    
    if (networkForm.value.type === 'bridge' && networkForm.value.vlan_ids) {
      payload.vlan_ids = networkForm.value.vlan_ids;
    }
    
    if (networkForm.value.comment) {
      payload.comment = networkForm.value.comment;
    }
    
    await createNodeNetwork(payload);
    ElMessage.success(networkDialogMode.value === 'create' ? t('pve.node.networkCreateSuccess') : t('pve.node.networkUpdateSuccess'));
    networkDialogVisible.value = false;
    await loadNodeNetworks();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || (networkDialogMode.value === 'create' ? t('pve.node.networkCreateFailed') : t('pve.node.networkUpdateFailed'));
    ElMessage.error(msg);
  } finally {
    networkDialogLoading.value = false;
  }
};

// 删除网络配置
const handleDeleteNetwork = async (network: NodeNetwork) => {
  if (!selectedNodeId.value || !network.iface) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.networkDeleteConfirm', { name: network.iface }),
      t('pve.node.networkDelete'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    // 删除网络配置使用创建接口，但需要特殊处理
    // 这里可能需要后端支持删除接口，暂时使用创建接口
    await createNodeNetwork({
      node_id: selectedNodeId.value,
      iface: network.iface,
      type: network.type || 'bridge',
      autostart: 0
    });
    
    ElMessage.success(t('pve.node.networkDeleteSuccess'));
    await loadNodeNetworks();
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.node.networkDeleteFailed');
      ElMessage.error(msg);
    }
  }
};

// 重新加载网络配置
const handleReloadNetwork = async () => {
  if (!selectedNodeId.value) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.networkReloadConfirm'),
      t('pve.node.networkReload'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    await reloadNodeNetwork({ node_id: selectedNodeId.value });
    ElMessage.success(t('pve.node.networkReloadSuccess'));
    await loadNodeNetworks();
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.node.networkReloadFailed');
      ElMessage.error(msg);
    }
  }
};

// 恢复网络配置更改
const handleRevertNetwork = async () => {
  if (!selectedNodeId.value) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.networkRevertConfirm'),
      t('pve.node.networkRevert'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    await revertNodeNetwork({ node_id: selectedNodeId.value });
    ElMessage.success(t('pve.node.networkRevertSuccess'));
    await loadNodeNetworks();
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.node.networkRevertFailed');
      ElMessage.error(msg);
    }
  }
};

// 格式化网络类型显示
const formatNetworkType = (type?: string) => {
  const typeMap: Record<string, string> = {
    bridge: t('pve.node.networkTypeBridge'),
    bond: t('pve.node.networkTypeBond'),
    eth: t('pve.node.networkTypeEth'),
    vlan: t('pve.node.networkTypeVlan')
  };
  return typeMap[type || ''] || type || '-';
};

// 格式化Bond模式显示
const formatBondMode = (mode?: string) => {
  const modeMap: Record<string, string> = {
    '802.3ad': 'LACP (802.3ad)',
    'balance-rr': 'Round-robin',
    'active-backup': 'Active-backup',
    'balance-xor': 'XOR',
    'broadcast': 'Broadcast',
    'balance-tlb': 'Adaptive transmit load balancing',
    'balance-alb': 'Adaptive load balancing'
  };
  return modeMap[mode || ''] || mode || '-';
};

// 加载概览数据
const loadOverview = async () => {
  await Promise.all([
    loadNodeBasicInfo(),
    loadNodeStatus()
  ]);
};

// 显示节点详情抽屉
const handleShowDetail = async (row: Node) => {
  selectedNodeId.value = row.id;
  detailVisible.value = true;
  detailActiveTab.value = "overview";
  editingVMLimit.value = false;
  vmLimitValue.value = null;
};

// 切换调度状态
const handleToggleSchedulable = async (row: Node, event: Event) => {
  event.stopPropagation(); // 阻止事件冒泡，避免触发行点击
  const newSchedulable = row.is_schedulable === 1 ? 0 : 1;
  
  try {
    await updateNode(row.id, { is_schedulable: newSchedulable });
    ElMessage.success(newSchedulable === 1 ? t('pve.node.scheduleEnabled') : t('pve.node.scheduleDisabled'));
    // 更新本地数据
    const node = allNodes.value.find(n => n.id === row.id);
    if (node) {
      node.is_schedulable = newSchedulable;
    }
  } catch (error) {
    ElMessage.error(t('pve.common.updateFailed'));
    console.error(error);
  }
};

// 跳转到 Proxmox VE 后台
const handleJumpToBackend = (row: Node, event: Event) => {
  event.stopPropagation(); // 阻止事件冒泡，避免触发行点击
  
  if (!row.cluster_id) {
    ElMessage.warning(t('pve.node.noClusterForBackend'));
    return;
  }
  
  const cluster = clusters.value.find(c => c.id === row.cluster_id);
  if (!cluster || !cluster.api_url) {
    ElMessage.warning(t('pve.node.noApiUrlForBackend'));
    return;
  }
  
  // 构建 Proxmox VE 后台 URL：${api_url}/#v1:0:=node%2F${node_name}:4:::::::
  // 其中 %2F 是 / 的 URL 编码，格式为 node/pve121
  const backendUrl = `${cluster.api_url}/#v1:0:=node%2F${row.node_name}:4:::::::`;
  window.open(backendUrl, "_blank");
};

// 节点重启
const handleRebootNode = async (row: Node, event: Event) => {
  event.stopPropagation();
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.confirmRebootMessage', { name: row.node_name }),
      t('pve.node.confirmReboot'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: "warning"
      }
    );
    
    console.log('准备重启节点:', row.id, row.node_name);
    const result = await updateNodeStatus({
      node_id: row.id,
      command: "reboot"
    });
    console.log('重启节点接口调用结果:', result);
    
    ElMessage.success(t('pve.node.rebootCommandSent'));
  } catch (error: any) {
    console.error('重启节点失败:', error);
    if (error !== "cancel") {
      ElMessage.error(error?.response?.data?.message || error?.message || t('pve.node.rebootFailed'));
    }
  }
};

// 节点关闭
const handleShutdownNode = async (row: Node, event: Event) => {
  event.stopPropagation();
  
  try {
    await ElMessageBox.confirm(
      t('pve.node.confirmShutdownMessage', { name: row.node_name }),
      t('pve.node.confirmShutdown'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: "warning"
      }
    );
    
    console.log('准备关闭节点:', row.id, row.node_name);
    const result = await updateNodeStatus({
      node_id: row.id,
      command: "shutdown"
    });
    console.log('关闭节点接口调用结果:', result);
    
    ElMessage.success(t('pve.node.shutdownCommandSent'));
  } catch (error: any) {
    console.error('关闭节点失败:', error);
    if (error !== "cancel") {
      ElMessage.error(error?.response?.data?.message || error?.message || t('pve.node.shutdownFailed'));
    }
  }
};

// 节点 Console
const consoleDialogVisible = ref(false);
const consoleNodeId = ref<number | null>(null);
const consoleNodeName = ref<string>("");
const consoleClusterId = ref<number | null>(null);

const handleNodeConsole = (row: Node, event: Event) => {
  event.stopPropagation();
  consoleNodeId.value = row.id;
  consoleNodeName.value = row.node_name;
  consoleClusterId.value = row.cluster_id;
  consoleDialogVisible.value = true;
};

// 主机维护（占位）
const handleNodeMaintenance = (row: Node, event: Event) => {
  event.stopPropagation();
  ElMessage.info(t('pve.node.maintenanceNotImplemented'));
};

// 处理下拉菜单命令
const handleDropdownCommand = (cmd: string, row: Node) => {
  console.log('下拉菜单命令:', cmd, row);
  const fakeEvent = new Event('click');
  if (cmd === 'reboot') {
    handleRebootNode(row, fakeEvent);
  } else if (cmd === 'shutdown') {
    handleShutdownNode(row, fakeEvent);
  } else if (cmd === 'backend') {
    handleJumpToBackend(row, fakeEvent);
  }
};

// 开始编辑虚拟机限制
const handleStartEditVMLimit = () => {
  if (nodeBasicInfo.value) {
    vmLimitValue.value = nodeBasicInfo.value.vm_limit || 0;
    editingVMLimit.value = true;
  }
};

// 取消编辑虚拟机限制
const handleCancelEditVMLimit = () => {
  editingVMLimit.value = false;
  vmLimitValue.value = null;
};

// 保存虚拟机限制
const handleSaveVMLimit = async () => {
  if (!selectedNodeId.value || vmLimitValue.value === null) return;
  
  updatingNode.value = true;
  try {
    await updateNode(selectedNodeId.value, { vm_limit: vmLimitValue.value });
    ElMessage.success(t('pve.node.updateVMLimitSuccess'));
    editingVMLimit.value = false;
    // 重新加载基本信息
    await loadNodeBasicInfo();
    // 更新列表中的数据
    const node = allNodes.value.find(n => n.id === selectedNodeId.value);
    if (node && nodeBasicInfo.value) {
      node.vm_limit = nodeBasicInfo.value.vm_limit;
    }
  } catch (error) {
    ElMessage.error(t('pve.node.updateVMLimitFailed'));
    console.error(error);
  } finally {
    updatingNode.value = false;
  }
};

// 加载节点 RRD 数据
const loadNodeRrd = async () => {
  if (!selectedNodeId.value) return;
  
  rrdLoading.value = true;
  try {
    const res = await fetchNodeRrd(selectedNodeId.value, 'hour', 'AVERAGE');
    nodeRrdData.value = res?.data || null;
    await nextTick();
    updateCharts();
  } catch (error) {
    ElMessage.error("获取节点监控数据失败");
    console.error(error);
  } finally {
    rrdLoading.value = false;
  }
};

// 初始化图表
const initCharts = () => {
  if (!cpuChartRef.value || !memoryChartRef.value || !networkChartRef.value) return;
  
  // CPU 使用率图表
  if (!cpuChartInstance) {
    cpuChartInstance = echarts.init(cpuChartRef.value);
  }
  cpuChartInstance.setOption({
    title: { text: 'CPU Usage', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: '%', max: 100 },
    series: [{ name: 'CPU Usage', type: 'line', smooth: true, data: [] }],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  });
  
  // 内存使用率图表
  if (!memoryChartInstance) {
    memoryChartInstance = echarts.init(memoryChartRef.value);
  }
  memoryChartInstance.setOption({
    title: { text: 'Memory Usage', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: '%', max: 100 },
    series: [{ name: 'Memory Usage', type: 'line', smooth: true, data: [] }],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  });
  
  // 网络流量图表
  if (!networkChartInstance) {
    networkChartInstance = echarts.init(networkChartRef.value);
  }
  networkChartInstance.setOption({
    title: { text: 'Network', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: 'Bytes/s' },
    series: [
      { name: 'Network In', type: 'line', smooth: true, data: [] },
      { name: 'Network Out', type: 'line', smooth: true, data: [] }
    ],
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    legend: { data: ['Network In', 'Network Out'], bottom: '5%', itemGap: 20 }
  });
};

// 更新图表数据
const updateCharts = () => {
  if (!nodeRrdData.value) return;
  
  // RRD 返回可能是对象也可能是数组，这里按数组处理
  const records = Array.isArray(nodeRrdData.value?.data)
    ? (nodeRrdData.value as any).data
    : (Array.isArray(nodeRrdData.value) ? nodeRrdData.value : []);

  if (!records.length) return;

  const timeData = records.map((r: any) =>
    r.time ? dayjs((r.time as number) * 1000).format("HH:mm:ss") : ""
  );

  // 更新 CPU 图表（cpu 是占比，0-1）
  if (cpuChartInstance) {
    const cpuData = records.map((r: any) =>
      typeof r.cpu === "number" ? (r.cpu * 100).toFixed(2) : 0
    );
    cpuChartInstance.setOption({
      xAxis: { data: timeData },
      series: [{ data: cpuData }]
    });
  }

  // 更新内存图表（memused/memtotal）
  if (memoryChartInstance) {
    const memData = records.map((r: any) => {
      const used = r.memused ?? 0;
      const total = r.memtotal ?? 0;
      if (!total) return 0;
      return ((used / total) * 100).toFixed(2);
    });
    memoryChartInstance.setOption({
      xAxis: { data: timeData },
      series: [{ data: memData }]
    });
  }

  // 更新网络图表（netin/netout）
  if (networkChartInstance) {
    const netinData = records.map((r: any) => r.netin ?? 0);
    const netoutData = records.map((r: any) => r.netout ?? 0);
    networkChartInstance.setOption({
      xAxis: { data: timeData },
      series: [
        { name: "Network In", data: netinData },
        { name: "Network Out", data: netoutData }
      ]
    });
  }
};

// 启动 RRD 数据自动刷新
const startRrdRefresh = () => {
  if (rrdRefreshTimer) return;
  rrdRefreshTimer = window.setInterval(() => {
    if (detailVisible.value && detailActiveTab.value === 'overview' && selectedNodeId.value) {
      loadNodeRrd();
    }
  }, 10000); // 每10秒刷新一次
};

// 停止 RRD 数据自动刷新
const stopRrdRefresh = () => {
  if (rrdRefreshTimer) {
    clearInterval(rrdRefreshTimer);
    rrdRefreshTimer = null;
  }
};

// 销毁图表
const destroyCharts = () => {
  if (cpuChartInstance) {
    cpuChartInstance.dispose();
    cpuChartInstance = null;
  }
  if (memoryChartInstance) {
    memoryChartInstance.dispose();
    memoryChartInstance = null;
  }
  if (networkChartInstance) {
    networkChartInstance.dispose();
    networkChartInstance = null;
  }
};

// 监听抽屉打开/关闭
watch(detailVisible, (visible) => {
  if (visible && selectedNodeId.value) {
    loadOverview();
    loadNodeServices();
    loadNodeNetworks();
    loadNodeRrd();
    nextTick(() => {
      initCharts();
      startRrdRefresh();
    });
  } else {
    stopRrdRefresh();
    destroyCharts();
    selectedNodeId.value = null;
    nodeBasicInfo.value = null;
    nodeStatus.value = null;
    nodeServices.value = [];
    networksList.value = [];
    nodeRrdData.value = null;
    disksList.value = [];
    selectedDisks.value = [];
    selectedStorageType.value = "list";
    currentDisk.value = null;
  }
});

// 加载磁盘列表
const loadDisks = async () => {
  if (!selectedNodeId.value) return;
  
  disksLoading.value = true;
  try {
    let res;
    switch (selectedStorageType.value) {
      case "lvm":
        res = await fetchNodeLvmStorage(selectedNodeId.value);
        break;
      case "lvmthin":
        res = await fetchNodeLvmThinStorage(selectedNodeId.value);
        break;
      case "directory":
        res = await fetchNodeDirectoryStorage(selectedNodeId.value);
        break;
      case "zfs":
        res = await fetchNodeZfsStorage(selectedNodeId.value);
        break;
      default:
        res = await fetchNodeDisks(selectedNodeId.value);
    }
    disksList.value = res?.data || [];
  } catch (error) {
    ElMessage.error("获取磁盘列表失败");
    console.error(error);
  } finally {
    disksLoading.value = false;
  }
};

// 计算菜单激活项
const activeMenuIndex = computed(() => {
  return selectedStorageType.value === 'list' ? '' : selectedStorageType.value;
});

// 切换存储类型
const handleStorageTypeChange = (type: string) => {
  selectedStorageType.value = type;
  loadDisks();
};

// 格式化磁盘大小
const formatDiskSize = (size: number | string) => {
  if (!size) return '-';
  const numSize = typeof size === 'string' ? parseFloat(size) : size;
  if (isNaN(numSize)) return size;
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let sizeValue = numSize;
  
  while (sizeValue >= 1024 && unitIndex < units.length - 1) {
    sizeValue /= 1024;
    unitIndex++;
  }
  
  return `${sizeValue.toFixed(2)} ${units[unitIndex]}`;
};

// 初始化 GPT 磁盘
const handleInitGpt = async () => {
  if (!currentDisk.value || !selectedNodeId.value) return;
  
  // 只有 list 类型才支持初始化 GPT
  if (selectedStorageType.value !== 'list') {
    ElMessage.warning("当前存储类型不支持此操作");
    return;
  }
  
  initGptLoading.value = true;
  try {
    await initGptDisk({
      node_id: selectedNodeId.value,
      device: currentDisk.value.devpath || currentDisk.value.device
    });
    ElMessage.success("初始化 GPT 磁盘成功");
    initGptDialogVisible.value = false;
    currentDisk.value = null;
    await loadDisks();
  } catch (error) {
    ElMessage.error("初始化 GPT 磁盘失败");
    console.error(error);
  } finally {
    initGptLoading.value = false;
  }
};

// 擦除磁盘
const handleWipeDisk = async () => {
  if (!currentDisk.value || !selectedNodeId.value) return;
  
  // 只有 list 类型才支持擦除磁盘
  if (selectedStorageType.value !== 'list') {
    ElMessage.warning("当前存储类型不支持此操作");
    return;
  }
  
  wipeDiskLoading.value = true;
  try {
    await wipeDisk({
      node_id: selectedNodeId.value,
      device: currentDisk.value.devpath || currentDisk.value.device
    });
    ElMessage.success("擦除磁盘成功");
    wipeDiskDialogVisible.value = false;
    currentDisk.value = null;
    await loadDisks();
  } catch (error) {
    ElMessage.error("擦除磁盘失败");
    console.error(error);
  } finally {
    wipeDiskLoading.value = false;
  }
};

// 打开初始化 GPT 对话框
const openInitGptDialog = (disk: Disk) => {
  currentDisk.value = disk;
  initGptDialogVisible.value = true;
};

// 打开擦除磁盘对话框
const openWipeDiskDialog = (disk: Disk) => {
  currentDisk.value = disk;
  wipeDiskDialogVisible.value = true;
};

// 处理初始化 GPT 按钮点击
const handleInitGptClick = () => {
  if (selectedDisks.value.length > 0) {
    openInitGptDialog(selectedDisks.value[0]);
  }
};

// 处理擦除磁盘按钮点击
const handleWipeDiskClick = () => {
  if (selectedDisks.value.length > 0) {
    openWipeDiskDialog(selectedDisks.value[0]);
  }
};

// 监听标签页切换
watch(detailActiveTab, (newTab) => {
  if (!detailVisible.value || !selectedNodeId.value) return;
  
  if (newTab === "overview") {
    loadOverview();
    loadNodeRrd();
    nextTick(() => {
      initCharts();
      startRrdRefresh();
    });
  } else if (newTab === "disks") {
    selectedStorageType.value = "list";
    loadDisks();
  } else if (newTab === "network") {
    loadNodeNetworks();
  } else {
    stopRrdRefresh();
  }
});

onMounted(async () => {
  await loadBaseData();
  await handleSearch();
});

onUnmounted(() => {
  stopRrdRefresh();
  destroyCharts();
});
</script>

<template>
  <div class="pve-page">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-medium">{{ t('pve.node.title') }}</span>
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
          v-model="nodeNameKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.node.nodeName')"
        />

        <el-input
          v-model="nodeIpKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.node.ipAddress')"
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
        class="node-table"
      >
        <el-table-column prop="id" label="ID" min-width="80" />
        <el-table-column prop="node_name" :label="t('pve.node.nodeName')" min-width="160" />
        <el-table-column prop="ip_address" :label="t('pve.node.ipAddress')" min-width="140" />
        <el-table-column prop="cluster_name" :label="t('pve.cluster.clusterName')" min-width="140" />
        <el-table-column prop="env" :label="t('pve.node.env')" width="100" />
        <el-table-column prop="status" :label="t('pve.common.status')" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="row.status === 'online' ? 'success' : row.status === 'offline' ? 'danger' : 'warning'" 
              size="small"
            >
              {{ row.status === 'online' ? t('pve.node.online') : row.status === 'offline' ? t('pve.node.offline') : row.status || t('pve.node.unknown') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="vm_limit" :label="t('pve.node.vmLimit')" width="120" />
        <el-table-column prop="is_schedulable" :label="t('pve.node.schedulable')" width="120">
          <template #default="{ row }">
            <el-tag :type="row.is_schedulable === 1 ? 'success' : 'info'">
              {{ row.is_schedulable === 1 ? t('pve.node.schedulableEnabled') : t('pve.node.schedulableDisabled') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('pve.common.operate')" width="300" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-0.5 flex-wrap">
              <!-- 关闭调度 -->
              <el-button
                :type="row.is_schedulable === 1 ? 'warning' : 'success'"
                link
                size="small"
                @click.stop="handleToggleSchedulable(row, $event)"
              >
                {{ row.is_schedulable === 1 ? t('pve.node.disableSchedule') : t('pve.node.enableSchedule') }}
              </el-button>
              
              <!-- Console -->
              <el-button
                type="primary"
                link
                size="small"
                @click.stop="handleNodeConsole(row, $event)"
              >
                {{ t('pve.node.console') }}
              </el-button>
              
              <!-- 主机维护 -->
              <el-button
                type="info"
                link
                size="small"
                @click.stop="handleNodeMaintenance(row, $event)"
              >
                {{ t('pve.node.maintenance') }}
              </el-button>
              
              <!-- 更多操作 -->
              <el-dropdown trigger="click" @command="(cmd: string) => handleDropdownCommand(cmd, row)">
                <el-button type="primary" link size="small" @click.stop>
                  {{ t('pve.common.more') }} <el-icon><ArrowDown /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="reboot">{{ t('pve.node.reboot') }}</el-dropdown-item>
                    <el-dropdown-item command="shutdown">{{ t('pve.node.shutdown') }}</el-dropdown-item>
                    <el-dropdown-item command="backend" divided>{{ t('pve.common.backendLogin') }}</el-dropdown-item>
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
      :title="`${t('pve.node.nodeName')} ${nodeBasicInfo?.node_name || ''}`"
      size="60%"
      :destroy-on-close="true"
    >
      <el-tabs v-model="detailActiveTab">
        <!-- 概览 -->
        <el-tab-pane :label="t('pve.node.overview')" name="overview">
          <div v-loading="overviewLoading" class="overview-wrapper">
            <!-- 基本信息 -->
            <el-card shadow="never" class="overview-card">
              <template #header>
                <div class="card-title">{{ t('pve.node.basicInfo') }}</div>
              </template>
              <div v-if="nodeBasicInfo" class="info-grid">
                <div class="info-item">
                  <span class="info-label">ID：</span>
                  <span class="info-value">{{ nodeBasicInfo.id }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.node.nodeName') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.node_name }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.node.ipAddress') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.ip_address || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.cluster.clusterName') }} ID：</span>
                  <span class="info-value">{{ nodeBasicInfo.cluster_id }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.cluster.clusterName') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.cluster_name || '-' }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.node.env') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.env }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.common.status') }}：</span>
                  <span class="info-value">
                    <el-tag :type="nodeBasicInfo.status === 'online' ? 'success' : 'danger'">
                      {{ nodeBasicInfo.status }}
                    </el-tag>
                  </span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.node.schedulable') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.is_schedulable ? t('pve.node.schedulableEnabled') : t('pve.node.schedulableDisabled') }}</span>
                </div>
                <div class="info-item">
                  <span class="info-label">{{ t('pve.node.vmLimit') }}：</span>
                  <span class="info-value">
                    <template v-if="!editingVMLimit">
                      {{ nodeBasicInfo.vm_limit || 0 }}
                      <el-button
                        type="primary"
                        link
                        size="small"
                        style="margin-left: 8px;"
                        @click="handleStartEditVMLimit"
                      >
                        {{ t('pve.common.edit') }}
                      </el-button>
                    </template>
                    <template v-else>
                      <el-input-number
                        v-model="vmLimitValue"
                        :min="0"
                        :precision="0"
                        style="width: 150px;"
                      />
                      <el-button
                        type="primary"
                        link
                        size="small"
                        style="margin-left: 8px;"
                        :loading="updatingNode"
                        @click="handleSaveVMLimit"
                      >
                        {{ t('pve.common.save') }}
                      </el-button>
                      <el-button
                        type="info"
                        link
                        size="small"
                        style="margin-left: 4px;"
                        @click="handleCancelEditVMLimit"
                      >
                        {{ t('pve.common.cancel') }}
                      </el-button>
                    </template>
                  </span>
                </div>
                <div v-if="nodeBasicInfo.annotations" class="info-item">
                  <span class="info-label">{{ t('pve.node.annotations') }}：</span>
                  <span class="info-value">{{ nodeBasicInfo.annotations }}</span>
                </div>
              </div>
              <el-empty v-else :description="t('pve.common.noData')" />
            </el-card>

            <!-- 资源使用情况 -->
            <el-card shadow="never" class="overview-card">
              <template #header>
                <div class="card-title">{{ t('pve.node.nodeStatus') }}</div>
              </template>
              <div v-if="nodeStatus" class="resource-usage">
                <div class="resource-column">
                  <!-- CPU usage -->
                  <div v-if="nodeStatus.cpu !== undefined || (nodeStatus.cpuinfo && typeof nodeStatus.cpuinfo === 'object' && nodeStatus.cpuinfo.cpus)" class="resource-item">
                    <div class="resource-header">
                      <span class="resource-label">{{ t('pve.node.cpuUsage') }}：</span>
                      <span class="resource-text">
                        {{ Math.round((nodeStatus.cpu || 0) * 100) }}% {{ t('pve.node.of') }} {{ (nodeStatus.cpuinfo && typeof nodeStatus.cpuinfo === 'object' && nodeStatus.cpuinfo.cpus) ? nodeStatus.cpuinfo.cpus : (nodeStatus.cpus || '-') }} CPU(s)
                      </span>
                    </div>
                    <div class="resource-progress">
                      <span class="progress-label">{{ t('pve.node.usage') }}</span>
                      <el-progress
                        :percentage="Math.round((nodeStatus.cpu || 0) * 100)"
                        :color="getProgressColor(Math.round((nodeStatus.cpu || 0) * 100))"
                        :stroke-width="8"
                      />
                    </div>
                  </div>

                  <!-- Load average -->
                  <div v-if="nodeStatus.loadavg" class="resource-item">
                    <div class="resource-label">
                      {{ t('pve.node.loadAverage') }}：
                    </div>
                    <div class="resource-content">
                      <span class="resource-text">
                        {{ Array.isArray(nodeStatus.loadavg) ? nodeStatus.loadavg.join(',') : nodeStatus.loadavg }}
                      </span>
                    </div>
                  </div>

                  <!-- RAM usage -->
                  <div v-if="nodeStatus && (nodeStatus.memory || nodeStatus.memtotal !== undefined || nodeStatus.maxmem !== undefined)" class="resource-item">
                    <div class="resource-header">
                      <span class="resource-label">{{ t('pve.node.memUsage') }}：</span>
                      <span class="resource-text">
                        <template v-if="nodeStatus.memory && typeof nodeStatus.memory === 'object' && nodeStatus.memory.total">
                          {{ nodeStatus.memory.total ? Math.round(((nodeStatus.memory.used || 0) / nodeStatus.memory.total) * 100) : 0 }}%
                          ({{ formatBytes(nodeStatus.memory.used || 0) }} {{ t('pve.node.of') }} {{ formatBytes(nodeStatus.memory.total || 0) }})
                        </template>
                        <template v-else-if="nodeStatus.memtotal">
                          {{ nodeStatus.memtotal ? Math.round(((nodeStatus.memused || 0) / nodeStatus.memtotal) * 100) : 0 }}%
                          ({{ formatBytes(nodeStatus.memused || 0) }} {{ t('pve.node.of') }} {{ formatBytes(nodeStatus.memtotal || 0) }})
                        </template>
                        <template v-else-if="nodeStatus.maxmem">
                          {{ nodeStatus.maxmem ? Math.round(((nodeStatus.maxmem - (nodeStatus.freemem || 0)) / nodeStatus.maxmem) * 100) : 0 }}%
                          ({{ formatBytes((nodeStatus.maxmem || 0) - (nodeStatus.freemem || 0)) }} {{ t('pve.node.of') }} {{ formatBytes(nodeStatus.maxmem || 0) }})
                        </template>
                        <template v-else>
                          0% (0 B {{ t('pve.node.of') }} 0 B)
                        </template>
                      </span>
                    </div>
                    <div class="resource-progress">
                      <span class="progress-label">{{ t('pve.node.usage') }}</span>
                      <el-progress
                        :percentage="nodeStatus.memory && typeof nodeStatus.memory === 'object' && nodeStatus.memory.total
                          ? Math.round(((nodeStatus.memory.used || 0) / nodeStatus.memory.total) * 100)
                          : (nodeStatus.memtotal 
                            ? Math.round(((nodeStatus.memused || 0) / nodeStatus.memtotal) * 100)
                            : (nodeStatus.maxmem ? Math.round(((nodeStatus.maxmem - (nodeStatus.freemem || 0)) / nodeStatus.maxmem) * 100) : 0))"
                        :color="getProgressColor(nodeStatus.memory && typeof nodeStatus.memory === 'object' && nodeStatus.memory.total
                          ? Math.round(((nodeStatus.memory.used || 0) / nodeStatus.memory.total) * 100)
                          : (nodeStatus.memtotal 
                            ? Math.round(((nodeStatus.memused || 0) / nodeStatus.memtotal) * 100)
                            : (nodeStatus.maxmem ? Math.round(((nodeStatus.maxmem - (nodeStatus.freemem || 0)) / nodeStatus.maxmem) * 100) : 0)))"
                        :stroke-width="8"
                      />
                    </div>
                  </div>

                  <!-- HD space -->
                  <div v-if="nodeStatus.disk !== undefined || nodeStatus.maxdisk !== undefined" class="resource-item">
                    <div class="resource-header">
                      <span class="resource-label">{{ t('pve.node.hdSpace') }}：</span>
                      <span class="resource-text">
                        {{ nodeStatus.maxdisk ? Math.round((nodeStatus.disk || 0) / nodeStatus.maxdisk * 100) : 0 }}%
                        ({{ formatBytes(nodeStatus.disk || 0) }} {{ t('pve.node.of') }} {{ formatBytes(nodeStatus.maxdisk || 0) }})
                      </span>
                    </div>
                    <div class="resource-progress">
                      <span class="progress-label">{{ t('pve.node.usage') }}</span>
                      <el-progress
                        :percentage="nodeStatus.maxdisk ? Math.round((nodeStatus.disk || 0) / nodeStatus.maxdisk * 100) : 0"
                        :color="getProgressColor(nodeStatus.maxdisk ? Math.round((nodeStatus.disk || 0) / nodeStatus.maxdisk * 100) : 0)"
                        :stroke-width="8"
                      />
                    </div>
                  </div>
                </div>

                <div class="resource-column">
                  <!-- IO delay -->
                  <div v-if="nodeStatus.iowait !== undefined" class="resource-item">
                    <div class="resource-label">
                      {{ t('pve.node.ioDelay') }}：
                    </div>
                    <div class="resource-content">
                      <span class="resource-text">
                        {{ (nodeStatus.iowait || 0).toFixed(2) }}%
                      </span>
                    </div>
                  </div>

                  <!-- KSM sharing -->
                  <div v-if="nodeStatus.ksm && typeof nodeStatus.ksm === 'object' && nodeStatus.ksm.shared !== undefined" class="resource-item">
                    <div class="resource-label">
                      {{ t('pve.node.ksmSharing') }}：
                    </div>
                    <div class="resource-content">
                      <span class="resource-text">
                        {{ formatBytes(nodeStatus.ksm.shared || 0) }}
                      </span>
                    </div>
                  </div>

                  <!-- SWAP usage -->
                  <div v-if="nodeStatus.swap && typeof nodeStatus.swap === 'object' && nodeStatus.swap.total" class="resource-item">
                    <div class="resource-header">
                      <span class="resource-label">{{ t('pve.node.swapUsage') }}：</span>
                      <span class="resource-text">
                        {{ nodeStatus.swap.total ? Math.round((nodeStatus.swap.used / nodeStatus.swap.total) * 100) : 0 }}%
                        ({{ formatBytes(nodeStatus.swap.used || 0) }} {{ t('pve.node.of') }} {{ formatBytes(nodeStatus.swap.total || 0) }})
                      </span>
                    </div>
                    <div class="resource-progress">
                      <span class="progress-label">{{ t('pve.node.usage') }}</span>
                      <el-progress
                        :percentage="nodeStatus.swap.total ? Math.round((nodeStatus.swap.used / nodeStatus.swap.total) * 100) : 0"
                        :color="getProgressColor(nodeStatus.swap.total ? Math.round((nodeStatus.swap.used / nodeStatus.swap.total) * 100) : 0)"
                        :stroke-width="8"
                      />
                    </div>
                  </div>
                </div>
              </div>
              <el-empty v-else :description="t('pve.node.noResourceUsage')" />
            </el-card>

            <!-- 系统信息 -->
            <el-card shadow="never" class="overview-card">
              <template #header>
                <div class="card-title">{{ t('pve.node.systemInfo') }}</div>
              </template>
              <div v-if="nodeStatus" class="info-grid">
                <div class="info-item full-width">
                  <span class="info-label">{{ t('pve.node.cpus') }}：</span>
                  <span class="info-value">{{ formatCpuInfo(nodeStatus) }}</span>
                </div>
                <div v-if="nodeStatus.kversion" class="info-item full-width">
                  <span class="info-label">{{ t('pve.node.kernelVersion') }}：</span>
                  <span class="info-value">{{ nodeStatus.kversion || '-' }}</span>
                </div>
                <div v-if="nodeStatus.bootmode" class="info-item">
                  <span class="info-label">{{ t('pve.node.bootMode') }}：</span>
                  <span class="info-value">{{ nodeStatus.bootmode || '-' }}</span>
                </div>
                <div v-if="nodeStatus.pveversion" class="info-item">
                  <span class="info-label">{{ t('pve.node.pveVersion') }}：</span>
                  <span class="info-value">{{ nodeStatus.pveversion || '-' }}</span>
                </div>
                <div v-if="nodeStatus.uptime" class="info-item">
                  <span class="info-label">{{ t('pve.node.uptime') }}：</span>
                  <span class="info-value">{{ formatUptime(nodeStatus.uptime) }}</span>
                </div>
                <div v-if="nodeStatus.repo_status !== undefined" class="info-item full-width">
                  <span class="info-label">{{ t('pve.node.repositoryStatus') }}：</span>
                  <span class="info-value">
                    <el-tag :type="nodeStatus.repo_status === 'ok' ? 'success' : 'warning'">
                      {{ nodeStatus.repo_status === 'ok' ? 'OK' : (nodeStatus.repo_status || 'Unknown') }}
                    </el-tag>
                  </span>
                </div>
              </div>
              <el-empty v-else :description="t('pve.node.noSystemInfo')" />
            </el-card>

            <!-- 监控图表 -->
            <el-card shadow="never" class="overview-card">
              <template #header>
                <div class="card-title">{{ t('pve.node.monitoring') }}</div>
              </template>
              <div v-loading="rrdLoading" class="charts-wrapper">
                <div class="chart-item">
                  <div ref="cpuChartRef" class="chart-container"></div>
                </div>
                <div class="chart-item">
                  <div ref="memoryChartRef" class="chart-container"></div>
                </div>
                <div class="chart-item">
                  <div ref="networkChartRef" class="chart-container"></div>
                </div>
              </div>
            </el-card>
          </div>
        </el-tab-pane>

        <!-- 系统服务 -->
        <el-tab-pane :label="t('pve.node.services')" name="services">
          <div v-loading="servicesLoading" class="services-wrapper">
            <el-table
              :data="nodeServices"
              border
              stripe
              style="width: 100%"
            >
              <el-table-column prop="name" :label="t('pve.node.serviceName')" min-width="200">
                <template #default="{ row }">
                  {{ row.name || row.service_name || '-' }}
                </template>
              </el-table-column>
              <el-table-column prop="state" :label="t('pve.common.status')" width="120">
                <template #default="{ row }">
                  <el-tag :type="row.state === 'running' ? 'success' : 'danger'">
                    {{ row.state === 'running' ? t('pve.node.serviceRunning') : (row.state === 'stopped' ? t('pve.node.serviceStopped') : row.state || '-') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column prop="description" :label="t('pve.common.description')" min-width="300">
                <template #default="{ row }">
                  {{ row.description || '-' }}
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.common.operate')" width="200" fixed="right">
                <template #default="{ row }">
                  <el-button
                    v-if="row.state !== 'running'"
                    type="primary"
                    link
                    size="small"
                    @click="handleStartService(row)"
                  >
                    {{ t('pve.node.serviceStart') }}
                  </el-button>
                  <el-button
                    v-else
                    type="danger"
                    link
                    size="small"
                    @click="handleStopService(row)"
                  >
                    {{ t('pve.node.serviceStop') }}
                  </el-button>
                  <el-button
                    type="warning"
                    link
                    size="small"
                    @click="handleRestartService(row)"
                  >
                    {{ t('pve.node.serviceRestart') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="nodeServices.length === 0" class="services-empty">
              <el-empty :description="t('pve.node.noServiceInfo')" />
            </div>
          </div>
        </el-tab-pane>

        <!-- 磁盘 -->
        <el-tab-pane :label="t('pve.node.disks')" name="disks">
          <div class="disks-wrapper">
            <div class="disks-layout">
              <!-- 左侧导航栏 -->
              <div class="disks-sidebar">
                <div class="sidebar-title">Disks</div>
                <el-menu
                  :default-active="activeMenuIndex"
                  class="disks-menu"
                  @select="handleStorageTypeChange"
                >
                  <el-menu-item index="lvm">
                    <span>LVM</span>
                  </el-menu-item>
                  <el-menu-item index="lvmthin">
                    <span>LVM-Thin</span>
                  </el-menu-item>
                  <el-menu-item index="directory">
                    <span>Directory</span>
                  </el-menu-item>
                  <el-menu-item index="zfs">
                    <span>ZFS</span>
                  </el-menu-item>
                </el-menu>
              </div>

              <!-- 右侧主内容区 -->
              <div class="disks-content">
                <!-- 页面标题 -->
                <div class="disks-header">
                  <h3 class="disks-title">Node '{{ nodeBasicInfo?.node_name || "" }}'</h3>
                </div>

                <!-- 操作按钮区域 -->
                <div class="disks-actions">
                  <div class="actions-row">
                    <el-button size="small" @click="loadDisks">Reload</el-button>
                    <el-button
                      type="primary"
                      size="small"
                      :disabled="selectedDisks.length === 0 || selectedStorageType !== 'list'"
                      @click="handleInitGptClick"
                    >
                      Initialize Disk with GPT
                    </el-button>
                    <el-button
                      type="danger"
                      size="small"
                      :disabled="selectedDisks.length === 0 || selectedStorageType !== 'list'"
                      @click="handleWipeDiskClick"
                    >
                      Wipe Disk
                    </el-button>
                  </div>
                </div>

                <!-- 磁盘列表表格 -->
                <div class="disks-table">
                  <!-- List 类型表格 -->
                  <el-table
                    v-if="selectedStorageType === 'list'"
                    v-loading="disksLoading"
                    :data="disksList"
                    border
                    stripe
                    style="width: 100%"
                    @selection-change="(rows: any[]) => selectedDisks = rows"
                  >
                    <el-table-column type="selection" width="55" />
                    <el-table-column
                      type="expand"
                      width="50"
                      :reserve-selection="true"
                    >
                      <template #default="{ row }">
                        <div v-if="row.children && row.children.length > 0" class="partition-list">
                          <el-table :data="row.children" border style="width: 100%">
                            <el-table-column prop="devpath" label="Device" min-width="120" />
                            <el-table-column prop="type" label="Type" width="100" />
                            <el-table-column prop="used" label="Usage" width="120" />
                            <el-table-column label="Size" width="120">
                              <template #default="{ row: child }">
                                {{ formatDiskSize(child.size) }}
                              </template>
                            </el-table-column>
                            <el-table-column label="GPT" width="80">
                              <template #default="{ row: child }">
                                <el-tag v-if="child.gpt === 1 || child.gpt === true || child.gpt === 'Yes'" type="success" size="small">Yes</el-tag>
                                <span v-else>-</span>
                              </template>
                            </el-table-column>
                          </el-table>
                        </div>
                        <div v-else class="partition-list">
                          <el-empty description="无分区信息" :image-size="80" />
                        </div>
                      </template>
                    </el-table-column>
                    <el-table-column prop="devpath" label="Device" min-width="120" />
                    <el-table-column prop="type" label="Type" width="100" />
                    <el-table-column prop="used" label="Usage" width="120" />
                    <el-table-column label="Size" width="120">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.size) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="GPT" width="80">
                      <template #default="{ row }">
                        <el-tag v-if="row.gpt === 1 || row.gpt === true || row.gpt === 'Yes'" type="success" size="small">Yes</el-tag>
                        <span v-else>-</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="model" label="Model" min-width="150" />
                    <el-table-column prop="serial" label="Serial" min-width="150" />
                    <el-table-column prop="health" label="S.M.A.R.T." width="100">
                      <template #default="{ row }">
                        <el-tag v-if="row.health === 'OK'" type="success" size="small">{{ row.health }}</el-tag>
                        <span v-else>{{ row.health || '-' }}</span>
                      </template>
                    </el-table-column>
                    <el-table-column prop="vendor" label="Vendor" min-width="120" />
                    <el-table-column prop="wwn" label="WWN" min-width="150" />
                  </el-table>

                  <!-- Directory 类型表格 -->
                  <el-table
                    v-else-if="selectedStorageType === 'directory'"
                    v-loading="disksLoading"
                    :data="disksList"
                    border
                    stripe
                    style="width: 100%"
                    @selection-change="(rows: any[]) => selectedDisks = rows"
                  >
                    <el-table-column type="selection" width="55" />
                    <el-table-column prop="device" label="Device" min-width="200" />
                    <el-table-column prop="path" label="Path" min-width="200" />
                    <el-table-column prop="type" label="Type" width="100" />
                    <el-table-column prop="options" label="Options" min-width="150" />
                    <el-table-column prop="unitfile" label="Unit File" min-width="250" />
                  </el-table>

                  <!-- LVM 类型表格 -->
                  <el-table
                    v-else-if="selectedStorageType === 'lvm'"
                    v-loading="disksLoading"
                    :data="disksList"
                    border
                    stripe
                    style="width: 100%"
                    @selection-change="(rows: any[]) => selectedDisks = rows"
                  >
                    <el-table-column type="selection" width="55" />
                    <el-table-column prop="name" label="Name" min-width="150" />
                    <el-table-column prop="vg_name" label="VG Name" min-width="120" />
                    <el-table-column label="Size" width="120">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.size) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="Free" width="120" v-if="disksList.some((item: any) => item.free !== undefined)">
                      <template #default="{ row }">
                        {{ row.free !== undefined ? formatDiskSize(row.free) : '-' }}
                      </template>
                    </el-table-column>
                    <el-table-column label="Leaf" width="80" v-if="disksList.some((item: any) => item.leaf !== undefined)">
                      <template #default="{ row }">
                        <el-tag v-if="row.leaf !== undefined" :type="row.leaf === 1 ? 'success' : 'info'" size="small">
                          {{ row.leaf === 1 ? 'Yes' : 'No' }}
                        </el-tag>
                        <span v-else>-</span>
                      </template>
                    </el-table-column>
                    <el-table-column label="LV Count" width="100" v-if="disksList.some((item: any) => item.lvcount !== undefined)">
                      <template #default="{ row }">
                        {{ row.lvcount !== undefined ? row.lvcount : '-' }}
                      </template>
                    </el-table-column>
                  </el-table>

                  <!-- LVM-Thin 类型表格 -->
                  <el-table
                    v-else-if="selectedStorageType === 'lvmthin'"
                    v-loading="disksLoading"
                    :data="disksList"
                    border
                    stripe
                    style="width: 100%"
                    @selection-change="(rows: any[]) => selectedDisks = rows"
                  >
                    <el-table-column type="selection" width="55" />
                    <el-table-column prop="lv" label="LV" min-width="120" />
                    <el-table-column prop="vg" label="VG" min-width="120" />
                    <el-table-column label="LV Size" width="120">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.lv_size) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="Used" width="120">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.used) }}
                      </template>
                    </el-table-column>
                    <el-table-column prop="lv_state" label="State" width="80">
                      <template #default="{ row }">
                        <el-tag :type="row.lv_state === 'a' ? 'success' : 'warning'" size="small">
                          {{ row.lv_state === 'a' ? 'Active' : row.lv_state }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column prop="lv_type" label="Type" width="80">
                      <template #default="{ row }">
                        <el-tag :type="row.lv_type === 't' ? 'primary' : 'info'" size="small">
                          {{ row.lv_type === 't' ? 'Thin' : row.lv_type }}
                        </el-tag>
                      </template>
                    </el-table-column>
                    <el-table-column label="Metadata Size" width="130">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.metadata_size) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="Metadata Used" width="130">
                      <template #default="{ row }">
                        {{ formatDiskSize(row.metadata_used) }}
                      </template>
                    </el-table-column>
                    <el-table-column label="Created" width="150">
                      <template #default="{ row }">
                        {{ row.ctime ? new Date(parseInt(row.ctime) * 1000).toLocaleString() : '-' }}
                      </template>
                    </el-table-column>
                  </el-table>

                  <!-- ZFS 类型表格（暂时显示所有字段） -->
                  <el-table
                    v-else-if="selectedStorageType === 'zfs'"
                    v-loading="disksLoading"
                    :data="disksList"
                    border
                    stripe
                    style="width: 100%"
                    @selection-change="(rows: any[]) => selectedDisks = rows"
                  >
                    <el-table-column type="selection" width="55" />
                    <template v-if="disksList.length > 0">
                      <el-table-column
                        v-for="(value, key) in disksList[0]"
                        :key="String(key)"
                        :prop="String(key)"
                        :label="String(key)"
                        min-width="150"
                      >
                        <template #default="{ row }">
                          <template v-if="typeof row[key] === 'number' && (String(key).includes('size') || String(key).includes('Size') || String(key).includes('used') || String(key).includes('Used') || String(key).includes('free') || String(key).includes('Free'))">
                            {{ formatDiskSize(row[key]) }}
                          </template>
                          <template v-else>
                            {{ row[key] }}
                          </template>
                        </template>
                      </el-table-column>
                    </template>
                    <template v-else>
                      <el-table-column label="暂无数据" />
                    </template>
                  </el-table>
                </div>
              </div>
            </div>
          </div>

          <!-- 初始化 GPT 对话框 -->
          <el-dialog
            v-model="initGptDialogVisible"
            title="Initialize Disk with GPT"
            width="500px"
          >
            <div class="dialog-content">
              <p>确定要初始化磁盘 <strong>{{ currentDisk?.devpath || currentDisk?.device }}</strong> 为 GPT 格式吗？</p>
              <p class="warning-text">此操作将清除磁盘上的所有数据，请谨慎操作！</p>
            </div>
            <template #footer>
              <el-button @click="initGptDialogVisible = false">取消</el-button>
              <el-button type="primary" :loading="initGptLoading" @click="handleInitGpt">确定</el-button>
            </template>
          </el-dialog>

          <!-- 擦除磁盘对话框 -->
          <el-dialog
            v-model="wipeDiskDialogVisible"
            title="Wipe Disk"
            width="500px"
          >
            <div class="dialog-content">
              <p>确定要擦除磁盘 <strong>{{ currentDisk?.devpath || currentDisk?.device }}</strong> 吗？</p>
              <p class="warning-text">此操作将永久删除磁盘上的所有数据，请谨慎操作！</p>
            </div>
            <template #footer>
              <el-button @click="wipeDiskDialogVisible = false">取消</el-button>
              <el-button type="danger" :loading="wipeDiskLoading" @click="handleWipeDisk">确定</el-button>
            </template>
          </el-dialog>
        </el-tab-pane>

        <!-- 网络配置 -->
        <el-tab-pane :label="t('pve.node.network')" name="network">
          <div v-loading="networksLoading" class="network-wrapper">
            <!-- 操作按钮 -->
            <div class="network-actions">
              <el-button type="primary" @click="handleCreateNetwork">
                {{ t('pve.common.create') }}
              </el-button>
              <el-button @click="handleRevertNetwork">
                {{ t('pve.node.networkRevert') }}
              </el-button>
              <el-button @click="handleReloadNetwork">
                {{ t('pve.node.networkReload') }}
              </el-button>
            </div>

            <!-- 网络列表表格 -->
            <el-table
              :data="networksList"
              border
              stripe
              style="width: 100%; margin-top: 16px"
            >
              <el-table-column prop="iface" :label="t('pve.node.networkName')" min-width="150" />
              <el-table-column :label="t('pve.node.networkType')" width="120">
                <template #default="{ row }">
                  {{ formatNetworkType(row.type) }}
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.node.networkActive')" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.active ? 'success' : 'info'">
                    {{ row.active ? t('pve.common.yes') : t('pve.common.no') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.node.networkAutostart')" width="100">
                <template #default="{ row }">
                  <el-tag :type="row.autostart ? 'success' : 'info'">
                    {{ row.autostart ? t('pve.common.yes') : t('pve.common.no') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.node.networkVlanAware')" width="120">
                <template #default="{ row }">
                  <el-tag :type="row.vlan_aware ? 'success' : 'info'">
                    {{ row.vlan_aware ? t('pve.common.yes') : t('pve.common.no') }}
                  </el-tag>
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.node.networkPorts')" min-width="200">
                <template #default="{ row }">
                  {{ row.bridge_ports || row.bond_slaves || '-' }}
                </template>
              </el-table-column>
              <el-table-column :label="t('pve.node.networkBondMode')" width="150">
                <template #default="{ row }">
                  {{ formatBondMode(row.bond_mode) }}
                </template>
              </el-table-column>
              <el-table-column prop="address" :label="t('pve.node.networkCidr')" min-width="150" />
              <el-table-column prop="gateway" :label="t('pve.node.networkGateway')" width="120" />
              <el-table-column prop="comment" :label="t('pve.node.networkComment')" min-width="150" />
              <el-table-column :label="t('pve.common.operate')" width="150" fixed="right">
                <template #default="{ row }">
                  <el-button type="primary" link size="small" @click="handleEditNetwork(row)">
                    {{ t('pve.common.edit') }}
                  </el-button>
                  <el-button type="danger" link size="small" @click="handleDeleteNetwork(row)">
                    {{ t('pve.common.remove') }}
                  </el-button>
                </template>
              </el-table-column>
            </el-table>
            <div v-if="networksList.length === 0" class="network-empty">
              <el-empty :description="t('pve.node.noNetworkInfo')" />
            </div>
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-drawer>

    <!-- 网络配置对话框 -->
    <el-dialog
      v-model="networkDialogVisible"
      :title="`${networkDialogMode === 'create' ? t('pve.node.networkCreate') : t('pve.node.networkEdit')}: ${formatNetworkType(networkForm.type)}`"
      width="800px"
      :close-on-click-modal="false"
    >
      <el-form
        ref="networkFormRef"
        :model="networkForm"
        label-width="140px"
        :rules="networkFormRules"
        class="network-form"
      >
        <div class="network-form-columns">
          <!-- 左列 -->
          <div class="network-form-left">
            <el-form-item :label="t('pve.node.networkName')" prop="iface">
              <el-input
                v-model="networkForm.iface"
                :placeholder="t('pve.node.networkNamePlaceholder')"
                :disabled="networkDialogMode === 'edit'"
              />
            </el-form-item>
            <el-form-item v-if="networkDialogMode === 'create'" :label="t('pve.node.networkType')" prop="type">
              <el-select v-model="networkForm.type" style="width: 100%">
                <el-option :label="t('pve.node.networkTypeBridge')" value="bridge" />
                <el-option :label="t('pve.node.networkTypeBond')" value="bond" />
                <el-option :label="t('pve.node.networkTypeEth')" value="eth" />
                <el-option :label="t('pve.node.networkTypeVlan')" value="vlan" />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('pve.node.networkIpv4Cidr')">
              <el-input
                v-model="networkForm.address"
                :placeholder="t('pve.node.networkIpv4CidrPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('pve.node.networkGatewayIpv4')">
              <el-input
                v-model="networkForm.gateway"
                :placeholder="t('pve.node.networkGatewayIpv4Placeholder')"
              />
            </el-form-item>
            <el-form-item :label="t('pve.node.networkIpv6Cidr')">
              <el-input
                v-model="networkForm.address6"
                :placeholder="t('pve.node.networkIpv6CidrPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('pve.node.networkGatewayIpv6')">
              <el-input
                v-model="networkForm.gateway6"
                :placeholder="t('pve.node.networkGatewayIpv6Placeholder')"
              />
            </el-form-item>
            <el-divider />
            <el-form-item :label="t('pve.node.networkMtu')">
              <el-input-number
                v-model="networkForm.mtu"
                :min="68"
                :max="9000"
                :step="1"
                style="width: 100%"
              />
            </el-form-item>
          </div>

          <!-- 右列 -->
          <div class="network-form-right">
            <el-form-item :label="t('pve.node.networkAutostart')">
              <el-checkbox v-model="networkForm.autostart" :true-label="1" :false-label="0" />
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bridge'"
              :label="t('pve.node.networkVlanAware')"
            >
              <el-checkbox v-model="networkForm.vlan_aware" :true-label="1" :false-label="0" />
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bridge'"
              :label="t('pve.node.networkBridgePorts')"
              prop="bridge_ports"
            >
              <el-input
                v-model="networkForm.bridge_ports"
                :placeholder="t('pve.node.networkBridgePortsPlaceholder')"
              />
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bridge'"
              :label="t('pve.node.networkVlanIds')"
            >
              <el-input
                v-model="networkForm.vlan_ids"
                :placeholder="t('pve.node.networkVlanIdsPlaceholder')"
              />
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bond'"
              :label="t('pve.node.networkBondSlaves')"
              prop="bond_slaves"
            >
              <el-input
                v-model="networkForm.bond_slaves"
                :placeholder="t('pve.node.networkBondSlavesPlaceholder')"
              />
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bond'"
              :label="t('pve.node.networkBondMode')"
              prop="bond_mode"
            >
              <el-select v-model="networkForm.bond_mode" style="width: 100%">
                <el-option label="LACP (802.3ad)" value="802.3ad" />
                <el-option label="Round-robin" value="balance-rr" />
                <el-option label="Active-backup" value="active-backup" />
                <el-option label="XOR" value="balance-xor" />
                <el-option label="Broadcast" value="broadcast" />
                <el-option label="Adaptive transmit load balancing" value="balance-tlb" />
                <el-option label="Adaptive load balancing" value="balance-alb" />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bond'"
              :label="t('pve.node.networkBondHashPolicy')"
            >
              <el-select v-model="networkForm.bond_hash_policy" style="width: 100%">
                <el-option label="layer2" value="layer2" />
                <el-option label="layer2+3" value="layer2+3" />
                <el-option label="layer3+4" value="layer3+4" />
              </el-select>
            </el-form-item>
            <el-form-item
              v-if="networkForm.type === 'bond'"
              :label="t('pve.node.networkBondPrimary')"
            >
              <el-input
                v-model="networkForm.bond_primary"
                :placeholder="t('pve.node.networkBondPrimaryPlaceholder')"
              />
            </el-form-item>
            <el-form-item :label="t('pve.node.networkComment')">
              <el-input
                v-model="networkForm.comment"
                :placeholder="t('pve.node.networkCommentPlaceholder')"
              />
            </el-form-item>
          </div>
        </div>
      </el-form>
      <template #footer>
        <el-button @click="networkDialogVisible = false">{{ t('pve.common.cancel') }}</el-button>
        <el-button type="primary" :loading="networkDialogLoading" @click="handleSaveNetwork">
          {{ t('pve.common.save') }}
        </el-button>
      </template>
    </el-dialog>

    <!-- Node Console Dialog -->
    <NodeConsoleDialog
      v-model="consoleDialogVisible"
      :node-id="consoleNodeId || 0"
      :node-name="consoleNodeName"
      :cluster-id="consoleClusterId || 0"
    />
  </div>
</template>

<style scoped>
.pve-page {
  padding: 12px;
}

.node-table :deep(.el-table__row) {
  cursor: pointer;
}

.node-table :deep(.el-table__row:hover) {
  background-color: var(--el-table-row-hover-bg-color);
}

.overview-wrapper {
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
  flex-direction: column;
  gap: 4px;
}

.info-item.full-width {
  grid-column: 1 / -1;
}

.info-label {
  font-weight: 500;
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.info-value {
  color: var(--el-text-color-primary);
  font-size: 14px;
  word-break: break-all;
}

.resource-usage {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.resource-column {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.resource-item {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.resource-header {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.resource-label {
  font-weight: 500;
  color: var(--el-text-color-primary);
  font-size: 14px;
  white-space: nowrap;
}

.resource-text {
  color: var(--el-text-color-regular);
  font-size: 13px;
  line-height: 1.5;
}

.resource-progress {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.progress-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 400;
}

.resource-content {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.services-wrapper {
  padding: 12px 0;
}

.services-empty {
  margin-top: 20px;
}

.network-wrapper {
  padding: 12px 0;
}

.network-actions {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}

.network-empty {
  margin-top: 20px;
}

.network-form {
  padding: 0;
}

.network-form-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.network-form-left,
.network-form-right {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.network-form-left :deep(.el-form-item),
.network-form-right :deep(.el-form-item) {
  margin-bottom: 18px;
}

.network-form-left :deep(.el-divider) {
  margin: 12px 0;
}

.disks-wrapper {
  padding: 12px 0;
  height: calc(100vh - 200px);
  overflow: hidden;
}

.disks-layout {
  display: flex;
  height: 100%;
  gap: 0;
}

.disks-sidebar {
  width: 200px;
  border-right: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color);
  overflow-y: auto;
}

.sidebar-title {
  padding: 16px;
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
  border-bottom: 1px solid var(--el-border-color);
}

.disks-menu {
  border: none;
  background-color: transparent;
}

.disks-menu :deep(.el-menu-item) {
  height: 40px;
  line-height: 40px;
  padding-left: 20px !important;
}

.disks-menu :deep(.el-menu-item.is-active) {
  background-color: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}

.disks-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 0 16px;
}

.disks-header {
  padding: 16px 0;
  border-bottom: 1px solid var(--el-border-color);
}

.disks-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.disks-actions {
  padding: 16px 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  border-bottom: 1px solid var(--el-border-color);
}

.actions-row {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.disks-table {
  flex: 1;
  overflow: auto;
  margin-top: 16px;
}

.partition-list {
  padding: 12px;
  background-color: var(--el-bg-color-page);
}

.dialog-content {
  padding: 16px 0;
}

.dialog-content p {
  margin: 8px 0;
  line-height: 1.6;
}

.warning-text {
  color: var(--el-color-danger);
  font-size: 13px;
}

.charts-wrapper {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 12px 0;
}

.chart-item {
  width: 100%;
}

.chart-container {
  width: 100%;
  height: 300px;
}
</style>



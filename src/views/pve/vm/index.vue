<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick, onUnmounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { useI18n } from "vue-i18n";
import RefreshIcon from "~icons/ep/refresh";
import ArrowDownIcon from "~icons/ep/arrow-down";
import * as echarts from "echarts";
import dayjs from "dayjs";

const { t } = useI18n();
import {
  fetchVms,
  fetchVmDetail,
  fetchClusters,
  fetchNodes,
  createVm,
  fetchVmStatus,
  startVm,
  stopVm,
  createVmConsole,
  deleteVm,
  fetchVmCurrentConfig,
  fetchVmPendingConfig,
  updateVmConfig,
  fetchVmBasicInfo,
  fetchVmRrd,
  migrateVm,
  fetchStorages,
  fetchNodeStorageContent,
  createVmBackup,
  deleteVmBackup,
  fetchCloudinitConfig,
  updateCloudinitConfig,
  fetchNodeStatus,
  type Vm,
  type Cluster,
  type Node,
  type VmConfigItem,
  type VmStatus,
  type VmRrdData,
  type VmMigratePayload,
  type Storage,
  type StorageContentItem,
  type VmBackupPayload
} from "@/api/pve";
import CreateVmDialog from "./components/CreateVmDialog.vue";
import CreateVmWizard from "./components/CreateVmWizard.vue";
import VmConsoleDialog from "./components/VmConsoleDialog.vue";

const loading = ref(false);
const allVms = ref<Vm[]>([]);
const currentPage = ref(1);
const pageSize = ref(10);
const total = ref(0);

// 查询条件
const selectedClusterId = ref<number | null>(null);
const selectedNodeName = ref<string | null>(null);
const hostnameKeyword = ref("");
const ipKeyword = ref("");

// 关联数据：集群 & 节点
const clusters = ref<Cluster[]>([]);
const allNodes = ref<Node[]>([]);
const filteredNodes = computed(() => {
  if (!selectedClusterId.value) return allNodes.value;
  return allNodes.value.filter(
    n => n.cluster_id === selectedClusterId.value
  );
});

const detailVisible = ref(false);
const detailLoading = ref(false);
const detailData = ref<Vm | null>(null);
const detailActiveTab = ref("info");

// 备份相关
const backupVisible = ref(false);
const backupLoading = ref(false);
const backupForm = ref({
  storage: "",
  compress: "zst" as "zst" | "gz" | "lzo" | "none",
  mode: "snapshot" as "snapshot" | "suspend" | "stop",
  maxfiles: 5
});
const backupStorages = ref<Storage[]>([]);
const backupList = ref<StorageContentItem[]>([]);
const backupListLoading = ref(false);

// 配置相关
const configVisible = ref(false);
const migrateVisible = ref(false);
const migrateLoading = ref(false);
const configLoading = ref(false);
const currentConfig = ref<Record<string, any>>({});
const configDigest = ref<string | undefined>(undefined); // 配置摘要，用于防止并发修改冲突
const pendingConfigList = ref<Array<{ key: string; value: any; pending?: any }>>([]);
const configItems = ref<VmConfigItem[]>([]);
const cloudinitConfigItems = ref<VmConfigItem[]>([]);
const optionsConfigItems = ref<VmConfigItem[]>([]);
const selectedVmId = ref<number | null>(null);
const selectedCloudinitRow = ref<VmConfigItem | null>(null);

// Cloud-Init 相关的配置项 key
const cloudinitKeys = ['cipassword', 'ciupgrade', 'ciuser', 'searchdomain', 'nameserver', 'sshkeys'];

// IP 配置相关的 key（ipconfig0, ipconfig1, ...）
const isIpConfigKey = (key: string): boolean => {
  return /^ipconfig\d+$/i.test(key);
};

// 获取 Cloud-Init 配置项的显示名称（别名）
const getCloudinitConfigDisplayName = (key: string): string => {
  const lowerKey = key.toLowerCase();
  if (lowerKey === 'dnsconfig' || lowerKey === 'searchdomain' || lowerKey === 'nameserver') {
    return 'DNS Config';
  } else if (isIpConfigKey(key)) {
    const match = key.match(/^ipconfig(\d+)$/i);
    if (match) {
      return `IP Config (net${match[1]})`;
    }
    return `IP Config (${key})`;
  } else if (lowerKey === 'ciuser') {
    return 'User';
  } else if (lowerKey === 'cipassword') {
    return 'Password';
  } else if (lowerKey === 'ciupgrade') {
    return 'Upgrade packages';
  } else if (lowerKey === 'sshkeys') {
    return 'SSH Public Key';
  }
  return key;
};

// 检查是否有 CloudInit 设备
const hasCloudinitDevice = computed(() => {
  if (!currentConfig.value) return false;
  // 检查 ide0, ide1, ide2, ide3 等设备
  // 判断条件：
  // 1. 包含 media=cloudinit
  // 2. 或者路径包含 cloudinit 关键字（如：vm-50988875-cloudinit.qcow2）
  for (let i = 0; i < 4; i++) {
    const ideKey = `ide${i}`;
    const ideValue = currentConfig.value[ideKey];
    if (ideValue && typeof ideValue === 'string') {
      const lowerValue = ideValue.toLowerCase();
      // 检查是否包含 media=cloudinit
      if (lowerValue.includes('media=cloudinit')) {
        return true;
      }
      // 检查路径是否包含 cloudinit 关键字
      if (lowerValue.includes('cloudinit')) {
        return true;
      }
    }
  }
  return false;
});

// Cloud-Init 默认配置（仅前端显示）
const cloudinitDefaultConfigs = [
  { key: 'ciuser', value: 'root', label: 'User' },
  { key: 'cipassword', value: '', label: 'Password' },
  { key: 'ciupgrade', value: '1', label: 'Upgrade packages' }
];

// 判断是否为硬件配置项
const isHardwareKey = (key: string): boolean => {
  const lowerKey = key.toLowerCase();
  
  // 硬件相关配置项模式
  const hardwarePatterns = [
    // Memory
    /^memory$/i,
    /^mem$/i,
    /^maxmem$/i,
    // Processors
    /^cores?$/i,
    /^sockets?$/i,
    /^cpu$/i,
    // BIOS
    /^bios$/i,
    // Display
    /^display$/i,
    /^vga$/i,
    // Machine
    /^machine$/i,
    // SCSI Controller
    /^scsi$/i,
    /^scsihw$/i,
    // IDE drives (CloudInit Drive)
    /^ide\d+$/i,
    // Hard Disk (SCSI)
    /^scsi\d+$/i,
    // Network Device
    /^net\d+$/i
  ];
  
  // 检查是否匹配任何硬件配置项模式
  return hardwarePatterns.some(pattern => pattern.test(lowerKey));
};
const editDialogVisible = ref(false);
const editForm = ref({
  key: "",
  value: ""
});
const configActiveTab = ref("overview");

// 备份相关（在配置抽屉中）
const backupTabStorages = ref<Storage[]>([]);
const backupTabList = ref<StorageContentItem[]>([]);
const backupTabListLoading = ref(false);
const backupTabForm = ref({
  storage: "",
  compress: "zst" as "zst" | "gz" | "lzo" | "none",
  mode: "snapshot" as "snapshot" | "suspend" | "stop",
  maxfiles: 5
});
const backupTabVisible = ref(false);
const backupTabLoading = ref(false);

// IP 配置对话框
const ipConfigVisible = ref(false);
const ipConfigLoading = ref(false);
const ipConfigForm = ref({
  key: '', // ipconfig0, ipconfig1, etc
  device: 'net0', // 网络设备名称
  ipv4_mode: 'static' as 'static' | 'dhcp',
  ipv4_address: '',
  ipv4_gateway: '',
  ipv6_mode: 'static' as 'static' | 'dhcp' | 'slaac',
  ipv6_address: '',
  ipv6_gateway: ''
});

// DNS 配置对话框
const dnsConfigVisible = ref(false);
const dnsConfigLoading = ref(false);
const dnsConfigForm = ref({
  searchdomain: '', // DNS domain
  nameserver: '' // DNS servers
});

// SSH Key 配置对话框
const sshKeyConfigVisible = ref(false);
const sshKeyConfigLoading = ref(false);
const sshKeyConfigForm = ref({
  sshkeys: '' // SSH public keys
});

// Upgrade packages 配置对话框
const upgradeConfigVisible = ref(false);
const upgradeConfigLoading = ref(false);
const upgradeConfigForm = ref({
  ciupgrade: false // Upgrade packages on boot
});

// 概览相关
const overviewLoading = ref(false);
const vmBasicInfo = ref<Vm | null>(null);
const vmStatus = ref<VmStatus | null>(null);
const rrdLoading = ref(false);
const vmRrdData = ref<VmRrdData | null>(null);
const vmRrdHint = ref<string>(""); // 新建 VM 监控未就绪时的提示文案

// 图表实例
const vmCpuChartRef = ref<HTMLDivElement | null>(null);
const vmMemoryChartRef = ref<HTMLDivElement | null>(null);
const vmNetworkChartRef = ref<HTMLDivElement | null>(null);
const vmDiskChartRef = ref<HTMLDivElement | null>(null);
let vmCpuChartInstance: echarts.ECharts | null = null;
let vmMemoryChartInstance: echarts.ECharts | null = null;
let vmNetworkChartInstance: echarts.ECharts | null = null;
let vmDiskChartInstance: echarts.ECharts | null = null;
let vmRrdRefreshTimer: number | null = null;
let vmRrdRetryTimer: number | null = null;
let vmRrdFailCount = 0;
const resizeVmCharts = () => {
  vmCpuChartInstance?.resize();
  vmMemoryChartInstance?.resize();
  vmNetworkChartInstance?.resize();
  vmDiskChartInstance?.resize();
};

const stopVmRrdRetry = () => {
  if (vmRrdRetryTimer) {
    clearTimeout(vmRrdRetryTimer);
    vmRrdRetryTimer = null;
  }
};

const scheduleVmRrdRetry = (ms = 3000) => {
  if (vmRrdRetryTimer) return;
  vmRrdRetryTimer = window.setTimeout(() => {
    vmRrdRetryTimer = null;
    if (configVisible.value && configActiveTab.value === "overview" && selectedVmId.value) {
      loadVmRrd();
    }
  }, ms);
};

// 配置项图标映射
const getConfigIcon = (key: string) => {
  const iconMap: Record<string, string> = {
    memory: "mdi:memory",
    cores: "mdi:cpu-64-bit",
    sockets: "mdi:cpu-64-bit",
    cpu: "mdi:cpu-64-bit",
    bios: "mdi:chip",
    display: "mdi:monitor",
    machine: "mdi:settings",
    scsi: "mdi:harddisk",
    ide: "mdi:harddisk",
    net: "mdi:network",
    disk: "mdi:harddisk",
    cloudinit: "mdi:cloud"
  };
  
  const lowerKey = key.toLowerCase();
  for (const [pattern, icon] of Object.entries(iconMap)) {
    if (lowerKey.includes(pattern)) {
      return icon;
    }
  }
  return "mdi:cog";
};

// 创建虚拟机弹窗（新版本）
const createVmDialogVisible = ref(false);

const migrateForm = ref({
  vm_id: null as number | null,
  vm_name: "",
  current_cluster_id: null as number | null,
  current_node_id: null as number | null,
  target_node_id: null as number | null,
  bwlimit: 1000,
  online: true,
  with_local_disks: true
});

// 迁移目标节点状态
const targetNodeStatus = ref<{
  cpu?: number;
  memory?: number;
  memory_total?: number;
  memory_used?: number;
} | null>(null);
const targetNodeStatusLoading = ref(false);

// Console（noVNC）
const consoleVisible = ref(false);
const consoleLoading = ref(false);
const consoleVm = ref<Vm | null>(null);
const consoleWsUrl = ref("");
const consolePassword = ref("");
const consoleGuestRunning = ref<boolean | undefined>(undefined);
const consoleStartLoading = ref(false);

// 硬件编辑专用弹窗状态
const hardwareAction = ref<"add" | "edit">("edit");
const hardwareEditType = ref<"cpu" | "scsi" | "cdrom" | "disk" | "net" | "common">("common");
const hardwareEditVisible = ref(false);
const hardwareLoading = ref(false);
const nodeStorages = ref<Storage[]>([]);
const nodeIsos = ref<StorageContentItem[]>([]);
const selectedConfigRow = ref<VmConfigItem | null>(null);

const cpuForm = ref({
  sockets: 1,
  cores: 1,
  cpu: "kvm64"
});

const scsiForm = ref({
  controller: "virtio-scsi-pci"
});

const cdromForm = ref({
  busType: "ide",
  busIdx: 0,
  device: "", // 最终拼接结果
  media: "iso", // iso, cdrom, none
  storage: "",
  iso: ""
});

const diskForm = ref({
  busType: "scsi",
  busIdx: 0,
  device: "", // 最终拼接结果
  storage: "", // 仅添加时需要
  size: 32,    // 仅添加时需要
  cache: "none",
  discard: false,
  iothread: false,
  ssd: false,
  ro: false,
  backup: true,
  replicate: true,
  aio: "default"
});

const netForm = ref({
  device: "", // net0, net1 etc
  model: "virtio",
  bridge: "vmbr0",
  tag: undefined as number | undefined,
  firewall: false,
  macaddr: "",
  disconnect: false,
  mtu: undefined as number | undefined,
  queues: undefined as number | undefined,
  rate: undefined as number | undefined
});

const buildWsUrl = (wsUrl: string, token?: string) => {
  if (!wsUrl) return "";

  let url = wsUrl;
  if (token && !url.includes("token=")) {
    url += (url.includes("?") ? "&" : "?") + `token=${encodeURIComponent(token)}`;
  }

  // ws_url 可能是相对路径，转为绝对 ws(s)://
  if (url.startsWith("/")) {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    url = `${proto}//${window.location.host}${url}`;
  } else if (!url.startsWith("ws://") && !url.startsWith("wss://")) {
    // 相对路径（不带 /）
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const base = `${proto}//${window.location.host}`;
    // 去掉前导 /
    url = `${base}/${url.replace(/^\/+/, "")}`;
  }

  return url;
};

const openConsoleDialog = async (row: Vm) => {
  if (!row.id) return;
  consoleVm.value = row;
  consoleLoading.value = true;
  consoleWsUrl.value = "";
  consolePassword.value = "";
  consoleGuestRunning.value = undefined;
  consoleVisible.value = true;

  try {
    // 先判断运行状态：关机时不做连接，走“Guest not running”
    try {
      const st = await fetchVmStatus(row.id);
      consoleGuestRunning.value = st?.data?.status === "running";
    } catch {
      consoleGuestRunning.value = undefined;
    }

    if (consoleGuestRunning.value === false) {
      return;
    }

    const res = await createVmConsole({ vm_id: row.id });
    // 兼容：后端可能把 JSON 当成字符串返回（甚至双重 JSON 字符串）
    const safeParse = (v: any) => {
      let cur = v;
      for (let i = 0; i < 3; i++) {
        if (typeof cur !== "string") break;
        const s = cur.trim();
        // 看起来不像 JSON 就不解析
        if (!(s.startsWith("{") || s.startsWith("[") || s.startsWith("\""))) break;
        try {
          cur = JSON.parse(s);
        } catch {
          break;
        }
      }
      return cur;
    };

    const parsedRes: any = safeParse(res);
    // axios 可能直接返回 string/object；且 data 也可能是 string/object
    const level1 = parsedRes?.data ?? parsedRes ?? {};
    const dataObj: any = safeParse(level1?.data ?? level1) ?? {};

    // 允许 ws_url 在不同层级
    const pick = (obj: any, keys: string[]) => {
      for (const k of keys) {
        const v = obj?.[k];
        if (typeof v === "string" && v.trim()) return v.trim();
      }
      return "";
    };

    // 深度查找：兼容 ws_url/ws_token 被嵌套在任意对象内
    const deepPick = (root: any, keys: string[], maxDepth = 6) => {
      const seen = new Set<any>();
      const stack: Array<{ obj: any; depth: number }> = [{ obj: root, depth: 0 }];
      while (stack.length) {
        const { obj, depth } = stack.pop()!;
        if (!obj || typeof obj !== "object") continue;
        if (seen.has(obj)) continue;
        seen.add(obj);

        const direct = pick(obj, keys);
        if (direct) return direct;

        if (depth >= maxDepth) continue;
        for (const val of Object.values(obj)) {
          if (val && typeof val === "object") stack.push({ obj: val, depth: depth + 1 });
        }
      }
      return "";
    };

    const wsUrl =
      deepPick(dataObj, ["ws_url", "wsUrl", "wsURL", "websocket_url", "websocketUrl"]) ||
      deepPick(level1, ["ws_url", "wsUrl", "wsURL", "websocket_url", "websocketUrl"]) ||
      deepPick(parsedRes, ["ws_url", "wsUrl", "wsURL", "websocket_url", "websocketUrl"]);
    const wsToken =
      deepPick(dataObj, ["ws_token", "wsToken", "wsTOKEN", "token"]) ||
      deepPick(level1, ["ws_token", "wsToken", "wsTOKEN", "token"]) ||
      deepPick(parsedRes, ["ws_token", "wsToken", "wsTOKEN", "token"]);
    const ticket =
      pick(dataObj, ["ticket", "vnc_ticket", "vncTicket"]) ||
      pick(level1, ["ticket", "vnc_ticket", "vncTicket"]) ||
      pick(parsedRes, ["ticket", "vnc_ticket", "vncTicket"]);

    // token 可能已经在 ws_url 中（?token=xxx），这种情况不强制要求 ws_token
    const hasTokenInUrl = typeof wsUrl === "string" && wsUrl.includes("token=");
    if (!wsUrl) {
      if (import.meta.env.DEV) {
        // 帮你快速定位后端返回结构
        // eslint-disable-next-line no-console
        console.warn("[console] invalid console payload", {
          res: parsedRes,
          level1Keys: level1 && typeof level1 === "object" ? Object.keys(level1) : typeof level1,
          dataObjKeys: dataObj && typeof dataObj === "object" ? Object.keys(dataObj) : typeof dataObj
        });
      }
      ElMessage.warning("控制台连接信息不完整（缺少 ws_url）");
      return;
    }

    consoleWsUrl.value = buildWsUrl(wsUrl, wsToken);
    // 兼容 Proxmox：ticket 作为 VNC 密码（若后端已屏蔽可为空）
    consolePassword.value = ticket;

    // 如果 ws_url 不带 token 且也没有 ws_token，提前提示但不阻断（方便定位后端问题）
    if (!hasTokenInUrl && !wsToken) {
      ElMessage.warning("ws_url 未包含 token，且未返回 ws_token，可能无法建立 WS 连接");
    }
  } catch (error: any) {
    const msg =
      error?.response?.data?.message ||
      error?.message ||
      "获取控制台连接信息失败";
    ElMessage.warning(msg);
  } finally {
    consoleLoading.value = false;
  }
};

const refreshConsole = async () => {
  if (consoleVm.value) {
    await openConsoleDialog(consoleVm.value);
  }
};

const handleConsoleStartNow = async () => {
  if (!consoleVm.value?.id) return;
  consoleStartLoading.value = true;
  try {
    await startVm(consoleVm.value.id);
    // 等待几秒让 qemu 启动，再刷新 token 并连接
    await new Promise(resolve => setTimeout(resolve, 2500));
    await refreshConsole();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || "开机失败";
    ElMessage.error(msg);
  } finally {
    consoleStartLoading.value = false;
  }
};

const migrateRules = {
  target_node_id: [{ required: true, message: "请选择目标节点", trigger: "change" }]
};

const migrateTargetNodes = computed(() => {
  if (!migrateForm.value.current_cluster_id) return [];
  return allNodes.value.filter(
    n =>
      n.cluster_id === migrateForm.value.current_cluster_id &&
      n.id !== migrateForm.value.current_node_id
  );
});

// 过滤后的虚拟机列表（在前端基于完整数据做筛选）
const filteredVms = computed(() => {
  return allVms.value.filter(vm => {
    // 按集群过滤（优先使用 cluster_id，更准确）
    if (selectedClusterId.value != null && vm.cluster_id !== selectedClusterId.value) {
      return false;
    }

    // 按节点过滤（优先使用 node_name，因为节点下拉选的是 node_name）
    if (selectedNodeName.value && vm.node_name !== selectedNodeName.value) {
      return false;
    }

    // 按主机名模糊查询
    if (
      hostnameKeyword.value &&
      !String(vm.vm_name)
        .toLowerCase()
        .includes(hostnameKeyword.value.toLowerCase())
    ) {
      return false;
    }

    // 按 IP 模糊查询
    if (
      ipKeyword.value &&
      !String(vm.node_ip)
        .toLowerCase()
        .includes(ipKeyword.value.toLowerCase())
    ) {
      return false;
    }

    return true;
  });
});

const pagedData = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  const list = filteredVms.value.slice(start, end);
  total.value = filteredVms.value.length;
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
    // 如果集群或节点加载失败，不阻塞虚拟机列表
    console.warn("加载集群或节点信息失败", error);
  }
};

const handleSearch = async () => {
  loading.value = true;
  try {
    // 后端限制最大 page_size 为 100，这里拉取最大允许的数据量
    // 在前端做筛选 + 分页（如果数据超过100条，筛选可能不完整）
    const res = await fetchVms({
      page: 1,
      page_size: 100
    });
    allVms.value = res?.data?.list ?? [];
    currentPage.value = 1;
  } catch (error) {
    ElMessage.error("获取虚拟机列表失败");
  } finally {
    loading.value = false;
  }
};

const handlePageChange = () => {
  // 前端分页时，只需改变 currentPage，pagedData 会自动重新计算
};

const handlePageSizeChange = () => {
  currentPage.value = 1;
};

const handleShowDetail = async (row: Vm) => {
  detailVisible.value = true;
  detailLoading.value = true;
  detailActiveTab.value = "info";
  try {
    const res = await fetchVmDetail(row.id);
    detailData.value = res;
    // 加载备份存储列表
    await loadBackupStorages(row);
  } catch (error) {
    // @ts-ignore
    detailData.value = (error as any)?.data ?? row;
    ElMessage.warning("获取虚拟机详情失败，已展示基础信息");
  } finally {
    detailLoading.value = false;
  }
};

// 加载备份存储列表（获取虚拟机节点名称+该主机的local存储）
const loadBackupStorages = async (vm: Vm) => {
  if (!vm.node_name) {
    backupStorages.value = [];
    return;
  }
  
  try {
    // 获取该节点的所有存储
    const storageRes = await fetchStorages({ 
      node_name: vm.node_name,
      page_size: 100 
    });
    const allStorages = storageRes?.data?.list ?? [];
    
    // 过滤出支持备份的存储（content 包含 "backup"）
    backupStorages.value = allStorages.filter(s => {
      const content = (s.content || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
      return content.includes("backup");
    });
    
    // 默认选择 local 存储（如果存在且支持 backup），否则选择第一个
    if (backupStorages.value.length > 0 && !backupForm.value.storage) {
      const localStorage = backupStorages.value.find(s => s.storage_name === "local");
      backupForm.value.storage = localStorage ? localStorage.storage_name : backupStorages.value[0].storage_name;
      // 加载备份列表
      await loadBackupList(vm);
    }
  } catch (error) {
    console.warn("加载备份存储列表失败", error);
    backupStorages.value = [];
  }
};

// 加载备份列表
const loadBackupList = async (vm: Vm) => {
  if (!vm.node_name || !backupForm.value.storage) {
    backupList.value = [];
    return;
  }
  
  // 获取节点ID
  const node = allNodes.value.find(n => n.node_name === vm.node_name);
  if (!node) {
    backupList.value = [];
    return;
  }
  
  backupListLoading.value = true;
  try {
    const res = await fetchNodeStorageContent({
      node_id: node.id,
      storage: backupForm.value.storage,
      content: "backup"
    });
    // 过滤出该虚拟机的备份文件（根据vmid）
    const vmBackups = (res?.data || []).filter(item => {
      // 备份文件名格式通常是: vzdump-qemu-{vmid}-*.vma.zst
      const volid = item.volid || "";
      return volid.includes(`-${vm.vmid}-`) || volid.includes(`-qemu-${vm.vmid}-`);
    });
    backupList.value = vmBackups;
  } catch (error) {
    console.warn("加载备份列表失败", error);
    backupList.value = [];
  } finally {
    backupListLoading.value = false;
  }
};

// 打开备份对话框
const handleOpenBackup = () => {
  if (!detailData.value) return;
  backupVisible.value = true;
  // 默认选择 local 存储（如果存在且支持 backup），否则选择第一个
  const localStorage = backupStorages.value.find(s => s.storage_name === "local");
  backupForm.value = {
    storage: localStorage ? localStorage.storage_name : (backupStorages.value[0]?.storage_name || ""),
    compress: "zst",
    mode: "snapshot",
    maxfiles: 5
  };
  // 加载备份列表
  if (detailData.value) {
    loadBackupList(detailData.value);
  }
};

// 创建备份
const handleCreateBackup = async () => {
  if (!detailData.value) return;
  if (!backupForm.value.storage) {
    ElMessage.warning("请选择存储");
    return;
  }
  
  backupLoading.value = true;
  try {
    await createVmBackup({
      vmid: detailData.value.vmid,
      storage: backupForm.value.storage,
      compress: backupForm.value.compress,
      mode: backupForm.value.mode,
      maxfiles: backupForm.value.maxfiles
    });
    ElMessage.success("备份任务已创建");
    backupVisible.value = false;
    // 延迟刷新备份列表
    setTimeout(() => {
      if (detailData.value) {
        loadBackupList(detailData.value);
      }
    }, 2000);
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || "创建备份失败";
    ElMessage.error(msg);
  } finally {
    backupLoading.value = false;
  }
};

const handleOpenCreate = () => {
  createVmDialogVisible.value = true;
};

const handleCreateSuccess = () => {
  // 创建成功后刷新列表
  handleSearch();
};

const handleStartVm = async (row: Vm) => {
  if (!row.id) return;
  try {
    await ElMessageBox.confirm(
      t('pve.vm.confirmPowerOnMessage', { name: row.vm_name || row.id }),
      t('pve.vm.riskWarning'),
      {
        type: "warning",
        confirmButtonText: t('pve.vm.confirmPowerOnButton'),
        cancelButtonText: t('pve.common.cancel')
      }
    );
  } catch {
    return; // 用户取消
  }

  try {
    await startVm(row.id);
    row.status = "running";
    ElMessage.success(t('pve.vm.powerOnCommandSent'));
  } catch (error) {
    ElMessage.error(t('pve.vm.powerOnFailed'));
  }
};

const handleStopVm = async (row: Vm) => {
  if (!row.id) return;
  try {
    await ElMessageBox.confirm(
      t('pve.vm.confirmShutdownMessage', { name: row.vm_name || row.id }),
      t('pve.vm.riskWarning'),
      {
        type: "warning",
        confirmButtonText: t('pve.vm.confirmShutdownButton'),
        cancelButtonText: t('pve.common.cancel')
      }
    );
  } catch {
    return; // 用户取消
  }

  try {
    await stopVm(row.id);
    row.status = "stopped";
    ElMessage.success(t('pve.vm.shutdownCommandSent'));
  } catch (error) {
    ElMessage.error(t('pve.vm.shutdownFailed'));
  }
};

const handleDeleteVm = async (row: Vm) => {
  if (!row.id) return;
  try {
    await deleteVm(row.id);
    allVms.value = allVms.value.filter(v => v.id !== row.id);
    ElMessage.success("删除虚拟机成功");
  } catch (error) {
    ElMessage.error("删除虚拟机失败");
  }
};

const handleMigrateVm = (row: Vm) => {
  if (!row.id) return;
  migrateForm.value.vm_id = row.id;
  migrateForm.value.vm_name = row.vm_name;
  migrateForm.value.current_cluster_id = row.cluster_id;
  migrateForm.value.current_node_id = row.node_id || null;
  migrateForm.value.target_node_id = null;
  migrateForm.value.bwlimit = 1000;
  migrateForm.value.online = true;
  migrateForm.value.with_local_disks = true;
  targetNodeStatus.value = null;
  migrateVisible.value = true;
};

// 加载目标节点状态
const loadTargetNodeStatus = async (nodeId: number | null) => {
  targetNodeStatus.value = null;
  if (!nodeId) return;
  
  targetNodeStatusLoading.value = true;
  try {
    const res = await fetchNodeStatus(nodeId);
    if (res.code === 0 && res.data) {
      const data = res.data;
      
      // 解析内存数据：支持两种格式
      // 格式1: memory对象 {total, used, free}
      // 格式2: 直接字段 memtotal, memused
      let memtotal = 0;
      let memused = 0;
      
      if (data.memory && typeof data.memory === 'object' && data.memory.total) {
        // 格式1: memory对象
        memtotal = data.memory.total || 0;
        memused = data.memory.used || 0;
      } else {
        // 格式2: 直接字段
        memtotal = data.memtotal || data.memory_total || 0;
        memused = data.memused || data.memory_used || 0;
      }
      
      // 计算内存使用率
      const memory = memtotal > 0 ? memused / memtotal : 0;
      
      targetNodeStatus.value = {
        cpu: data.cpu || 0,
        memory: memory,
        memory_total: memtotal,
        memory_used: memused
      };
    }
  } catch (error) {
    console.error("Failed to load target node status:", error);
  } finally {
    targetNodeStatusLoading.value = false;
  }
};

// 监听目标节点变化
watch(() => migrateForm.value.target_node_id, (newNodeId) => {
  loadTargetNodeStatus(newNodeId);
});

const handleSubmitMigrate = async () => {
  if (!migrateForm.value.vm_id || !migrateForm.value.target_node_id) {
    ElMessage.warning("请选择目标节点");
    return;
  }
  migrateLoading.value = true;
  try {
    const payload: VmMigratePayload = {
      vm_id: migrateForm.value.vm_id,
      target_node_id: migrateForm.value.target_node_id!,
      bwlimit: migrateForm.value.bwlimit,
      online: migrateForm.value.online,
      with_local_disks: migrateForm.value.with_local_disks
    };
    await migrateVm(payload);
    ElMessage.success("已提交迁移请求");
    migrateVisible.value = false;
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || "迁移失败";
    ElMessage.error(msg);
  } finally {
    migrateLoading.value = false;
  }
};

// 跳转到 Proxmox VE 后台
const handleJumpToBackend = (row: Vm) => {
  if (!row.cluster_id) {
    ElMessage.warning("虚拟机未关联集群，无法跳转");
    return;
  }
  
  const cluster = clusters.value.find(c => c.id === row.cluster_id);
  if (!cluster || !cluster.api_url) {
    ElMessage.warning("集群 API URL 不存在，无法跳转");
    return;
  }
  
      // 构建 Proxmox VE 后台 URL：${api_url}/#v1:0:=qemu%2F${vmid}:4:::::::
  // 其中 %2F 是 / 的 URL 编码，格式为 qemu/100
      const backendUrl = `${cluster.api_url}/#v1:0:=qemu%2F${row.vmid}:4:::::::`;
  window.open(backendUrl, "_blank");
};

// Console 登录（后端返回 URL 时直接打开）
const handleConsoleLogin = async (row: Vm) => {
  if (!row.id) return;
  await openConsoleDialog(row);
};

const handleMoreAction = (command: string, row: Vm) => {
  switch (command) {
    case "backend":
      handleJumpToBackend(row);
      break;
    case "delete":
      ElMessageBox.confirm(
        t("pve.common.confirmDelete"),
        t("pve.common.confirm"),
        {
          confirmButtonText: t("pve.common.confirm"),
          cancelButtonText: t("pve.common.cancel"),
          type: "warning"
        }
      )
        .then(() => {
          handleDeleteVm(row);
        })
        .catch(() => {
          // 用户取消
        });
      break;
  }
};

const handleRowClick = (row: Vm) => {
  // 点击行时打开配置抽屉
  handleShowConfig(row);
};

const loadVmConfig = async () => {
  if (!selectedVmId.value) return;
  
  configLoading.value = true;
  try {
    const [currentRes, pendingRes] = await Promise.all([
      fetchVmCurrentConfig(selectedVmId.value),
      fetchVmPendingConfig(selectedVmId.value)
    ]);
    
    // 保存 digest（如果后端返回）
    if (currentRes?.data?.digest) {
      configDigest.value = currentRes.data.digest;
      // 从配置中移除 digest，避免在配置列表中显示
      const { digest, ...configWithoutDigest } = currentRes.data;
      currentConfig.value = configWithoutDigest;
    } else {
      currentConfig.value = currentRes?.data || {};
      configDigest.value = undefined;
    }
    pendingConfigList.value = pendingRes?.data || [];
    
    // 创建 pending 配置的映射，方便查找
    const pendingMap = new Map<string, { value: any; pending?: any }>();
    pendingConfigList.value.forEach(item => {
      pendingMap.set(item.key, {
        value: item.value,
        pending: item.pending
      });
    });
    
    // 合并配置项，对比当前配置和pending配置，标记有变化的配置
    const allKeys = new Set([
      ...Object.keys(currentConfig.value),
      ...pendingConfigList.value.map(item => item.key)
    ]);
    
    // 分离 Cloud-Init 配置和硬件配置
    const allConfigItems = Array.from(allKeys).map(key => {
      const currentValue = currentConfig.value[key];
      const pendingItem = pendingMap.get(key);
      
      // 如果 pending 配置中存在该 key，且 pending 字段存在，则标记为红色
      // 只要 pending 字段存在，就说明该配置有修改，需要标记为红色
      const hasChange = pendingItem && pendingItem.pending !== undefined;
      
      // 如果有 pending 修改：
      // - 修改前：使用 pendingItem.value（pending接口返回的value，即修改前的值）
      // - 修改后：使用 pendingItem.pending（pending接口返回的pending，即待修改的值）
      // 如果没有 pending，使用 currentConfig 的值
      return {
        key,
        value: hasChange ? pendingItem.value : currentValue, // 修改前的值（如果有pending用pending的value，否则用currentConfig）
        pendingValue: pendingItem?.pending, // pending 要修改的值（修改后的值）
        pending: hasChange
      };
    });
    
    // 分离 Cloud-Init 配置、硬件配置和选项配置
    const existingCloudinitItems = allConfigItems.filter(item => {
      const key = item.key.toLowerCase();
      // 包含 Cloud-Init 基础配置和 IP 配置
      return cloudinitKeys.includes(key) || isIpConfigKey(item.key);
    });
    
    // 如果有 CloudInit 设备，自动添加默认配置（仅前端显示）
    if (hasCloudinitDevice.value) {
      const existingKeys = new Set(existingCloudinitItems.map(item => item.key.toLowerCase()));
      // 添加不存在的默认配置项
      cloudinitDefaultConfigs.forEach(defaultConfig => {
        if (!existingKeys.has(defaultConfig.key.toLowerCase())) {
          existingCloudinitItems.push({
            key: defaultConfig.key,
            value: defaultConfig.value || '',
            pending: false,
            pendingValue: undefined
          });
        }
      });
      // 调试日志
      if (import.meta.env.DEV) {
        console.log('CloudInit 设备检测成功，默认配置已添加:', existingCloudinitItems);
      }
    } else {
      // 调试日志
      if (import.meta.env.DEV) {
        console.log('未检测到 CloudInit 设备，当前配置:', currentConfig.value);
      }
    }
    
    // 默认添加 ipconfig0、searchdomain、nameserver、sshkeys（如果不存在）
    const existingKeys = new Set(existingCloudinitItems.map(item => item.key.toLowerCase()));
    
    // 默认添加 ipconfig0
    if (!existingKeys.has('ipconfig0')) {
      existingCloudinitItems.push({
        key: 'ipconfig0',
        value: '',
        pending: false,
        pendingValue: undefined
      });
    }
    
    // 默认添加 searchdomain
    if (!existingKeys.has('searchdomain')) {
      existingCloudinitItems.push({
        key: 'searchdomain',
        value: '',
        pending: false,
        pendingValue: undefined
      });
    }
    
    // 默认添加 nameserver
    if (!existingKeys.has('nameserver')) {
      existingCloudinitItems.push({
        key: 'nameserver',
        value: '',
        pending: false,
        pendingValue: undefined
      });
    }
    
    // 默认添加 sshkeys
    if (!existingKeys.has('sshkeys')) {
      existingCloudinitItems.push({
        key: 'sshkeys',
        value: '',
        pending: false,
        pendingValue: undefined
      });
    }
    
    // 合并 searchdomain 和 nameserver 为一个 DNS Config 项
    const dnsConfigItems: VmConfigItem[] = [];
    const searchdomainItem = existingCloudinitItems.find(item => item.key.toLowerCase() === 'searchdomain');
    const nameserverItem = existingCloudinitItems.find(item => item.key.toLowerCase() === 'nameserver');
    
    // 如果存在 searchdomain 或 nameserver，创建一个合并的 DNS Config 项
    if (searchdomainItem || nameserverItem) {
      dnsConfigItems.push({
        key: 'dnsconfig', // 使用一个虚拟的 key
        value: searchdomainItem?.value || nameserverItem?.value || '',
        pending: searchdomainItem?.pending || nameserverItem?.pending || false,
        pendingValue: searchdomainItem?.pendingValue || nameserverItem?.pendingValue || undefined
      });
    }
    
    // 移除 searchdomain 和 nameserver，使用合并的 DNS Config
    const filteredItems = existingCloudinitItems.filter(item => {
      const key = item.key.toLowerCase();
      return key !== 'searchdomain' && key !== 'nameserver';
    });
    
    // 按照指定顺序排序并添加别名
    const configOrder = ['ciuser', 'cipassword', 'ciupgrade', 'dnsconfig', 'sshkeys', 'ipconfig0'];
    const sortedItems = configOrder
      .map(key => {
        if (key === 'dnsconfig') {
          return dnsConfigItems[0];
        }
        return filteredItems.find(item => item.key.toLowerCase() === key.toLowerCase());
      })
      .filter(item => item !== undefined) as VmConfigItem[];
    
    // 添加未在顺序列表中的其他配置项（如 ipconfig1, ipconfig2 等）
    const otherItems = filteredItems.filter(item => 
      !configOrder.includes(item.key.toLowerCase())
    );
    
    cloudinitConfigItems.value = [...sortedItems, ...otherItems];
    
    // 硬件配置：只保留硬件相关的配置项
    const hardwareItems = allConfigItems.filter(item => {
      const key = item.key.toLowerCase();
      // 排除 Cloud-Init 配置和 IP 配置
      if (cloudinitKeys.includes(key) || isIpConfigKey(item.key)) return false;
      // 只保留硬件配置项
      return isHardwareKey(item.key);
    });
    
    // 对硬件配置项进行排序，将 sockets、cpu、cores 放在一起
    const cpuConfigOrder = ['sockets', 'cpu', 'cores'];
    const sortedHardwareItems: VmConfigItem[] = [];
    const cpuConfigItems: VmConfigItem[] = [];
    const otherHardwareItems: VmConfigItem[] = [];
    
    hardwareItems.forEach(item => {
      const key = item.key.toLowerCase();
      if (cpuConfigOrder.includes(key)) {
        cpuConfigItems.push(item);
      } else {
        otherHardwareItems.push(item);
      }
    });
    
    // 按照 sockets、cpu、cores 的顺序排序 CPU 配置项
    const sortedCpuItems = cpuConfigOrder
      .map(key => cpuConfigItems.find(item => item.key.toLowerCase() === key))
      .filter(item => item !== undefined) as VmConfigItem[];
    
    // 合并：先放 CPU 配置项，再放其他硬件配置项
    configItems.value = [...sortedCpuItems, ...otherHardwareItems];
    
    // 选项配置：其他所有配置项
    optionsConfigItems.value = allConfigItems.filter(item => {
      const key = item.key.toLowerCase();
      // 排除 Cloud-Init 配置和 IP 配置
      if (cloudinitKeys.includes(key) || isIpConfigKey(item.key)) return false;
      // 排除硬件配置项
      return !isHardwareKey(item.key);
    });
    
  } catch (error) {
    ElMessage.error("获取虚拟机配置失败");
    console.error(error);
  } finally {
    configLoading.value = false;
  }
};

const loadOverview = async () => {
  if (!selectedVmId.value) return;
  
  overviewLoading.value = true;
  try {
    const [basicRes, statusRes] = await Promise.all([
      fetchVmBasicInfo(selectedVmId.value),
      fetchVmStatus(selectedVmId.value)
    ]);
    
    // 根据响应拦截器，返回的是 response.data
    // 后端返回格式：{ code: 0, message: "ok", data: { ... } }
    // 所以 basicRes 应该是 { code, message, data }
    if (basicRes && basicRes.data) {
      vmBasicInfo.value = basicRes.data;
    } else {
      // 如果格式不对，尝试直接使用 basicRes
      vmBasicInfo.value = basicRes as any;
    }
    
    if (statusRes && statusRes.data) {
      vmStatus.value = statusRes.data;
    } else {
      vmStatus.value = statusRes as any;
    }
  } catch (error) {
    console.error("获取概览信息失败:", error);
  } finally {
    overviewLoading.value = false;
  }
};

const handleShowConfig = async (row: Vm) => {
  if (!row.id) return;
  selectedVmId.value = row.id;
  configActiveTab.value = "overview"; // 默认显示概览
  configVisible.value = true;
  // watch 会自动处理数据加载和图表初始化
  // 加载备份存储列表
  await loadBackupTabStorages(row);
};

// 加载备份存储列表（在配置抽屉中）
const loadBackupTabStorages = async (vm: Vm) => {
  if (!vm.node_name) {
    backupTabStorages.value = [];
    return;
  }
  
  try {
    // 获取该节点的所有存储
    const storageRes = await fetchStorages({ 
      node_name: vm.node_name,
      page_size: 100 
    });
    const allStorages = storageRes?.data?.list ?? [];
    
    // 过滤出支持备份的存储（content 包含 "backup"）
    backupTabStorages.value = allStorages.filter(s => {
      const content = (s.content || "")
        .split(",")
        .map(item => item.trim())
        .filter(Boolean);
      return content.includes("backup");
    });
    
    // 默认选择 local 存储（如果存在且支持 backup），否则选择第一个
    if (backupTabStorages.value.length > 0 && !backupTabForm.value.storage) {
      const localStorage = backupTabStorages.value.find(s => s.storage_name === "local");
      backupTabForm.value.storage = localStorage ? localStorage.storage_name : backupTabStorages.value[0].storage_name;
      // 加载备份列表
      await loadBackupTabList(vm);
    }
  } catch (error) {
    console.warn("加载备份存储列表失败", error);
    backupTabStorages.value = [];
  }
};

// 加载备份列表（在配置抽屉中）
const loadBackupTabList = async (vm: Vm) => {
  if (!vm.node_name || !backupTabForm.value.storage) {
    backupTabList.value = [];
    return;
  }
  
  // 获取节点ID
  const node = allNodes.value.find(n => n.node_name === vm.node_name);
  if (!node) {
    backupTabList.value = [];
    return;
  }
  
  backupTabListLoading.value = true;
  try {
    const res = await fetchNodeStorageContent({
      node_id: node.id,
      storage: backupTabForm.value.storage,
      content: "backup"
    });
    // 过滤出该虚拟机的备份文件（根据vmid）
    const vmBackups = (res?.data || []).filter(item => {
      // 备份文件名格式通常是: vzdump-qemu-{vmid}-*.vma.zst
      const volid = item.volid || "";
      return volid.includes(`-${vm.vmid}-`) || volid.includes(`-qemu-${vm.vmid}-`);
    });
    backupTabList.value = vmBackups;
  } catch (error) {
    console.warn("加载备份列表失败", error);
    backupTabList.value = [];
  } finally {
    backupTabListLoading.value = false;
  }
};

// 打开备份对话框（在配置抽屉中）
const handleOpenBackupTab = () => {
  if (!vmBasicInfo.value) return;
  backupTabVisible.value = true;
  // 默认选择 local 存储（如果存在且支持 backup），否则选择第一个
  const localStorage = backupTabStorages.value.find(s => s.storage_name === "local");
  backupTabForm.value = {
    storage: localStorage ? localStorage.storage_name : (backupTabStorages.value[0]?.storage_name || ""),
    compress: "zst",
    mode: "snapshot",
    maxfiles: 5
  };
  // 加载备份列表
  if (vmBasicInfo.value) {
    loadBackupTabList(vmBasicInfo.value);
  }
};

// 创建备份（在配置抽屉中）
const handleCreateBackupTab = async () => {
  if (!vmBasicInfo.value) return;
  if (!backupTabForm.value.storage) {
    ElMessage.warning(t('pve.template.pleaseSelectStorage'));
    return;
  }
  
  backupTabLoading.value = true;
  try {
    await createVmBackup({
      vmid: vmBasicInfo.value.vmid,
      storage: backupTabForm.value.storage,
      compress: backupTabForm.value.compress,
      mode: backupTabForm.value.mode,
      maxfiles: backupTabForm.value.maxfiles
    });
    ElMessage.success(t('pve.vm.backupTaskCreated'));
    backupTabVisible.value = false;
    // 延迟刷新备份列表
    setTimeout(() => {
      if (vmBasicInfo.value) {
        loadBackupTabList(vmBasicInfo.value);
      }
    }, 2000);
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.createBackupFailed');
    ElMessage.error(msg);
  } finally {
    backupTabLoading.value = false;
  }
};

// 配置标签页切换处理
const handleConfigTabChange = (tabName: string) => {
  if (tabName === "backup" && vmBasicInfo.value) {
    // 切换到备份标签页时，如果还没有加载存储列表，则加载
    if (backupTabStorages.value.length === 0) {
      loadBackupTabStorages(vmBasicInfo.value);
    } else if (backupTabForm.value.storage) {
      // 如果已有存储选择，加载备份列表
      loadBackupTabList(vmBasicInfo.value);
    }
  }
};

// 删除备份
const handleDeleteBackup = async (row: StorageContentItem) => {
  if (!vmBasicInfo.value || !row.volid) return;
  
  // 获取节点ID
  const node = allNodes.value.find(n => n.node_name === vmBasicInfo.value?.node_name);
  if (!node) {
    ElMessage.error("无法获取节点信息");
    return;
  }
  
  // 获取存储ID
  const storage = backupTabStorages.value.find(s => s.storage_name === backupTabForm.value.storage);
  if (!storage) {
    ElMessage.error("无法获取存储信息");
    return;
  }
  
  try {
    await ElMessageBox.confirm(
      t('pve.vm.deleteBackupConfirm', { volume: row.volid }),
      t('pve.vm.deleteBackup'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning',
        dangerouslyUseHTMLString: false
      }
    );
    
    // 用户确认删除
    try {
      await deleteVmBackup({
        node_id: node.id,
        storage_id: storage.id,
        volume: row.volid,
        delay: 5
      });
      ElMessage.success(t('pve.vm.deleteBackupSuccess'));
      // 刷新备份列表
      if (vmBasicInfo.value) {
        await loadBackupTabList(vmBasicInfo.value);
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || t('pve.vm.deleteBackupFailed');
      ElMessage.error(msg);
    }
  } catch {
    // 用户取消删除
  }
};

// 解析 IP 配置字符串
// 格式示例: gw=192.168.1.1,ip=192.168.1.100/24,gw6=2001:db8::1,ip6=2001:db8::100/64
const parseIpConfig = (configStr: string) => {
  const result = {
    ipv4_mode: 'static' as 'static' | 'dhcp',
    ipv4_address: '',
    ipv4_gateway: '',
    ipv6_mode: 'static' as 'static' | 'dhcp' | 'slaac',
    ipv6_address: '',
    ipv6_gateway: ''
  };
  
  if (!configStr) return result;
  
  const parts = configStr.split(',');
  
  parts.forEach(part => {
    const trimmed = part.trim();
    if (trimmed.startsWith('ip=')) {
      const ipValue = trimmed.substring(3);
      if (ipValue === 'dhcp') {
        result.ipv4_mode = 'dhcp';
      } else {
        result.ipv4_mode = 'static';
        result.ipv4_address = ipValue;
      }
    } else if (trimmed.startsWith('gw=')) {
      result.ipv4_gateway = trimmed.substring(3);
    } else if (trimmed.startsWith('ip6=')) {
      const ip6Value = trimmed.substring(4);
      if (ip6Value === 'dhcp') {
        result.ipv6_mode = 'dhcp';
      } else if (ip6Value === 'slaac') {
        result.ipv6_mode = 'slaac';
      } else {
        result.ipv6_mode = 'static';
        result.ipv6_address = ip6Value;
      }
    } else if (trimmed.startsWith('gw6=')) {
      result.ipv6_gateway = trimmed.substring(4);
    }
  });
  
  return result;
};

// 格式化 DNS 配置显示（用于表格显示）
const formatDnsConfigDisplay = (): string => {
  const searchdomain = String(currentConfig.value.searchdomain || '');
  const nameserver = String(currentConfig.value.nameserver || '');
  const parts: string[] = [];
  if (searchdomain) {
    parts.push(`Domain: ${searchdomain}`);
  }
  if (nameserver) {
    parts.push(`Servers: ${nameserver}`);
  }
  return parts.length > 0 ? parts.join(', ') : 'use host settings';
};

// 格式化 IP 配置显示（用于表格显示）
const formatIpConfigDisplay = (configStr: string | undefined): string => {
  if (!configStr) return '-';
  const parsed = parseIpConfig(String(configStr));
  const parts: string[] = [];
  
  if (parsed.ipv4_mode === 'dhcp') {
    parts.push('IPv4: DHCP');
  } else if (parsed.ipv4_address) {
    parts.push(`IPv4: ${parsed.ipv4_address}`);
    if (parsed.ipv4_gateway) {
      parts.push(`GW: ${parsed.ipv4_gateway}`);
    }
  }
  
  if (parsed.ipv6_mode === 'dhcp') {
    parts.push('IPv6: DHCP');
  } else if (parsed.ipv6_mode === 'slaac') {
    parts.push('IPv6: SLAAC');
  } else if (parsed.ipv6_address) {
    parts.push(`IPv6: ${parsed.ipv6_address}`);
    if (parsed.ipv6_gateway) {
      parts.push(`GW6: ${parsed.ipv6_gateway}`);
    }
  }
  
  return parts.length > 0 ? parts.join(', ') : configStr;
};

// 格式化 IP 配置为字符串
const formatIpConfig = (config: typeof ipConfigForm.value) => {
  const parts: string[] = [];
  
  // IPv4 配置
  if (config.ipv4_mode === 'dhcp') {
    parts.push('ip=dhcp');
  } else if (config.ipv4_address) {
    parts.push(`ip=${config.ipv4_address}`);
    if (config.ipv4_gateway) {
      parts.push(`gw=${config.ipv4_gateway}`);
    }
  }
  
  // IPv6 配置
  if (config.ipv6_mode === 'dhcp') {
    parts.push('ip6=dhcp');
  } else if (config.ipv6_mode === 'slaac') {
    parts.push('ip6=slaac');
  } else if (config.ipv6_address) {
    parts.push(`ip6=${config.ipv6_address}`);
    if (config.ipv6_gateway) {
      parts.push(`gw6=${config.ipv6_gateway}`);
    }
  }
  
  return parts.join(',');
};

// 打开 IP 配置对话框
const handleOpenIpConfig = (item: VmConfigItem) => {
  ipConfigForm.value.key = item.key;
  
  // 从 key 中提取设备名称（如 ipconfig0 -> net0）
  const match = item.key.match(/^ipconfig(\d+)$/i);
  if (match) {
    ipConfigForm.value.device = `net${match[1]}`;
  } else {
    ipConfigForm.value.device = 'net0';
  }
  
  // 解析现有配置
  const configStr = String(item.value || '');
  const parsed = parseIpConfig(configStr);
  ipConfigForm.value = {
    ...ipConfigForm.value,
    ...parsed
  };
  
  ipConfigVisible.value = true;
};

// 保存 IP 配置
const handleSaveIpConfig = async () => {
  if (!selectedVmId.value) return;
  
  ipConfigLoading.value = true;
  try {
    const configStr = formatIpConfig(ipConfigForm.value);
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config: { [ipConfigForm.value.key]: configStr }
    });
    ElMessage.success(t('pve.vm.ipConfigSaved'));
    ipConfigVisible.value = false;
    await loadVmConfig();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.ipConfigSaveFailed');
    ElMessage.error(msg);
  } finally {
    ipConfigLoading.value = false;
  }
};

// 打开 DNS 配置对话框
const handleOpenDnsConfig = (item: VmConfigItem) => {
  // 从当前配置中获取 DNS 相关配置
  dnsConfigForm.value = {
    searchdomain: String(currentConfig.value.searchdomain || ''),
    nameserver: String(currentConfig.value.nameserver || '')
  };
  dnsConfigVisible.value = true;
};

// 保存 DNS 配置
const handleSaveDnsConfig = async () => {
  if (!selectedVmId.value) return;
  
  dnsConfigLoading.value = true;
  try {
    const config: Record<string, string> = {};
    if (dnsConfigForm.value.searchdomain) {
      config.searchdomain = dnsConfigForm.value.searchdomain;
    }
    if (dnsConfigForm.value.nameserver) {
      config.nameserver = dnsConfigForm.value.nameserver;
    }
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config
    });
    ElMessage.success(t('pve.vm.ipConfigSaved'));
    dnsConfigVisible.value = false;
    await loadVmConfig();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.ipConfigSaveFailed');
    ElMessage.error(msg);
  } finally {
    dnsConfigLoading.value = false;
  }
};

// 打开 SSH Key 配置对话框
const handleOpenSshKeyConfig = (item: VmConfigItem) => {
  sshKeyConfigForm.value = {
    sshkeys: String(item.value || '')
  };
  sshKeyConfigVisible.value = true;
};

// 保存 SSH Key 配置
const handleSaveSshKeyConfig = async () => {
  if (!selectedVmId.value) return;
  
  sshKeyConfigLoading.value = true;
  try {
    const config: Record<string, string> = {};
    if (sshKeyConfigForm.value.sshkeys) {
      config.sshkeys = sshKeyConfigForm.value.sshkeys;
    }
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config
    });
    ElMessage.success(t('pve.vm.ipConfigSaved'));
    sshKeyConfigVisible.value = false;
    await loadVmConfig();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.ipConfigSaveFailed');
    ElMessage.error(msg);
  } finally {
    sshKeyConfigLoading.value = false;
  }
};

// 加载 SSH Key 文件
const handleLoadSshKeyFile = () => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.pub,text/plain';
  input.onchange = (e: Event) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        sshKeyConfigForm.value.sshkeys = content.trim();
      };
      reader.readAsText(file);
    }
  };
  input.click();
};

// 打开 Upgrade packages 配置对话框
const handleOpenUpgradeConfig = (item: VmConfigItem) => {
  // ciupgrade 的值通常是 '1' 表示启用，空或 '0' 表示禁用
  upgradeConfigForm.value = {
    ciupgrade: String(item.value || '') === '1'
  };
  upgradeConfigVisible.value = true;
};

// 保存 Upgrade packages 配置
const handleSaveUpgradeConfig = async () => {
  if (!selectedVmId.value) return;
  
  upgradeConfigLoading.value = true;
  try {
    const config: Record<string, string> = {
      ciupgrade: upgradeConfigForm.value.ciupgrade ? '1' : '0'
    };
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config
    });
    ElMessage.success(t('pve.vm.ipConfigSaved'));
    upgradeConfigVisible.value = false;
    await loadVmConfig();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || t('pve.vm.ipConfigSaveFailed');
    ElMessage.error(msg);
  } finally {
    upgradeConfigLoading.value = false;
  }
};

// 编辑 Cloud-Init 配置（通用编辑按钮）
const handleEditCloudinitConfig = () => {
  if (!selectedCloudinitRow.value) {
    ElMessage.warning(t('pve.common.pleaseSelect'));
    return;
  }
  handleEditConfig(selectedCloudinitRow.value);
};

// 删除 Cloud-Init 设备
const handleRemoveCloudinit = async () => {
  if (!selectedVmId.value || !hasCloudinitDevice.value) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.vm.removeCloudinitConfirm'),
      t('pve.common.remove'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    // 查找 CloudInit 设备并删除
    let cloudinitDevice = '';
    for (let i = 0; i < 4; i++) {
      const ideKey = `ide${i}`;
      const ideValue = currentConfig.value[ideKey];
      if (ideValue && typeof ideValue === 'string') {
        const lowerValue = ideValue.toLowerCase();
        if (lowerValue.includes('media=cloudinit') || lowerValue.includes('cloudinit')) {
          cloudinitDevice = ideKey;
          break;
        }
      }
    }
    
    if (cloudinitDevice) {
      await updateVmConfig({
        vm_id: selectedVmId.value,
        config: { [cloudinitDevice]: '' } // 删除设备
      });
      ElMessage.success(t('pve.vm.removeCloudinitSuccess'));
      await loadVmConfig();
    }
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.vm.removeCloudinitFailed');
      ElMessage.error(msg);
    }
  }
};

// 重新生成 Cloud-Init 镜像
const handleRegenerateCloudinitImage = async () => {
  if (!selectedVmId.value || !hasCloudinitDevice.value || !vmBasicInfo.value) return;
  
  try {
    await ElMessageBox.confirm(
      t('pve.vm.regenerateImageConfirm'),
      t('pve.vm.regenerateImage'),
      {
        confirmButtonText: t('pve.common.confirm'),
        cancelButtonText: t('pve.common.cancel'),
        type: 'warning'
      }
    );
    
    // 获取节点ID
    const node = allNodes.value.find(n => n.node_name === vmBasicInfo.value?.node_name);
    if (!node) {
      ElMessage.error(t('pve.common.nodeNotFound'));
      return;
    }
    
    // 收集所有 Cloud-Init 配置项
    const cloudinitPayload: any = {
      vm_id: selectedVmId.value,
      node_id: node.id
    };
    
    // 从当前配置中提取 Cloud-Init 相关配置
    if (currentConfig.value.ciuser) cloudinitPayload.ciuser = String(currentConfig.value.ciuser);
    if (currentConfig.value.cipassword) cloudinitPayload.cipassword = String(currentConfig.value.cipassword);
    if (currentConfig.value.ciupgrade) cloudinitPayload.ciupgrade = String(currentConfig.value.ciupgrade);
    if (currentConfig.value.searchdomain) cloudinitPayload.searchdomain = String(currentConfig.value.searchdomain);
    if (currentConfig.value.nameserver) cloudinitPayload.nameserver = String(currentConfig.value.nameserver);
    if (currentConfig.value.sshkeys) cloudinitPayload.sshkeys = String(currentConfig.value.sshkeys);
    
    // 添加所有 ipconfig 配置
    Object.keys(currentConfig.value).forEach(key => {
      if (isIpConfigKey(key)) {
        cloudinitPayload[key] = String(currentConfig.value[key]);
      }
    });
    
    await updateCloudinitConfig(cloudinitPayload);
    ElMessage.success(t('pve.vm.regenerateImageSuccess'));
    await loadVmConfig();
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || t('pve.vm.regenerateImageFailed');
      ElMessage.error(msg);
    }
  }
};

const handleEditConfig = async (item: VmConfigItem) => {
  const key = item.key.toLowerCase();
  const value = String(item.value || "");
  hardwareAction.value = "edit";
  
  // 先获取当前节点的存储列表，供下拉菜单使用
  if (vmBasicInfo.value?.node_name) {
    try {
      const res = await fetchStorages({ node_name: vmBasicInfo.value.node_name });
      nodeStorages.value = res?.data?.list || [];
    } catch (error) {
      console.warn("获取节点存储失败", error);
    }
  }

  // 根据 key 类型决定打开哪个弹窗
  if (key === "cpu" || key === "sockets" || key === "cores") {
    hardwareEditType.value = "cpu";
    // 如果是编辑 cpu，通常 value 是类似 "host" 或 "kvm64"
    // 但 PVE 有时候把 sockets/cores/cpu 分开返回，也有时候合在一起
    // 这里我们简单处理：获取当前所有相关的 CPU 配置
    cpuForm.value = {
      sockets: Number(currentConfig.value.sockets || 1),
      cores: Number(currentConfig.value.cores || 1),
      cpu: String(currentConfig.value.cpu || "kvm64")
    };
    hardwareEditVisible.value = true;
  } else if (key === "scsihw") {
    hardwareEditType.value = "scsi";
    scsiForm.value = {
      controller: value || "virtio-scsi-pci"
    };
    hardwareEditVisible.value = true;
  } else if (/^ide\d+$/.test(key) && (value.includes("media=cdrom") || value.includes(".iso") || value === "none")) {
    hardwareEditType.value = "cdrom";
    cdromForm.value.device = key;
    const match = key.match(/^([a-z]+)(\d+)$/);
    if (match) {
      cdromForm.value.busType = match[1];
      cdromForm.value.busIdx = Number(match[2]);
    }
    if (value === "none") {
      cdromForm.value.media = "none";
    } else {
      const parts = value.split(",");
      const volid = parts[0];
      if (volid.includes(":")) {
        cdromForm.value.media = "iso";
        const [storage, iso] = volid.split(":");
        cdromForm.value.storage = storage;
        cdromForm.value.iso = iso;
        // 加载 ISO 列表
        handleCdromStorageChange(storage);
      } else {
        cdromForm.value.media = "cdrom";
      }
    }
    hardwareEditVisible.value = true;
  } else if (/^(scsi|virtio|ide|sata)\d+$/.test(key) && !value.includes("media=cdrom")) {
    hardwareEditType.value = "disk";
    diskForm.value.device = key;
    const match = key.match(/^([a-z]+)(\d+)$/);
    if (match) {
      diskForm.value.busType = match[1];
      diskForm.value.busIdx = Number(match[2]);
    }
    // 解析磁盘配置字符串: local-lvm:vm-100-disk-0,cache=writeback,discard=on,iothread=1,size=32G
    const parts = value.split(",");
    diskForm.value.cache = parts.find(p => p.startsWith("cache="))?.split("=")[1] || "none";
    diskForm.value.discard = parts.includes("discard=on");
    diskForm.value.iothread = parts.includes("iothread=1");
    diskForm.value.ssd = parts.includes("ssd=1");
    diskForm.value.ro = parts.includes("ro=1");
    diskForm.value.backup = !parts.includes("backup=0");
    diskForm.value.replicate = !parts.includes("replicate=0");
    diskForm.value.aio = parts.find(p => p.startsWith("aio="))?.split("=")[1] || "default";
    hardwareEditVisible.value = true;
  } else if (isIpConfigKey(item.key)) {
    // 编辑 IP 配置
    handleOpenIpConfig(item);
    return;
  } else if (key === 'searchdomain' || key === 'nameserver') {
    // 编辑 DNS 配置
    handleOpenDnsConfig(item);
    return;
  } else if (key === 'sshkeys') {
    // 编辑 SSH Key 配置
    handleOpenSshKeyConfig(item);
    return;
  } else if (/^net\d+$/.test(key)) {
    hardwareEditType.value = "net";
    netForm.value.device = key;
    // 解析网络配置字符串: virtio=BC:24:11:31:96:DC,bridge=vmbr0,firewall=1,tag=10
    const parts = value.split(",");
    const modelPart = parts[0]; // virtio=XX:XX...
    if (modelPart.includes("=")) {
      const [model, mac] = modelPart.split("=");
      netForm.value.model = model;
      netForm.value.macaddr = mac;
    }
    netForm.value.bridge = parts.find(p => p.startsWith("bridge="))?.split("=")[1] || "vmbr0";
    const tag = parts.find(p => p.startsWith("tag="))?.split("=")[1];
    netForm.value.tag = tag ? Number(tag) : undefined;
    netForm.value.firewall = parts.includes("firewall=1");
    netForm.value.disconnect = parts.includes("link_down=1");
    const mtu = parts.find(p => p.startsWith("mtu="))?.split("=")[1];
    netForm.value.mtu = mtu ? Number(mtu) : undefined;
    const queues = parts.find(p => p.startsWith("queues="))?.split("=")[1];
    netForm.value.queues = queues ? Number(queues) : undefined;
    const rate = parts.find(p => p.startsWith("rate="))?.split("=")[1];
    netForm.value.rate = rate ? Number(rate) : undefined;
    hardwareEditVisible.value = true;
  } else {
    // 普通编辑
    hardwareEditType.value = "common";
    editForm.value = {
      key: item.key,
      value: String(item.value || "")
    };
    editDialogVisible.value = true;
  }
};

const handleCdromStorageChange = async (storage: string) => {
  if (!vmBasicInfo.value?.node_name || !storage) return;
  try {
    const res = await fetchNodeStorageContent({
      node_id: vmBasicInfo.value.node_id, // 实际上后端可能需要 node_id，我们之前 resolve 过
      storage,
      content: "iso"
    });
    nodeIsos.value = res?.data || [];
  } catch (error) {
    console.warn("获取 ISO 列表失败", error);
    nodeIsos.value = [];
  }
};

const handleSaveHardwareConfig = async () => {
  if (!selectedVmId.value) return;
  
  hardwareLoading.value = true;
  try {
    let config: any = {};
    
    if (hardwareEditType.value === "cpu") {
      config = {
        sockets: cpuForm.value.sockets,
        cores: cpuForm.value.cores,
        cpu: cpuForm.value.cpu
      };
    } else if (hardwareEditType.value === "scsi") {
      config = {
        scsihw: scsiForm.value.controller
      };
    } else if (hardwareEditType.value === "cdrom") {
      let value = "";
      if (cdromForm.value.media === "none") {
        value = "none";
      } else if (cdromForm.value.media === "cdrom") {
        value = "cdrom";
      } else {
        // ISO 路径格式：如果 iso 已经是完整的 volid (storage:path)，直接使用；否则拼接 storage:iso
        let isoPath = cdromForm.value.iso;
        if (isoPath && !isoPath.includes(":")) {
          // 如果 iso 只是文件名或路径，需要拼接 storage
          isoPath = `${cdromForm.value.storage}:${isoPath}`;
        }
        value = `${isoPath},media=cdrom`;
      }
      const device = `${cdromForm.value.busType}${cdromForm.value.busIdx}`;
      config = { [device]: value };
    } else if (hardwareEditType.value === "disk") {
      // 组装磁盘配置字符串
      let baseValue = "";
      const device = `${diskForm.value.busType}${diskForm.value.busIdx}`;
      if (hardwareAction.value === "add") {
        // 添加新磁盘：存储名称:大小
        baseValue = `${diskForm.value.storage}:${diskForm.value.size}`;
      } else {
        // 编辑现有磁盘：保留原始 volid
        const originalValue = currentConfig.value[diskForm.value.device] || "";
        baseValue = originalValue.split(",")[0];
      }
      
      const opts = [];
      if (diskForm.value.cache !== "none") opts.push(`cache=${diskForm.value.cache}`);
      if (diskForm.value.discard) opts.push("discard=on");
      if (diskForm.value.iothread) opts.push("iothread=1");
      if (diskForm.value.ssd) opts.push("ssd=1");
      if (diskForm.value.ro) opts.push("ro=1");
      if (!diskForm.value.backup) opts.push("backup=0");
      if (!diskForm.value.replicate) opts.push("replicate=0");
      if (diskForm.value.aio !== "default") opts.push(`aio=${diskForm.value.aio}`);
      
      config = {
        [device]: [baseValue, ...opts].join(",")
      };
    } else if (hardwareEditType.value === "net") {
      const opts = [];
      opts.push(`${netForm.value.model}=${netForm.value.macaddr}`);
      opts.push(`bridge=${netForm.value.bridge}`);
      if (netForm.value.tag) opts.push(`tag=${netForm.value.tag}`);
      if (netForm.value.firewall) opts.push("firewall=1");
      if (netForm.value.disconnect) opts.push("link_down=1");
      if (netForm.value.mtu) opts.push(`mtu=${netForm.value.mtu}`);
      if (netForm.value.queues) opts.push(`queues=${netForm.value.queues}`);
      if (netForm.value.rate) opts.push(`rate=${netForm.value.rate}`);
      
      config = {
        [netForm.value.device]: opts.join(",")
      };
    }

    await updateVmConfig({
      vm_id: selectedVmId.value,
      config,
      digest: configDigest.value
    });
    
    ElMessage.success("配置更新成功");
    hardwareEditVisible.value = false;
    await loadVmConfig();
  } catch (error: any) {
    const msg = error?.response?.data?.message || error?.message || "更新配置失败";
    ElMessage.error(msg);
  } finally {
    hardwareLoading.value = false;
  }
};

// 获取编辑对话框标题
const getEditDialogTitle = (): string => {
  const key = editForm.value.key.toLowerCase();
  if (key === 'ciuser') {
    return t('pve.vm.editUserConfig');
  } else if (key === 'cipassword') {
    return t('pve.vm.editPasswordConfig');
  } else {
    // 使用配置项的显示名称
    const displayName = getCloudinitConfigDisplayName(editForm.value.key);
    return `${t('pve.common.edit')} ${displayName} ${t('pve.vm.configuration')}`;
  }
};

const handleSaveConfig = async () => {
  if (!selectedVmId.value) return;
  
  try {
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config: {
        [editForm.value.key]: editForm.value.value
      },
      digest: configDigest.value
    });
    
    ElMessage.success("配置更新成功");
    editDialogVisible.value = false;
    
    // 等待一小段时间，确保后端已更新 pending 状态
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // 重新加载配置，包括调用 pending 接口检查所有 key 是否有 pending 状态
    await loadVmConfig();
  } catch (error: any) {
    const errorMessage = error?.response?.data?.message || error?.message || "更新配置失败";
    ElMessage.error(errorMessage);
    console.error("更新配置失败:", error);
  }
};

const handleOpenAddHardware = async (command: string) => {
  if (!selectedVmId.value) return;
  hardwareAction.value = "add";

  // 查找下一个可用设备索引的辅助函数
  const findNextIdx = (prefix: string) => {
    let i = 0;
    while (currentConfig.value[`${prefix}${i}`]) i++;
    return i;
  };

  // 先获取当前节点的存储列表，供下拉菜单使用
  if (vmBasicInfo.value?.node_name) {
    try {
      const res = await fetchStorages({ node_name: vmBasicInfo.value.node_name });
      nodeStorages.value = res?.data?.list || [];
    } catch (error) {
      console.warn("获取节点存储失败", error);
    }
  }

  if (command === "disk") {
    hardwareEditType.value = "disk";
    // 默认添加 scsi 设备
    const busIdx = findNextIdx("scsi");
    diskForm.value = {
      busType: "scsi",
      busIdx,
      device: `scsi${busIdx}`,
      storage: "",
      size: 32,
      cache: "none",
      discard: false,
      iothread: false,
      ssd: false,
      ro: false,
      backup: true,
      replicate: true,
      aio: "default"
    };
    hardwareEditVisible.value = true;
  } else if (command === "cdrom") {
    hardwareEditType.value = "cdrom";
    // 默认添加 ide 设备（通常光驱用 ide）
    const busIdx = findNextIdx("ide");
    cdromForm.value = {
      busType: "ide",
      busIdx,
      device: `ide${busIdx}`,
      media: "none",
      storage: "",
      iso: ""
    };
    hardwareEditVisible.value = true;
  } else if (command === "net") {
    hardwareEditType.value = "net";
    netForm.value = {
      device: `net${findNextIdx("net")}`,
      model: "virtio",
      bridge: "vmbr0",
      tag: undefined,
      firewall: false,
      macaddr: "",
      disconnect: false,
      mtu: undefined,
      queues: undefined,
      rate: undefined
    };
    hardwareEditVisible.value = true;
  } else if (command === "cloudinit") {
    // 添加 CloudInit 通常是在一个空 ide 设备上挂载 media=cloudinit
    const device = `ide${findNextIdx("ide")}`;
    try {
      await ElMessageBox.confirm(`确认添加 CloudInit 设备到 ${device}？`, "提示");
      await updateVmConfig({
        vm_id: selectedVmId.value!,
        config: { [device]: "none,media=cloudinit" }
      });
      ElMessage.success("CloudInit 设备添加成功");
      await loadVmConfig();
    } catch {
      // 用户取消
    }
  }
};

const handleRemoveHardware = async () => {
  if (!selectedVmId.value || !selectedConfigRow.value) return;
  
  const key = selectedConfigRow.value.key;
  // 某些关键配置不允许删除，或者需要特殊处理
  const protectedKeys = ['cpu', 'sockets', 'cores', 'memory', 'ostype', 'name', 'vmid', 'node', 'cluster'];
  if (protectedKeys.includes(key.toLowerCase())) {
    ElMessage.warning("此项配置为核心系统属性，不支持直接删除");
    return;
  }

  try {
    await ElMessageBox.confirm(`确认从虚拟机中移除硬件设备 ${key}？`, "警告", {
      type: "warning",
      confirmButtonText: "确认删除",
      cancelButtonText: "取消"
    });
    
    // PVE 删除配置的标准做法是传 delete=key1,key2...
    await updateVmConfig({
      vm_id: selectedVmId.value,
      config: { delete: key }
    });
    
    ElMessage.success("硬件已移除");
    selectedConfigRow.value = null;
    await loadVmConfig();
  } catch (error: any) {
    if (error !== 'cancel') {
      const msg = error?.response?.data?.message || error?.message || "操作失败";
      ElMessage.error(msg);
    }
  }
};

// 监听抽屉打开，自动刷新配置和概览
watch(configVisible, (newVal) => {
  if (newVal && selectedVmId.value) {
    // 确保默认显示概览标签页
    if (configActiveTab.value !== 'overview') {
      configActiveTab.value = 'overview';
    }
    // 加载数据
    loadVmConfig();
    loadOverview();
    vmRrdFailCount = 0;
    vmRrdHint.value = "";
    stopVmRrdRetry();
    loadVmRrd();
    // 等待 DOM 更新后初始化图表
    nextTick(() => {
      // 使用 setTimeout 确保图表容器已经渲染
      setTimeout(() => {
        console.log("尝试初始化图表，容器状态:", {
          cpu: !!vmCpuChartRef.value,
          memory: !!vmMemoryChartRef.value,
          network: !!vmNetworkChartRef.value,
          disk: !!vmDiskChartRef.value,
          activeTab: configActiveTab.value
        });
        const initSuccess = initVmCharts();
        if (initSuccess) {
          updateVmCharts(); // 立即更新一次图表数据
          resizeVmCharts();
          startVmRrdRefresh();
        } else {
          // 如果初始化失败，再试一次
          setTimeout(() => {
            console.log("重试初始化图表");
            const retrySuccess = initVmCharts();
            if (retrySuccess) {
              updateVmCharts();
              resizeVmCharts();
              startVmRrdRefresh();
            }
          }, 300);
        }
      }, 300); // 增加延迟时间，确保抽屉完全打开
    });
  } else {
    stopVmRrdRefresh();
    stopVmRrdRetry();
    destroyVmCharts();
    vmRrdData.value = null;
    vmRrdHint.value = "";
  }
});

// 加载虚拟机 RRD 数据
const loadVmRrd = async () => {
  if (!selectedVmId.value) return;
  
  rrdLoading.value = true;
  try {
    const res = await fetchVmRrd(selectedVmId.value, 'hour', 'AVERAGE');
    vmRrdData.value = res?.data || null;
    vmRrdFailCount = 0;
    vmRrdHint.value = "";
    stopVmRrdRetry();
    await nextTick();
    updateVmCharts();
  } catch (error) {
    // 新建虚拟机通常需要一段时间才会生成 RRD 数据：这里不弹错误，自动重试
    vmRrdFailCount += 1;
    vmRrdData.value = null;
    vmRrdHint.value =
      vmRrdFailCount <= 6
        ? "监控数据生成中（新建虚拟机可能需要等待一会），系统将自动刷新…"
        : "暂无监控数据，系统仍将继续自动刷新。";
    console.warn("获取虚拟机监控数据失败（将自动重试）:", error);
    // 立即等待几秒重试一次（比 10s interval 更快让新建 VM 出图）
    scheduleVmRrdRetry(3000);
  } finally {
    rrdLoading.value = false;
  }
};

// 初始化虚拟机图表
const initVmCharts = () => {
  // 等待 DOM 元素准备好
  if (!vmCpuChartRef.value || !vmMemoryChartRef.value || !vmNetworkChartRef.value || !vmDiskChartRef.value) {
    console.warn("图表容器未准备好:", {
      cpu: !!vmCpuChartRef.value,
      memory: !!vmMemoryChartRef.value,
      network: !!vmNetworkChartRef.value,
      disk: !!vmDiskChartRef.value
    });
    return false;
  }
  
  console.log("开始初始化虚拟机图表");
  
  // CPU 使用率图表
  if (!vmCpuChartInstance) {
    vmCpuChartInstance = echarts.init(vmCpuChartRef.value);
  }
  vmCpuChartInstance.setOption({
    title: { text: 'CPU Usage', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: '%', max: 100 },
    series: [{ name: 'CPU Usage', type: 'line', smooth: true, data: [] }],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  });
  
  // 内存使用率图表
  if (!vmMemoryChartInstance) {
    vmMemoryChartInstance = echarts.init(vmMemoryChartRef.value);
  }
  vmMemoryChartInstance.setOption({
    title: { text: 'Memory Usage', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: '%', max: 100 },
    series: [{ name: 'Memory Usage', type: 'line', smooth: true, data: [] }],
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true }
  });
  
  // 网络流量图表
  if (!vmNetworkChartInstance) {
    vmNetworkChartInstance = echarts.init(vmNetworkChartRef.value);
  }
  vmNetworkChartInstance.setOption({
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
  
  // 磁盘 IO 图表
  if (!vmDiskChartInstance) {
    vmDiskChartInstance = echarts.init(vmDiskChartRef.value);
  }
  vmDiskChartInstance.setOption({
    title: { text: 'Disk IO', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', boundaryGap: false },
    yAxis: { type: 'value', name: 'Bytes/s' },
    series: [
      { name: 'Disk Read', type: 'line', smooth: true, data: [] },
      { name: 'Disk Write', type: 'line', smooth: true, data: [] }
    ],
    grid: { left: '3%', right: '4%', bottom: '15%', top: '15%', containLabel: true },
    legend: { data: ['Disk Read', 'Disk Write'], bottom: '5%', itemGap: 20 }
  });
  
  console.log("虚拟机图表初始化完成");
  return true;
};

// 更新虚拟机图表数据
const updateVmCharts = () => {
  if (!vmRrdData.value) {
    console.warn("更新图表数据：RRD 数据为空");
    return;
  }
  
  // 兼容后端返回的数据结构：
  // 1) data 为数组
  // 2) data 为对象，内部包含 data 数组
  const extractRecords = (rrd: any) => {
    if (!rrd) return [];
    if (Array.isArray(rrd?.data?.data)) return rrd.data.data;
    if (Array.isArray(rrd?.data)) return rrd.data;
    if (Array.isArray(rrd)) return rrd;
    return [];
  };

  const records = extractRecords(vmRrdData.value);
  console.log("更新图表数据，记录数:", records.length);

  if (!records.length) {
    console.warn("更新图表数据：记录数组为空");
    return;
  }

  const timeData = records.map((r: any) =>
    r.time ? dayjs((r.time as number) * 1000).format("HH:mm:ss") : ""
  );

  // 更新 CPU 图表（cpu 是占比，0-1）
  if (vmCpuChartInstance) {
    const cpuData = records.map((r: any) =>
      typeof r.cpu === "number" ? (r.cpu * 100).toFixed(2) : 0
    );
    vmCpuChartInstance.setOption({
      xAxis: { data: timeData },
      series: [{ data: cpuData }]
    });
  }

  // 更新内存图表（memused/memtotal）
  if (vmMemoryChartInstance) {
    const memData = records.map((r: any) => {
      const used = r.memused ?? r.mem ?? 0;
      const total = r.memtotal ?? r.maxmem ?? vmStatus.value?.maxmem ?? 0;
      if (!total) return 0;
      return ((used / total) * 100).toFixed(2);
    });
    vmMemoryChartInstance.setOption({
      xAxis: { data: timeData },
      series: [{ data: memData }]
    });
  }

  // 更新网络图表（netin/netout）
  if (vmNetworkChartInstance) {
    const netinData = records.map((r: any) => r.netin ?? 0);
    const netoutData = records.map((r: any) => r.netout ?? 0);
    vmNetworkChartInstance.setOption({
      xAxis: { data: timeData },
      series: [
        { name: "Network In", data: netinData },
        { name: "Network Out", data: netoutData }
      ]
    });
  }

  // 更新磁盘 IO 图表（diskread/diskwrite）
  if (vmDiskChartInstance) {
    const diskreadData = records.map((r: any) => r.diskread ?? 0);
    const diskwriteData = records.map((r: any) => r.diskwrite ?? 0);
    vmDiskChartInstance.setOption({
      xAxis: { data: timeData },
      series: [
        { name: "Disk Read", data: diskreadData },
        { name: "Disk Write", data: diskwriteData }
      ]
    });
  }
};

// 启动虚拟机 RRD 数据自动刷新
const startVmRrdRefresh = () => {
  if (vmRrdRefreshTimer) return;
  vmRrdRefreshTimer = window.setInterval(() => {
    if (configVisible.value && configActiveTab.value === 'overview' && selectedVmId.value) {
      loadVmRrd();
    }
  }, 10000); // 每10秒刷新一次
};

// 停止虚拟机 RRD 数据自动刷新
const stopVmRrdRefresh = () => {
  if (vmRrdRefreshTimer) {
    clearInterval(vmRrdRefreshTimer);
    vmRrdRefreshTimer = null;
  }
};

// 销毁虚拟机图表
const destroyVmCharts = () => {
  if (vmCpuChartInstance) {
    vmCpuChartInstance.dispose();
    vmCpuChartInstance = null;
  }
  if (vmMemoryChartInstance) {
    vmMemoryChartInstance.dispose();
    vmMemoryChartInstance = null;
  }
  if (vmNetworkChartInstance) {
    vmNetworkChartInstance.dispose();
    vmNetworkChartInstance = null;
  }
  if (vmDiskChartInstance) {
    vmDiskChartInstance.dispose();
    vmDiskChartInstance = null;
  }
};

// 监听标签页切换，切换到概览时刷新数据
watch(configActiveTab, (newTab) => {
  console.log("标签页切换:", newTab);
  if (newTab === 'overview' && selectedVmId.value && configVisible.value) {
    loadOverview();
    loadVmRrd();
    nextTick(() => {
      // 使用 setTimeout 确保图表容器已经渲染
      setTimeout(() => {
        console.log("切换到概览，尝试初始化图表");
        const initSuccess = initVmCharts();
        if (initSuccess) {
          updateVmCharts(); // 立即更新一次图表数据
          resizeVmCharts();
          startVmRrdRefresh();
        } else {
          // 如果初始化失败，再试一次
          setTimeout(() => {
            console.log("重试初始化图表");
            const retrySuccess = initVmCharts();
            if (retrySuccess) {
              updateVmCharts();
              resizeVmCharts();
              startVmRrdRefresh();
            }
          }, 300);
        }
      }, 300); // 增加延迟时间
    });
  } else {
    stopVmRrdRefresh();
  }
});

// 格式化字节
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

const getRowClassName = ({ row }: { row: VmConfigItem }) => {
  return row.pending ? 'config-row-pending' : '';
};


onMounted(async () => {
  await loadBaseData();
  await handleSearch();
});

onUnmounted(() => {
  stopVmRrdRefresh();
  destroyVmCharts();
});
</script>

<template>
  <div class="pve-page">
    <el-card shadow="never">
      <template #header>
        <div class="flex items-center justify-between">
          <span class="text-base font-medium">{{ t('pve.vm.title') }}</span>
          <el-button type="primary" size="small" @click="handleOpenCreate">
            {{ t('pve.vm.createVm') }}
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

        <el-select
          v-model="selectedNodeName"
          class="w-48"
          clearable
          filterable
          :placeholder="t('pve.common.pleaseSelect') + t('pve.node.nodeName')"
        >
          <el-option
            v-for="item in filteredNodes"
            :key="item.id"
            :label="item.node_name"
            :value="item.node_name"
          />
        </el-select>

        <el-input
          v-model="hostnameKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.vm.vmName')"
        />

        <el-input
          v-model="ipKeyword"
          class="w-64"
          clearable
          :placeholder="t('pve.vm.nodeIp')"
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
        @row-click="handleRowClick"
      >
        <el-table-column prop="id" label="ID" min-width="80" />
        <el-table-column prop="vm_name" :label="t('pve.common.name')" min-width="180">
          <template #default="{ row }">
            <div class="flex items-center gap-2">
              <component
                v-if="row.is_template === 1"
                :is="useRenderIcon('ep:document')"
                class="text-blue-500"
                style="width: 16px; height: 16px;"
              />
              <component
                v-else
                :is="useRenderIcon('ep:monitor')"
                class="text-green-500"
                style="width: 16px; height: 16px;"
              />
              <span>{{ row.vm_name }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column prop="node_name" :label="t('pve.vm.nodeName')" min-width="140" />
        <el-table-column prop="cluster_name" :label="t('pve.vm.clusterName')" min-width="140" />
        <el-table-column prop="status" :label="t('pve.common.status')" width="100">
          <template #default="{ row }">
            <el-tag 
              :type="row.status === 'running' ? 'success' : row.status === 'stopped' ? 'info' : 'warning'" 
              size="small"
            >
              {{ row.status === 'running' ? t('pve.vm.running') : row.status === 'stopped' ? t('pve.vm.stopped') : row.status }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="cpu_num" :label="t('pve.vm.cpuNum')" width="100" />
        <el-table-column prop="memory_size" :label="t('pve.vm.memorySize')" width="110" />
        <el-table-column prop="vmid" label="VMID" min-width="160" />
        <el-table-column prop="node_ip" :label="t('pve.vm.nodeIp')" min-width="140" />
        <el-table-column :label="t('pve.common.operate')" width="260" fixed="right">
          <template #default="{ row }">
            <div class="flex items-center gap-0.5 flex-wrap">
              <el-button
                v-if="row.status !== 'running'"
                type="success"
                link
                size="small"
                @click.stop="handleStartVm(row)"
              >
                {{ t('pve.vm.powerOn') }}
              </el-button>
              <el-button
                v-if="row.status === 'running'"
                type="warning"
                link
                size="small"
                @click.stop="handleStopVm(row)"
              >
                {{ t('pve.vm.shutdown') }}
              </el-button>
              <!-- Console 按钮：放在开关机之后 -->
              <el-button
                type="primary"
                link
                size="small"
                @click.stop="handleConsoleLogin(row)"
              >
                {{ t('pve.common.consoleLogin') }}
              </el-button>
              <el-button
                type="primary"
                link
                size="small"
                @click.stop="handleMigrateVm(row)"
              >
                {{ t('pve.vm.migrate') }}
              </el-button>
              <el-dropdown @command="(cmd) => handleMoreAction(cmd, row)" trigger="click">
                <el-button type="info" link size="small" @click.stop>
                  {{ t('pve.common.more') }}
                  <el-icon class="el-icon--right"><component :is="ArrowDownIcon" /></el-icon>
                </el-button>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item command="backend">{{ t('pve.common.backendLogin') }}</el-dropdown-item>
                    <el-dropdown-item command="delete" divided>{{ t('pve.vm.destroy') ?? t('pve.common.delete') }}</el-dropdown-item>
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
          @current-change="handlePageChange"
          @size-change="handlePageSizeChange"
        />
      </div>
    </el-card>

    <el-drawer
      v-model="detailVisible"
      :title="t('pve.vm.vmDetail')"
      size="40%"
      :destroy-on-close="true"
    >
      <el-skeleton v-if="detailLoading" animated :rows="8" />
      <div v-else-if="detailData">
        <el-tabs v-model="detailActiveTab">
          <el-tab-pane label="基本信息" name="info">
            <div class="space-y-2 text-sm mt-4">
              <div><strong>ID：</strong>{{ detailData.id }}</div>
              <div><strong>{{ t('pve.common.name') }}：</strong>{{ detailData.vm_name }}</div>
              <div><strong>{{ t('pve.vm.nodeName') }}：</strong>{{ detailData.node_name }}</div>
              <div><strong>{{ t('pve.vm.clusterName') }}：</strong>{{ detailData.cluster_name }}</div>
              <div><strong>{{ t('pve.common.status') }}：</strong>{{ detailData.status }}</div>
              <div><strong>{{ t('pve.vm.cpuNum') }}：</strong>{{ detailData.cpu_num }}</div>
              <div><strong>{{ t('pve.vm.memorySize') }}：</strong>{{ detailData.memory_size }} MB</div>
              <div><strong>VMID：</strong>{{ detailData.vmid }}</div>
              <div><strong>{{ t('pve.vm.templateName') }}：</strong>{{ detailData.template_name }}</div>
              <div><strong>{{ t('pve.vm.nodeIp') }}：</strong>{{ detailData.node_ip }}</div>
            </div>
          </el-tab-pane>
          <el-tab-pane label="备份" name="backup">
            <div class="mt-4">
              <div class="mb-4 flex justify-between items-center">
                <span class="text-base font-medium">备份管理</span>
                <el-button type="primary" size="small" @click="handleOpenBackup">
                  创建备份
                </el-button>
              </div>
              
              <el-table
                v-loading="backupListLoading"
                :data="backupList"
                border
                stripe
                size="small"
                style="width: 100%"
              >
                <el-table-column prop="volid" label="备份文件" min-width="300">
                  <template #default="{ row }">
                    <span>{{ row.volid }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="size" label="大小" width="120">
                  <template #default="{ row }">
                    {{ formatBytes(row.size) }}
                  </template>
                </el-table-column>
                <el-table-column prop="ctime" label="创建时间" width="180">
                  <template #default="{ row }">
                    {{ row.ctime ? dayjs(row.ctime * 1000).format('YYYY-MM-DD HH:mm:ss') : '-' }}
                  </template>
                </el-table-column>
              </el-table>
              
              <el-empty v-if="!backupListLoading && backupList.length === 0" description="暂无备份" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 创建备份对话框 -->
    <el-dialog
      v-model="backupVisible"
      title="创建备份"
      width="500px"
      :destroy-on-close="true"
    >
      <el-form :model="backupForm" label-width="120px">
        <el-form-item label="存储" required>
          <el-select
            v-model="backupForm.storage"
            class="w-full"
            filterable
            :placeholder="t('pve.common.pleaseSelect')"
            @change="() => { if (detailData) loadBackupList(detailData); }"
          >
            <el-option
              v-for="storage in backupStorages"
              :key="storage.storage_name"
              :label="storage.storage_name"
              :value="storage.storage_name"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="压缩格式">
          <el-select v-model="backupForm.compress" class="w-full">
            <el-option label="zst (推荐)" value="zst" />
            <el-option label="gz" value="gz" />
            <el-option label="lzo" value="lzo" />
            <el-option label="无压缩" value="none" />
          </el-select>
        </el-form-item>
        <el-form-item label="备份模式">
          <el-select v-model="backupForm.mode" class="w-full">
            <el-option label="快照模式" value="snapshot" />
            <el-option label="挂起模式" value="suspend" />
            <el-option label="停止模式" value="stop" />
          </el-select>
        </el-form-item>
        <el-form-item label="最大保留文件数">
          <el-input-number
            v-model="backupForm.maxfiles"
            :min="1"
            :max="100"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="backupVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="backupLoading" @click="handleCreateBackup">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 创建虚拟机向导（Proxmox 风格） -->
    <el-dialog
      v-model="createVmDialogVisible"
      title="Create: Virtual Machine"
      width="90%"
      :close-on-click-modal="false"
      :destroy-on-close="true"
      style="max-width: 1200px;"
      :show-close="true"
    >
      <template #header>
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
          <span style="font-size: 18px; font-weight: 600; color: var(--el-color-primary);">Create: Virtual Machine</span>
        </div>
      </template>
      <CreateVmWizard
        @close="createVmDialogVisible = false"
        @success="handleCreateSuccess"
      />
    </el-dialog>

    <!-- 虚拟机迁移 -->
    <el-dialog
      v-model="migrateVisible"
      :title="t('pve.vm.migrateVm')"
      width="520px"
      :destroy-on-close="true"
    >
      <el-form label-width="140px" label-position="right">
        <el-form-item :label="t('pve.vm.vmName')">
          <span>{{ migrateForm.vm_name || '-' }}</span>
        </el-form-item>

        <el-form-item :label="t('pve.vm.targetNode')" required>
          <el-select
            v-model="migrateForm.target_node_id"
            class="w-full"
            filterable
            :placeholder="t('pve.common.pleaseSelect')"
            :loading="targetNodeStatusLoading"
          >
            <el-option
              v-for="item in migrateTargetNodes"
              :key="item.id"
              :label="item.node_name"
              :value="item.id"
            />
          </el-select>
          <div v-if="targetNodeStatus && migrateForm.target_node_id" class="mt-2 text-sm text-gray-600">
            <div v-if="targetNodeStatus.cpu !== undefined">
              {{ t('pve.vm.cpuUsage') }}: {{ Math.round((targetNodeStatus.cpu || 0) * 100) }}%
            </div>
            <div v-if="targetNodeStatus.memory_total && targetNodeStatus.memory_total > 0">
              {{ t('pve.vm.memUsage') }}: {{ Math.round((targetNodeStatus.memory || 0) * 100) }}% 
              ({{ formatBytes(targetNodeStatus.memory_used || 0) }} / {{ formatBytes(targetNodeStatus.memory_total) }})
            </div>
          </div>
        </el-form-item>

        <el-form-item :label="t('pve.vm.bandwidthLimit') + '(Mbps)'">
          <el-input-number
            v-model="migrateForm.bwlimit"
            :min="1"
            :max="100000"
            :step="100"
            style="width: 200px;"
          />
        </el-form-item>

        <el-form-item :label="t('pve.vm.onlineMigration')">
          <el-switch v-model="migrateForm.online" />
        </el-form-item>

        <el-form-item :label="t('pve.vm.withLocalDisks')">
          <el-switch v-model="migrateForm.with_local_disks" />
        </el-form-item>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="migrateVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="migrateLoading" @click="handleSubmitMigrate">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Console（noVNC） -->
    <VmConsoleDialog
      v-model="consoleVisible"
      :title="`${t('pve.common.consoleLogin')} - ${consoleVm?.vm_name || consoleVm?.id || ''}`"
      :ws-url="consoleWsUrl"
      :password="consolePassword"
      :loading="consoleLoading"
      :guest-running="consoleGuestRunning"
      :start-loading="consoleStartLoading"
      @refresh="refreshConsole"
      @start="handleConsoleStartNow"
    />

    <!-- 虚拟机配置抽屉 -->
    <el-drawer
      v-model="configVisible"
      :title="t('pve.vm.vmConfig')"
      size="60%"
      :destroy-on-close="true"
      direction="rtl"
    >
      <el-skeleton v-if="configLoading" animated :rows="10" />
      <div v-else class="vm-config-container">
        <!-- 操作栏已移除 -->

        <el-tabs v-model="configActiveTab" class="config-tabs" @tab-change="handleConfigTabChange">
          <el-tab-pane :label="t('pve.vm.overview')" name="overview">
            <div class="overview-wrapper">
              <el-skeleton v-if="overviewLoading" animated :rows="8" />
              <div v-else class="overview-content">
                <!-- 基本信息 -->
                <el-card shadow="never" class="overview-card">
                  <template #header>
                    <span class="card-title">{{ t('pve.vm.basicInfo') }}</span>
                  </template>
                  <div v-if="vmBasicInfo" class="info-grid">
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.vmName') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.vm_name }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.vmId') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.id }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">VMID：</span>
                      <span class="info-value">{{ vmBasicInfo.vmid }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.clusterName') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.cluster_name }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.nodeName') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.node_name }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.cpuNum') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.cpu_num }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.memorySize') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.memory_size }} MB</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.common.status') }}：</span>
                      <el-tag :type="vmBasicInfo.status === 'running' ? 'success' : 'info'">
                        {{ vmBasicInfo.status }}
                      </el-tag>
                    </div>
                    <div v-if="vmBasicInfo.description" class="info-item full-width">
                      <span class="info-label">{{ t('pve.common.description') }}：</span>
                      <span class="info-value">{{ vmBasicInfo.description }}</span>
                    </div>
                  </div>
                  <el-empty v-else :description="t('pve.common.noData')" />
                </el-card>

                <!-- 状态信息 -->
                <el-card shadow="never" class="overview-card">
                  <template #header>
                    <span class="card-title">{{ t('pve.vm.statusInfo') }}</span>
                  </template>
                  <div v-if="vmStatus" class="info-grid">
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.common.status') }}：</span>
                      <el-tag :type="vmStatus.status === 'running' ? 'success' : 'info'">
                        {{ vmStatus.status }}
                      </el-tag>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.haState') }}：</span>
                      <span class="info-value">
                        {{ vmStatus.ha?.managed === 1 ? 'Managed' : 'Not Managed' }}
                      </span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.nodeName') }}：</span>
                      <span class="info-value">{{ vmBasicInfo?.node_name || '-' }}</span>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.qemuVersion') }}：</span>
                      <span class="info-value">{{ vmStatus['running-qemu'] || '-' }}</span>
                    </div>
                    <div class="info-item full-width">
                      <span class="info-label">{{ t('pve.vm.cpuUsage') }}：</span>
                      <div class="info-value">
                        <el-progress
                          :percentage="Math.round((vmStatus.cpu || 0) * 100)"
                          :color="getProgressColor(Math.round((vmStatus.cpu || 0) * 100))"
                          style="flex: 1; max-width: 300px;"
                        />
                        <span style="margin-left: 8px;">{{ Math.round((vmStatus.cpu || 0) * 100) }}%</span>
                      </div>
                    </div>
                    <div class="info-item full-width">
                      <span class="info-label">{{ t('pve.vm.memUsage') }}：</span>
                      <div class="info-value">
                        <el-progress
                          :percentage="Math.round(((vmStatus.maxmem - vmStatus.freemem) / vmStatus.maxmem) * 100)"
                          :color="getProgressColor(Math.round(((vmStatus.maxmem - vmStatus.freemem) / vmStatus.maxmem) * 100))"
                          style="flex: 1; max-width: 300px;"
                        />
                        <span style="margin-left: 8px;">
                          {{ formatBytes(vmStatus.mem) }} / {{ formatBytes(vmStatus.maxmem) }}
                          ({{ Math.round(((vmStatus.maxmem - vmStatus.freemem) / vmStatus.maxmem) * 100) }}%)
                        </span>
                      </div>
                    </div>
                    <div class="info-item full-width">
                      <span class="info-label">{{ t('pve.vm.storage') }}：</span>
                      <div class="info-value">
                        <el-progress
                          :percentage="Math.round((vmStatus.disk / vmStatus.maxdisk) * 100)"
                          :color="getProgressColor(Math.round((vmStatus.disk / vmStatus.maxdisk) * 100))"
                          style="flex: 1; max-width: 300px;"
                        />
                        <span style="margin-left: 8px;">
                          {{ formatBytes(vmStatus.disk) }} / {{ formatBytes(vmStatus.maxdisk) }}
                          ({{ Math.round((vmStatus.disk / vmStatus.maxdisk) * 100) }}%)
                        </span>
                      </div>
                    </div>
                    <div class="info-item">
                      <span class="info-label">{{ t('pve.vm.uptime') }}：</span>
                      <span class="info-value">{{ formatUptime(vmStatus.uptime) }}</span>
                    </div>
                  </div>
                  <el-empty v-else :description="t('pve.common.noData')" />
                </el-card>

                <!-- 监控图表 -->
                <el-card shadow="never" class="overview-card">
                  <template #header>
                    <span class="card-title">{{ t('pve.vm.monitoring') }}</span>
                  </template>
                  <div v-loading="rrdLoading" class="charts-wrapper">
                    <div class="chart-item">
                      <div ref="vmCpuChartRef" class="chart-container" style="min-height: 300px;"></div>
                    </div>
                    <div class="chart-item">
                      <div ref="vmMemoryChartRef" class="chart-container" style="min-height: 300px;"></div>
                    </div>
                    <div class="chart-item">
                      <div ref="vmNetworkChartRef" class="chart-container" style="min-height: 300px;"></div>
                    </div>
                    <div class="chart-item">
                      <div ref="vmDiskChartRef" class="chart-container" style="min-height: 300px;"></div>
                    </div>
                    <div v-if="!vmRrdData && !rrdLoading" class="chart-empty">
                      <el-empty :description="vmRrdHint || t('pve.common.noData')" />
                    </div>
                  </div>
                </el-card>
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('pve.vm.hardwareConfig')" name="hardware">
            <div class="config-table-wrapper">
              <div class="mb-4 flex items-center gap-2">
                <el-dropdown trigger="click" @command="handleOpenAddHardware">
                  <el-button type="primary">
                    Add<el-icon class="el-icon--right"><ArrowDownIcon /></el-icon>
                  </el-button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="disk">Hard Disk</el-dropdown-item>
                      <el-dropdown-item command="cdrom">CD/DVD Drive</el-dropdown-item>
                      <el-dropdown-item command="net">Network Device</el-dropdown-item>
                      <el-dropdown-item command="cloudinit" divided>CloudInit Drive</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>
                <el-button type="danger" plain :disabled="!selectedConfigRow" @click="handleRemoveHardware">
                  Remove
                </el-button>
                <el-button type="primary" plain :disabled="!selectedConfigRow" @click="handleEditConfig(selectedConfigRow!)">
                  Edit
                </el-button>
              </div>
              <el-table
                :data="configItems"
                border
                stripe
                highlight-current-row
                style="width: 100%"
                :row-class-name="getRowClassName"
                @current-change="(row: VmConfigItem) => selectedConfigRow = row"
              >
                <el-table-column prop="key" :label="t('pve.vm.configKey')" min-width="200">
                  <template #default="{ row }">
                    <span :class="{ 'config-key-pending': row.pending }">{{ row.key }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="value" :label="t('pve.vm.configValue')" min-width="400">
                  <template #default="{ row }">
                    <div v-if="row.pending" class="config-value-compare">
                      <div class="config-value-original">
                        <span class="config-label">{{ t('pve.vm.currentValue') }}：</span>
                        <span class="config-value-text">{{ row.value }}</span>
                      </div>
                      <div class="config-value-pending-item">
                        <span class="config-label">{{ t('pve.vm.pendingValue') }}：</span>
                        <span class="config-value-text config-value-pending">{{ row.pendingValue }}</span>
                      </div>
                    </div>
                    <span v-else class="config-value-text">
                      {{ row.value }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('pve.common.operate')" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="handleEditConfig(row)">
                      {{ t('pve.common.edit') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              
              <div v-if="configItems.length === 0" class="config-empty">
                <el-empty :description="t('pve.common.noData')" />
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('pve.vm.cloudinitConfig')" name="cloudinit">
            <div class="config-table-wrapper">
              <div class="mb-4 flex items-center gap-2">
                <el-button type="primary" plain :disabled="!hasCloudinitDevice || !selectedCloudinitRow" @click="handleEditCloudinitConfig">
                  {{ t('pve.common.edit') }}
                </el-button>
                <el-button type="primary" plain :disabled="!hasCloudinitDevice" @click="handleRegenerateCloudinitImage">
                  {{ t('pve.vm.regenerateImage') }}
                </el-button>
              </div>
              <el-table
                :data="cloudinitConfigItems"
                border
                stripe
                highlight-current-row
                style="width: 100%"
                :row-class-name="getRowClassName"
                @current-change="(row: VmConfigItem) => selectedCloudinitRow = row"
              >
                <el-table-column prop="key" :label="t('pve.vm.configKey')" min-width="200">
                  <template #default="{ row }">
                    <span :class="{ 'config-key-pending': row.pending }">{{ getCloudinitConfigDisplayName(row.key) }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="value" :label="t('pve.vm.configValue')" min-width="400">
                  <template #default="{ row }">
                    <div v-if="row.pending" class="config-value-compare">
                      <div class="config-value-original">
                        <span class="config-label">{{ t('pve.vm.currentValue') }}：</span>
                        <span class="config-value-text">
                          {{ row.key === 'cipassword' ? '**********' : (row.key === 'ciupgrade' ? (row.value === '1' ? 'Yes' : 'No') : (row.key === 'dnsconfig' ? formatDnsConfigDisplay() : (isIpConfigKey(row.key) ? formatIpConfigDisplay(row.value) : row.value))) }}
                        </span>
                      </div>
                      <div class="config-value-pending-item">
                        <span class="config-label">{{ t('pve.vm.pendingValue') }}：</span>
                        <span class="config-value-text config-value-pending">
                          {{ row.key === 'cipassword' ? '**********' : (row.key === 'ciupgrade' ? (row.pendingValue === '1' ? 'Yes' : 'No') : (row.key === 'dnsconfig' ? formatDnsConfigDisplay() : (isIpConfigKey(row.key) ? formatIpConfigDisplay(row.pendingValue) : row.pendingValue))) }}
                        </span>
                      </div>
                    </div>
                    <span v-else class="config-value-text">
                      {{ row.key === 'cipassword' ? '**********' : (row.key === 'ciupgrade' ? (row.value === '1' ? 'Yes' : 'No') : (row.key === 'dnsconfig' ? formatDnsConfigDisplay() : (isIpConfigKey(row.key) ? formatIpConfigDisplay(row.value) : row.value))) }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('pve.common.operate')" width="120" fixed="right">
                  <template #default="{ row }">
                    <el-button 
                      v-if="isIpConfigKey(row.key)"
                      type="primary" 
                      link 
                      size="small" 
                      @click="handleOpenIpConfig(row)"
                    >
                      {{ t('pve.common.edit') }}
                    </el-button>
                    <el-button 
                      v-else-if="row.key === 'dnsconfig' || row.key === 'searchdomain' || row.key === 'nameserver'"
                      type="primary" 
                      link 
                      size="small" 
                      @click="handleOpenDnsConfig(row)"
                    >
                      {{ t('pve.common.edit') }}
                    </el-button>
                    <el-button 
                      v-else-if="row.key === 'sshkeys'"
                      type="primary" 
                      link 
                      size="small" 
                      @click="handleOpenSshKeyConfig(row)"
                    >
                      {{ t('pve.common.edit') }}
                    </el-button>
                    <el-button 
                      v-else-if="row.key === 'ciupgrade'"
                      type="primary" 
                      link 
                      size="small" 
                      @click="handleOpenUpgradeConfig(row)"
                    >
                      {{ t('pve.common.edit') }}
                    </el-button>
                    <el-button 
                      v-else
                      type="primary" 
                      link 
                      size="small" 
                      :disabled="!hasCloudinitDevice"
                      @click="handleEditConfig(row)"
                    >
                      {{ t('pve.common.edit') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              
              <div v-if="!hasCloudinitDevice" class="config-empty">
                <el-empty :description="t('pve.vm.noCloudinitDevice')" />
              </div>
              <div v-else-if="cloudinitConfigItems.length === 0" class="config-empty">
                <el-empty :description="t('pve.common.noData')" />
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('pve.vm.optionsConfig')" name="options">
            <div class="config-table-wrapper">
              <el-table
                :data="optionsConfigItems"
                border
                stripe
                style="width: 100%"
                :row-class-name="getRowClassName"
              >
                <el-table-column prop="key" :label="t('pve.vm.configKey')" min-width="200">
                  <template #default="{ row }">
                    <span :class="{ 'config-key-pending': row.pending }">{{ row.key }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="value" :label="t('pve.vm.configValue')" min-width="400">
                  <template #default="{ row }">
                    <div v-if="row.pending" class="config-value-compare">
                      <div class="config-value-original">
                        <span class="config-label">{{ t('pve.vm.currentValue') }}：</span>
                        <span class="config-value-text">{{ row.value }}</span>
                      </div>
                      <div class="config-value-pending-item">
                        <span class="config-label">{{ t('pve.vm.pendingValue') }}：</span>
                        <span class="config-value-text config-value-pending">{{ row.pendingValue }}</span>
                      </div>
                    </div>
                    <span v-else class="config-value-text">
                      {{ row.value }}
                    </span>
                  </template>
                </el-table-column>
                <el-table-column :label="t('pve.common.operate')" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button type="primary" link size="small" @click="handleEditConfig(row)">
                      {{ t('pve.common.edit') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              
              <div v-if="optionsConfigItems.length === 0" class="config-empty">
                <el-empty :description="t('pve.common.noData')" />
              </div>
            </div>
          </el-tab-pane>
          <el-tab-pane :label="t('pve.vm.backup')" name="backup">
            <div class="mt-4">
              <div class="mb-4 flex items-center gap-3 flex-wrap">
                <el-button type="primary" size="small" @click="handleOpenBackupTab">
                  {{ t('pve.vm.backupNow') }}
                </el-button>
                <div class="flex items-center gap-2 flex-1 min-w-0">
                  <span class="text-sm text-gray-600 whitespace-nowrap">{{ t('pve.template.storage') }}：</span>
                  <el-select
                    v-model="backupTabForm.storage"
                    class="flex-1 min-w-0"
                    filterable
                    :placeholder="t('pve.common.pleaseSelect')"
                    @change="() => { if (vmBasicInfo) loadBackupTabList(vmBasicInfo); }"
                  >
                    <el-option
                      v-for="storage in backupTabStorages"
                      :key="storage.storage_name"
                      :label="storage.storage_name"
                      :value="storage.storage_name"
                    />
                  </el-select>
                </div>
              </div>
              
              <el-table
                v-loading="backupTabListLoading"
                :data="backupTabList"
                border
                stripe
                size="small"
                style="width: 100%"
                table-layout="auto"
              >
                <el-table-column prop="volid" :label="t('pve.vm.backupFile')" min-width="200" show-overflow-tooltip>
                  <template #default="{ row }">
                    <span>{{ row.volid }}</span>
                  </template>
                </el-table-column>
                <el-table-column prop="size" :label="t('pve.template.fileSize')" width="120" align="right">
                  <template #default="{ row }">
                    {{ formatBytes(row.size) }}
                  </template>
                </el-table-column>
                <el-table-column prop="ctime" :label="t('pve.vm.createTime')" width="180">
                  <template #default="{ row }">
                    {{ row.ctime ? dayjs(row.ctime * 1000).format('YYYY-MM-DD HH:mm:ss') : '-' }}
                  </template>
                </el-table-column>
                <el-table-column :label="t('pve.common.operate')" width="100" fixed="right">
                  <template #default="{ row }">
                    <el-button
                      type="danger"
                      link
                      size="small"
                      @click.stop="handleDeleteBackup(row)"
                    >
                      {{ t('pve.common.remove') }}
                    </el-button>
                  </template>
                </el-table-column>
              </el-table>
              
              <el-empty v-if="!backupTabListLoading && backupTabList.length === 0" :description="t('pve.vm.noBackup')" />
            </div>
          </el-tab-pane>
        </el-tabs>
      </div>
    </el-drawer>

    <!-- 创建备份对话框（配置抽屉中） -->
    <el-dialog
      v-model="backupTabVisible"
      :title="t('pve.vm.createBackup')"
      width="500px"
      :destroy-on-close="true"
    >
      <el-form :model="backupTabForm" label-width="120px">
        <el-form-item :label="t('pve.template.storage')" required>
          <el-select
            v-model="backupTabForm.storage"
            class="w-full"
            filterable
            :placeholder="t('pve.common.pleaseSelect')"
            @change="() => { if (vmBasicInfo) loadBackupTabList(vmBasicInfo); }"
          >
            <el-option
              v-for="storage in backupTabStorages"
              :key="storage.storage_name"
              :label="storage.storage_name"
              :value="storage.storage_name"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.vm.compressFormat')">
          <el-select v-model="backupTabForm.compress" class="w-full">
            <el-option :label="t('pve.vm.compressZst')" value="zst" />
            <el-option :label="t('pve.vm.compressGz')" value="gz" />
            <el-option :label="t('pve.vm.compressLzo')" value="lzo" />
            <el-option :label="t('pve.vm.compressNone')" value="none" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.vm.backupMode')">
          <el-select v-model="backupTabForm.mode" class="w-full">
            <el-option :label="t('pve.vm.backupModeSnapshot')" value="snapshot" />
            <el-option :label="t('pve.vm.backupModeSuspend')" value="suspend" />
            <el-option :label="t('pve.vm.backupModeStop')" value="stop" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('pve.vm.maxFiles')">
          <el-input-number
            v-model="backupTabForm.maxfiles"
            :min="1"
            :max="100"
            style="width: 100%"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="backupTabVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="backupTabLoading" @click="handleCreateBackupTab">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- DNS 配置对话框 -->
    <el-dialog
      v-model="dnsConfigVisible"
      :title="t('pve.vm.editDnsConfig')"
      width="500px"
      :destroy-on-close="true"
    >
      <el-form :model="dnsConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.dnsDomain')">
          <el-input
            v-model="dnsConfigForm.searchdomain"
            :placeholder="t('pve.vm.dnsDomainPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('pve.vm.dnsServers')">
          <el-input
            v-model="dnsConfigForm.nameserver"
            :placeholder="t('pve.vm.dnsServersPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dnsConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="dnsConfigLoading" @click="handleSaveDnsConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- SSH Key 配置对话框 -->
    <el-dialog
      v-model="sshKeyConfigVisible"
      :title="t('pve.vm.editSshKeys')"
      width="600px"
      :destroy-on-close="true"
    >
      <el-form :model="sshKeyConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.sshPublicKey')">
          <el-input
            v-model="sshKeyConfigForm.sshkeys"
            type="textarea"
            :rows="10"
            :placeholder="t('pve.vm.sshPublicKeyPlaceholder')"
          />
          <div class="mt-2">
            <el-button size="small" @click="handleLoadSshKeyFile">
              {{ t('pve.vm.loadSshKeyFile') }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="sshKeyConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="sshKeyConfigLoading" @click="handleSaveSshKeyConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 编辑配置对话框 -->
    <el-dialog
      v-model="editDialogVisible"
      :title="getEditDialogTitle()"
      width="500px"
      :destroy-on-close="true"
    >
      <el-form label-width="100px">
        <el-form-item :label="t('pve.vm.configKey')">
          <el-input v-model="editForm.key" disabled />
        </el-form-item>
        <el-form-item :label="t('pve.vm.configValue')">
          <el-input
            v-model="editForm.value"
            type="textarea"
            :rows="4"
            :placeholder="t('pve.common.pleaseInput')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="editDialogVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" @click="handleSaveConfig">{{ t('pve.common.save') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- 硬件专用编辑对话框 -->
    <el-dialog
      v-model="hardwareEditVisible"
      :title="hardwareEditType === 'cpu' ? 'Edit: Processors' : hardwareEditType === 'scsi' ? 'Edit: SCSI Controller' : hardwareEditType === 'cdrom' ? 'Edit: CD/DVD Drive' : hardwareEditType === 'disk' ? 'Edit: Hard Disk' : 'Edit: Network Device'"
      width="600px"
      :destroy-on-close="true"
    >
      <!-- CPU 编辑 -->
      <el-form v-if="hardwareEditType === 'cpu'" label-width="120px" label-position="right">
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="Sockets:">
              <el-input-number v-model="cpuForm.sockets" :min="1" :max="4" style="width: 100%" />
            </el-form-item>
            <el-form-item label="Cores:">
              <el-input-number v-model="cpuForm.cores" :min="1" :max="128" style="width: 100%" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Type:">
              <el-select v-model="cpuForm.cpu" style="width: 100%">
                <el-option label="Default (kvm64)" value="kvm64" />
                <el-option label="host" value="host" />
              </el-select>
            </el-form-item>
            <el-form-item label="Total cores:">
              <span class="font-bold">{{ cpuForm.sockets * cpuForm.cores }}</span>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <!-- SCSI 控制器编辑 -->
      <el-form v-else-if="hardwareEditType === 'scsi'" label-width="120px">
        <el-form-item label="Type:">
          <el-select v-model="scsiForm.controller" style="width: 100%">
            <el-option label="Default (LSI 53C895A)" value="lsi" />
            <el-option label="VirtIO SCSI" value="virtio-scsi-pci" />
            <el-option label="VirtIO SCSI single" value="virtio-scsi-single" />
            <el-option label="VMware PVSCSI" value="pvscsi" />
          </el-select>
        </el-form-item>
      </el-form>

      <!-- CD/DVD 编辑 -->
      <el-form v-else-if="hardwareEditType === 'cdrom'" label-width="120px">
        <el-form-item label="Bus/Device:">
          <div class="flex gap-2">
            <el-select v-model="cdromForm.busType" :disabled="hardwareAction === 'edit'" style="width: 120px">
              <el-option label="IDE" value="ide" />
              <el-option label="SATA" value="sata" />
              <el-option label="SCSI" value="scsi" />
            </el-select>
            <el-input-number v-model="cdromForm.busIdx" :min="0" :max="31" :disabled="hardwareAction === 'edit'" style="width: 100px" />
          </div>
        </el-form-item>
        <el-radio-group v-model="cdromForm.media" class="mb-5 pl-5 block">
          <el-radio label="iso" class="w-full mb-2">Use CD/DVD disc image file (iso)</el-radio>
          <el-radio label="cdrom" class="w-full mb-2">Use physical CD/DVD Drive</el-radio>
          <el-radio label="none" class="w-full">Do not use any media</el-radio>
        </el-radio-group>
        
        <div v-if="cdromForm.media === 'iso'" class="pl-10">
          <el-form-item label="Storage:">
            <el-select v-model="cdromForm.storage" @change="handleCdromStorageChange" style="width: 100%">
              <el-option v-for="s in nodeStorages" :key="s.storage_name" :label="s.storage_name" :value="s.storage_name" />
            </el-select>
          </el-form-item>
          <el-form-item label="ISO image:">
            <el-select v-model="cdromForm.iso" style="width: 100%">
              <el-option v-for="i in nodeIsos" :key="i.volid" :label="i.volid.split('/').pop()" :value="i.volid" />
            </el-select>
          </el-form-item>
        </div>
      </el-form>

      <!-- 磁盘编辑 -->
      <el-form v-else-if="hardwareEditType === 'disk'" label-width="120px">
        <el-tabs type="border-card">
          <el-tab-pane label="Disk">
            <el-form-item label="Bus/Device:">
              <div class="flex gap-2">
                <el-select v-model="diskForm.busType" :disabled="hardwareAction === 'edit'" style="width: 120px">
                  <el-option label="SCSI" value="scsi" />
                  <el-option label="VirtIO Block" value="virtio" />
                  <el-option label="IDE" value="ide" />
                  <el-option label="SATA" value="sata" />
                </el-select>
                <el-input-number v-model="diskForm.busIdx" :min="0" :max="31" :disabled="hardwareAction === 'edit'" style="width: 100px" />
              </div>
            </el-form-item>
            
            <div v-if="hardwareAction === 'add'">
              <el-form-item label="Storage:">
                <el-select v-model="diskForm.storage" style="width: 100%">
                  <el-option v-for="s in nodeStorages" :key="s.storage_name" :label="s.storage_name" :value="s.storage_name" />
                </el-select>
              </el-form-item>
              <el-form-item label="Disk size (GiB):">
                <el-input-number v-model="diskForm.size" :min="1" :max="10000" style="width: 100%" />
              </el-form-item>
            </div>

            <el-form-item label="Cache:">
              <el-select v-model="diskForm.cache" style="width: 100%">
                <el-option label="Default (No cache)" value="none" />
                <el-option label="Direct sync" value="directsync" />
                <el-option label="Write through" value="writethrough" />
                <el-option label="Write back" value="writeback" />
              </el-select>
            </el-form-item>
            <el-row>
              <el-col :span="12">
                <el-form-item label="Discard:">
                  <el-checkbox v-model="diskForm.discard" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="IO thread:">
                  <el-checkbox v-model="diskForm.iothread" />
                </el-form-item>
              </el-col>
            </el-row>
            <el-row>
              <el-col :span="12">
                <el-form-item label="SSD emulation:">
                  <el-checkbox v-model="diskForm.ssd" />
                </el-form-item>
              </el-col>
              <el-col :span="12">
                <el-form-item label="Read-only:">
                  <el-checkbox v-model="diskForm.ro" />
                </el-form-item>
              </el-col>
            </el-row>
          </el-tab-pane>
          <el-tab-pane label="Advanced">
             <el-form-item label="Async IO:">
              <el-select v-model="diskForm.aio" style="width: 100%">
                <el-option label="Default" value="default" />
                <el-option label="io_uring" value="io_uring" />
                <el-option label="native" value="native" />
                <el-option label="threads" value="threads" />
              </el-select>
            </el-form-item>
            <el-form-item label="Backup:">
              <el-checkbox v-model="diskForm.backup" />
            </el-form-item>
          </el-tab-pane>
        </el-tabs>
      </el-form>

      <!-- 网络编辑 -->
      <el-form v-else-if="hardwareEditType === 'net'" label-width="120px">
        <el-form-item label="Device:">
          <el-input v-model="netForm.device" disabled />
        </el-form-item>
        <el-row :gutter="20">
          <el-col :span="12">
            <el-form-item label="Bridge:">
              <el-input v-model="netForm.bridge" />
            </el-form-item>
            <el-form-item label="VLAN Tag:">
              <el-input-number v-model="netForm.tag" :min="1" :max="4094" style="width: 100%" placeholder="no VLAN" />
            </el-form-item>
            <el-form-item label="Firewall:">
              <el-checkbox v-model="netForm.firewall" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item label="Model:">
              <el-select v-model="netForm.model" style="width: 100%">
                <el-option label="VirtIO (paravirtualized)" value="virtio" />
                <el-option label="Intel E1000" value="e1000" />
                <el-option label="Realtek RTL8139" value="rtl8139" />
                <el-option label="VMware vmxnet3" value="vmxnet3" />
              </el-select>
            </el-form-item>
            <el-form-item label="MAC address:">
              <el-input v-model="netForm.macaddr" placeholder="auto" />
            </el-form-item>
            <el-form-item label="Disconnect:">
              <el-checkbox v-model="netForm.disconnect" />
            </el-form-item>
            <el-form-item label="MTU:">
              <el-input-number v-model="netForm.mtu" :min="1" :max="65535" style="width: 100%" placeholder="auto" />
            </el-form-item>
            <el-form-item label="Multiqueue:">
              <el-input-number v-model="netForm.queues" :min="1" :max="64" style="width: 100%" placeholder="auto" />
            </el-form-item>
            <el-form-item label="Rate limit (MB/s):">
              <el-input-number v-model="netForm.rate" :min="0" :step="0.1" style="width: 100%" placeholder="unlimited" />
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>

      <template #footer>
        <span class="dialog-footer">
          <el-button @click="hardwareEditVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="hardwareLoading" @click="handleSaveHardwareConfig">{{ t('pve.common.save') }}</el-button>
        </span>
      </template>
    </el-dialog>

    <!-- IP 配置对话框 -->
    <el-dialog
      v-model="ipConfigVisible"
      :title="t('pve.vm.editIpConfig')"
      width="600px"
      :destroy-on-close="true"
    >
      <el-form :model="ipConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.networkDevice')">
          <el-input v-model="ipConfigForm.device" :disabled="true" />
        </el-form-item>
        
        <el-divider>{{ t('pve.vm.ipv4Config') }}</el-divider>
        
        <el-form-item :label="t('pve.vm.ipv4Mode')">
          <el-radio-group v-model="ipConfigForm.ipv4_mode">
            <el-radio-button value="static">{{ t('pve.vm.static') }}</el-radio-button>
            <el-radio-button value="dhcp">DHCP</el-radio-button>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="ipConfigForm.ipv4_mode === 'static'" :label="t('pve.vm.ipv4Cidr')">
          <el-input
            v-model="ipConfigForm.ipv4_address"
            :placeholder="t('pve.vm.ipv4CidrPlaceholder')"
          />
        </el-form-item>
        
        <el-form-item v-if="ipConfigForm.ipv4_mode === 'static'" :label="t('pve.vm.ipv4Gateway')">
          <el-input
            v-model="ipConfigForm.ipv4_gateway"
            :placeholder="t('pve.vm.ipv4GatewayPlaceholder')"
          />
        </el-form-item>
        
        <el-divider>{{ t('pve.vm.ipv6Config') }}</el-divider>
        
        <el-form-item :label="t('pve.vm.ipv6Mode')">
          <el-radio-group v-model="ipConfigForm.ipv6_mode">
            <el-radio-button value="static">{{ t('pve.vm.static') }}</el-radio-button>
            <el-radio-button value="dhcp">DHCP</el-radio-button>
            <el-radio-button value="slaac">SLAAC</el-radio-button>
          </el-radio-group>
        </el-form-item>
        
        <el-form-item v-if="ipConfigForm.ipv6_mode === 'static'" :label="t('pve.vm.ipv6Cidr')">
          <el-input
            v-model="ipConfigForm.ipv6_address"
            :placeholder="t('pve.vm.ipv6CidrPlaceholder')"
          />
        </el-form-item>
        
        <el-form-item v-if="ipConfigForm.ipv6_mode === 'static'" :label="t('pve.vm.ipv6Gateway')">
          <el-input
            v-model="ipConfigForm.ipv6_gateway"
            :placeholder="t('pve.vm.ipv6GatewayPlaceholder')"
          />
        </el-form-item>
      </el-form>
      
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="ipConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="ipConfigLoading" @click="handleSaveIpConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- DNS 配置对话框 -->
    <el-dialog
      v-model="dnsConfigVisible"
      :title="t('pve.vm.editDnsConfig')"
      width="500px"
      :destroy-on-close="true"
    >
      <el-form :model="dnsConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.dnsDomain')">
          <el-input
            v-model="dnsConfigForm.searchdomain"
            :placeholder="t('pve.vm.dnsDomainPlaceholder')"
          />
        </el-form-item>
        <el-form-item :label="t('pve.vm.dnsServers')">
          <el-input
            v-model="dnsConfigForm.nameserver"
            :placeholder="t('pve.vm.dnsServersPlaceholder')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="dnsConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="dnsConfigLoading" @click="handleSaveDnsConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- SSH Key 配置对话框 -->
    <el-dialog
      v-model="sshKeyConfigVisible"
      :title="t('pve.vm.editSshKeys')"
      width="600px"
      :destroy-on-close="true"
    >
      <el-form :model="sshKeyConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.sshPublicKey')">
          <el-input
            v-model="sshKeyConfigForm.sshkeys"
            type="textarea"
            :rows="10"
            :placeholder="t('pve.vm.sshPublicKeyPlaceholder')"
          />
          <div class="mt-2">
            <el-button size="small" @click="handleLoadSshKeyFile">
              {{ t('pve.vm.loadSshKeyFile') }}
            </el-button>
          </div>
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="sshKeyConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="sshKeyConfigLoading" @click="handleSaveSshKeyConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
    </el-dialog>

    <!-- Upgrade packages 配置对话框 -->
    <el-dialog
      v-model="upgradeConfigVisible"
      :title="t('pve.vm.editUpgradePackages')"
      width="400px"
      :destroy-on-close="true"
    >
      <el-form :model="upgradeConfigForm" label-width="140px">
        <el-form-item :label="t('pve.vm.upgradePackages')">
          <el-checkbox v-model="upgradeConfigForm.ciupgrade" />
        </el-form-item>
      </el-form>
      <template #footer>
        <span class="dialog-footer">
          <el-button @click="upgradeConfigVisible = false">{{ t('pve.common.cancel') }}</el-button>
          <el-button type="primary" :loading="upgradeConfigLoading" @click="handleSaveUpgradeConfig">
            {{ t('pve.common.confirm') }}
          </el-button>
        </span>
      </template>
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

.vm-config-container {
  padding: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.config-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid var(--el-border-color);
  background-color: var(--el-bg-color-page);
}

.toolbar-left {
  display: flex;
  gap: 8px;
}

.toolbar-right {
  display: flex;
  align-items: center;
}

.config-table-wrapper {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
}

.config-value-text {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 13px;
  word-break: break-all;
}

.config-key-pending {
  color: var(--el-color-danger);
  font-weight: 600;
}

.config-value-compare {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 0;
}

.config-value-original {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 8px;
  background-color: var(--el-fill-color-lighter);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-info);
}

.config-value-pending-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 4px 8px;
  background-color: var(--el-color-danger-light-9);
  border-radius: 4px;
  border-left: 3px solid var(--el-color-danger);
}

.config-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  font-weight: 500;
  min-width: 60px;
  flex-shrink: 0;
}

.config-value-pending {
  color: var(--el-color-danger);
  font-weight: 600;
}

:deep(.el-table .config-row-pending) {
  background-color: var(--el-color-danger-light-9);
}

:deep(.el-table .config-row-pending:hover > td) {
  background-color: var(--el-color-danger-light-8) !important;
}

.config-empty {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 200px;
}

.config-tabs {
  height: 100%;
  display: flex;
  flex-direction: column;
}

:deep(.config-tabs .el-tabs__content) {
  flex: 1;
  display: flex;
}

:deep(.config-tabs .el-tab-pane) {
  flex: 1;
  display: flex;
}

.overview-wrapper {
  padding: 12px 0;
  width: 100%;
  height: 100%;
  overflow-y: auto;
}

.overview-content {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.overview-card {
  margin-bottom: 16px;
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
  min-height: 300px;
  background-color: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 4px;
}

.chart-empty {
  text-align: center;
  padding: 40px 0;
}

.card-title {
  font-weight: 600;
  font-size: 16px;
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

/* 表格行可点击样式 */
:deep(.el-table tbody tr) {
  cursor: pointer;
}

:deep(.el-table tbody tr:hover) {
  background-color: var(--el-table-row-hover-bg-color);
}
</style>



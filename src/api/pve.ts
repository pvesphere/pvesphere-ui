/*
 * Copyright (c) 2025 PveSphere Contributors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { http } from "@/utils/http";
import type { AxiosProgressEvent } from "axios";

/** 通用列表返回结构：后端返回 { success, data: T[] } 即可兼容 */
export interface ListResult<T> {
  success: boolean;
  data: T[];
}

/**
 * Dashboard 相关类型与接口
 * 与后端约定：
 * - 统一前缀 /api/v1/dashboard
 * - scope: all | cluster
 * - cluster_id: number（当 scope=cluster 时使用）
 */

// Dashboard Scope（用于顶部 Scope 下拉列表）
export interface DashboardScopeItem {
  cluster_id: number;
  cluster_name: string;
  cluster_name_alias: string;
}

export interface DashboardScopesResponse {
  code: number;
  message: string;
  data: {
    items: DashboardScopeItem[];
  };
}

export const fetchDashboardScopes = () => {
  return http.request<DashboardScopesResponse>("get", "/api/v1/dashboard/scopes");
};

// Global Overview
export interface DashboardOverviewSummary {
  cluster_count: number;
  node_count: number;
  vm_count: number;
  storage_count: number;
}

export interface DashboardOverviewHealth {
  healthy: number;
  warning: number;
  critical: number;
}

export interface DashboardOverviewResponse {
  code: number;
  message: string;
  data: {
    scope: "all" | "cluster";
    cluster_id: number | null;
    summary: DashboardOverviewSummary;
    health: DashboardOverviewHealth;
  };
}

export interface DashboardCommonQuery {
  scope?: "all" | "cluster";
  cluster_id?: number | string | null;
}

export const fetchDashboardOverview = (params: DashboardCommonQuery) => {
  return http.request<DashboardOverviewResponse>("get", "/api/v1/dashboard/overview", {
    params
  });
};

// Resource Utilization
export interface DashboardResourceMetric {
  used_cores?: number;
  total_cores?: number;
  used_bytes?: number;
  total_bytes?: number;
  usage_percent: number;
}

export interface DashboardResourcesPayload {
  scope: "all" | "cluster";
  cluster_id: number | null;
  cpu: DashboardResourceMetric;
  memory: DashboardResourceMetric;
  storage: DashboardResourceMetric;
}

export interface DashboardResourcesResponse {
  code: number;
  message: string;
  data: DashboardResourcesPayload;
}

export const fetchDashboardResources = (params: DashboardCommonQuery) => {
  return http.request<DashboardResourcesResponse>("get", "/api/v1/dashboard/resources", {
    params
  });
};

// Hotspots & Risks
export interface DashboardVmHotspot {
  id: string;
  name: string;
  metric_value: number;
  unit: string;
  node_name: string;
  cluster_id: number;
  cluster_name: string;
}

export interface DashboardNodeHotspot {
  id: string;
  name: string;
  metric_value: number;
  unit: string;
  cluster_id: number;
  cluster_name: string;
}

export interface DashboardStorageHotspot {
  id: string;
  name: string;
  usage_percent: number;
  used_bytes: number;
  total_bytes: number;
  unit: string;
}

export interface DashboardVmHotspots {
  cpu: DashboardVmHotspot[];
  memory: DashboardVmHotspot[];
  disk: DashboardVmHotspot[];
}

export interface DashboardNodeHotspots {
  cpu: DashboardNodeHotspot[];
  memory: DashboardNodeHotspot[];
}

export type DashboardRiskLevel = "info" | "warning" | "critical" | string;

export interface DashboardRecentRisk {
  id: string;
  level: DashboardRiskLevel;
  message: string;
  occurred_at?: string;
  relative_time?: string;
  target_type: "vm" | "node" | "storage" | "cluster" | string;
  target_id: string;
  target_name: string;
}

export interface DashboardHotspotsPayload {
  scope: "all" | "cluster";
  cluster_id: number | null;
  vm_hotspots: DashboardVmHotspots;
  node_hotspots: DashboardNodeHotspots;
  storage_hotspots: DashboardStorageHotspot[];
  recent_risks: DashboardRecentRisk[];
}

// 用于表格显示的格式化数据
export interface DashboardTopResourceConsumer {
  type: "vm" | "node" | "storage" | string;
  id: string;
  name: string;
  metric_type: "cpu" | "memory" | "storage" | "disk" | "io" | "network" | string;
  metric_value: number | string;
  unit: string;
  node_name?: string;
  cluster_id?: number;
  cluster_name?: string;
}

export interface DashboardHotspotsQuery extends DashboardCommonQuery {
  limit?: number;
}

export interface DashboardHotspotsResponse {
  code: number;
  message: string;
  data: DashboardHotspotsPayload;
}

export const fetchDashboardHotspots = (params: DashboardHotspotsQuery) => {
  return http.request<DashboardHotspotsResponse>("get", "/api/v1/dashboard/hotspots", {
    params
  });
};

// Operations in Progress
export interface DashboardOperationSummaryItem {
  operation_type: "vm_migration" | "node_maintenance" | "storage_rebalance" | "other" | string;
  display_name: string;
  count: number;
}

export type DashboardOperationStatus = "running" | "pending" | "failed" | "completed" | string;

export interface DashboardOperationItem {
  id: string;
  operation_type: string;
  name: string;
  progress?: number;
  status: DashboardOperationStatus;
  started_at?: string;
}

export interface DashboardOperationsPayload {
  scope: "all" | "cluster";
  cluster_id: number | null;
  summary: DashboardOperationSummaryItem[];
  items?: DashboardOperationItem[];
}

export interface DashboardOperationsResponse {
  code: number;
  message: string;
  data: DashboardOperationsPayload;
}

export const fetchDashboardOperations = (params: DashboardCommonQuery) => {
  return http.request<DashboardOperationsResponse>("get", "/api/v1/dashboard/operations", {
    params
  });
};

/** 集群（根据后端实际字段命名） */
export interface Cluster {
  id: number;
  cluster_name: string;
  cluster_name_alias: string;
  env: string;
  datacenter: string;
  api_url: string;
  region: string;
  is_schedulable: number;
  is_enabled: number;
}

export interface ClusterQuery {
  keyword?: string;
}

export interface ClusterListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: Cluster[];
  };
}

export const fetchClusters = (params?: ClusterQuery) => {
  return http.request<ClusterListResponse>("get", "/api/v1/clusters", {
    params
  });
};

export const fetchClusterDetail = (id: number | string) => {
  return http.request<Cluster>(
    "get",
    `/api/v1/clusters/${encodeURIComponent(String(id))}`
  );
};

// 创建集群
export interface CreateClusterPayload {
  cluster_name: string;
  cluster_name_alias: string;
  env: string;
  datacenter: string;
  api_url: string;
  region: string;
  is_schedulable?: number;
  is_enabled?: number;
  user_id?: string;
  user_token?: string;
}

export interface CreateClusterResponse {
  code: number;
  message: string;
  data?: Cluster;
}

export const createCluster = (data: CreateClusterPayload) => {
  return http.request<CreateClusterResponse>("post", "/api/v1/clusters", { data });
};

// 更新集群
export interface UpdateClusterPayload {
  cluster_name?: string;
  cluster_name_alias?: string;
  env?: string;
  datacenter?: string;
  api_url?: string;
  region?: string;
  is_schedulable?: number;
  is_enabled?: number;
  user_id?: string;
  user_token?: string;
}

export interface UpdateClusterResponse {
  code: number;
  message: string;
  data?: Cluster;
}

export const updateCluster = (id: number | string, data: UpdateClusterPayload) => {
  return http.request<UpdateClusterResponse>(
    "put",
    `/api/v1/clusters/${encodeURIComponent(String(id))}`,
    { data }
  );
};

// 删除集群
export interface DeleteClusterResponse {
  code: number;
  message: string;
}

export const deleteCluster = (id: number | string) => {
  return http.request<DeleteClusterResponse>(
    "delete",
    `/api/v1/clusters/${encodeURIComponent(String(id))}`
  );
};

// 验证集群API状态
export interface VerifyClusterApiParams {
  cluster_id?: number | string;
  api_url?: string;
  user_id?: string;
  user_token?: string;
}

export interface VerifyClusterApiResponse {
  code: number;
  message: string;
  data?: {
    success: boolean;
    message?: string;
    version?: string;
    cluster_name?: string;
  };
}

export const verifyClusterApi = (params: VerifyClusterApiParams) => {
  return http.request<VerifyClusterApiResponse>(
    "get",
    "/api/v1/clusters/verify",
    { params }
  );
};

// 集群状态
export interface ClusterStatusNode {
  id: string;
  ip?: string;
  level?: string;
  local?: number;
  name: string;
  nodeid?: number;
  online?: number;
  type: string;
}

export interface ClusterStatusInfo {
  id: string;
  name: string;
  nodes?: number;
  quorate?: number;
  type: string;
  version?: number;
}

export interface ClusterStatusResponse {
  code: number;
  message: string;
  data: (ClusterStatusInfo | ClusterStatusNode)[];
}

export const fetchClusterStatus = (params: { cluster_id: number }) => {
  return http.request<ClusterStatusResponse>("get", "/api/v1/clusters/status", {
    params
  });
};

// 集群资源
export interface ClusterResource {
  id: string;
  type: string;
  name: string;
  node?: string;
  status?: string;
  cpu?: number;
  maxcpu?: number;
  mem?: number;
  maxmem?: number;
  disk?: number;
  maxdisk?: number;
  uptime?: number;
  template?: number;
  vmid?: number;
  diskread?: number;
  diskwrite?: number;
  netin?: number;
  netout?: number;
  online?: number;
  ip?: string;
  nodeid?: number;
  local?: number;
  level?: string;
  nodes?: number;
  quorate?: number;
  version?: number;
}

export interface ClusterResourcesResponse {
  code: number;
  message: string;
  data: ClusterResource[];
}

export const fetchClusterResources = (params: { cluster_id: number }) => {
  return http.request<ClusterResourcesResponse>("get", "/api/v1/clusters/resources", {
    params
  });
};

/** 节点（根据后端实际字段命名） */
export interface Node {
  id: number;
  node_name: string;
  ip_address: string;
  cluster_id: number;
  cluster_name?: string;
  is_schedulable: number;
  env: string;
  status: string;
  vm_limit: number;
  annotations?: string;
}

export interface NodeQuery {
  keyword?: string;
  cluster_id?: number;
  page?: number;
  page_size?: number;
}

export interface NodeListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: Node[];
  };
}

export const fetchNodes = (params?: NodeQuery) => {
  return http.request<NodeListResponse>("get", "/api/v1/nodes", { params });
};

export const fetchNodeDetail = (id: number | string) => {
  return http.request<{ code: number; message: string; data: Node }>(
    "get",
    `/api/v1/nodes/${encodeURIComponent(String(id))}`
  );
};

/** 节点状态信息 */
export interface NodeStatus {
  [key: string]: any;
}

export interface NodeStatusResponse {
  code: number;
  message: string;
  data: NodeStatus;
}

/** 获取节点状态 */
export const fetchNodeStatus = (node_id: number | string) => {
  return http.request<NodeStatusResponse>("get", "/api/v1/nodes/status", {
    params: { node_id }
  });
};

/** 节点系统服务 */
export interface NodeService {
  name?: string; // 服务名称，如 "pveproxy"
  service_name?: string; // 服务名称（备用字段）
  state?: string; // 状态，如 "running", "stopped"
  description?: string; // 服务描述
  [key: string]: any;
}

export interface NodeServicesResponse {
  code: number;
  message: string;
  data: NodeService[];
}

/** 获取节点系统服务 */
export const fetchNodeServices = (node_id: number | string) => {
  return http.request<NodeServicesResponse>("get", "/api/v1/nodes/services", {
    params: { node_id }
  });
};

// 节点服务操作
export interface NodeServiceActionPayload {
  node_id: number | string;
  service_name: string;
}

export interface NodeServiceActionResponse {
  code: number;
  message: string;
  data?: {
    upid?: string;
    [key: string]: any;
  };
}

/** 启动节点服务 */
export const startNodeService = (data: NodeServiceActionPayload) => {
  return http.request<NodeServiceActionResponse>("post", "/api/v1/nodes/services/start", {
    data
  });
};

/** 停止节点服务 */
export const stopNodeService = (data: NodeServiceActionPayload) => {
  return http.request<NodeServiceActionResponse>("post", "/api/v1/nodes/services/stop", {
    data
  });
};

/** 重启节点服务 */
export const restartNodeService = (data: NodeServiceActionPayload) => {
  return http.request<NodeServiceActionResponse>("post", "/api/v1/nodes/services/restart", {
    data
  });
};

// 节点网络配置
export interface NodeNetwork {
  iface?: string; // 接口名称
  type?: string; // 类型：bridge, bond, eth, vlan等
  active?: boolean | number; // 是否激活
  autostart?: boolean | number; // 是否自动启动
  vlan_aware?: boolean | number; // 是否VLAN感知
  bridge_ports?: string; // Bridge端口
  bond_slaves?: string; // Bond从属接口
  bond_mode?: string; // Bond模式
  address?: string; // IP地址（CIDR格式）
  gateway?: string; // 网关
  comment?: string; // 注释
  [key: string]: any;
}

export interface NodeNetworksResponse {
  code: number;
  message: string;
  data: NodeNetwork[];
}

/** 获取节点网络配置列表 */
export const fetchNodeNetworks = (node_id: number | string) => {
  return http.request<NodeNetworksResponse>("get", "/api/v1/nodes/network", {
    params: { node_id }
  });
};

export interface CreateNodeNetworkPayload {
  node_id: number | string;
  iface: string; // 接口名称
  type: string; // 类型：bridge, bond, eth, vlan等
  bridge_ports?: string; // Bridge端口
  bond_slaves?: string; // Bond从属接口
  bond_mode?: string; // Bond模式
  autostart?: number; // 是否自动启动：0或1
  address?: string; // IP地址（CIDR格式）
  gateway?: string; // 网关
  vlan_aware?: number; // 是否VLAN感知：0或1
  comment?: string; // 注释
  [key: string]: any;
}

export interface NodeNetworkActionResponse {
  code: number;
  message: string;
  data?: any;
}

/** 创建节点网络配置 */
export const createNodeNetwork = (data: CreateNodeNetworkPayload) => {
  return http.request<NodeNetworkActionResponse>("post", "/api/v1/nodes/network", {
    data
  });
};

export interface ReloadNodeNetworkPayload {
  node_id: number | string;
}

/** 重新加载节点网络配置 */
export const reloadNodeNetwork = (data: ReloadNodeNetworkPayload) => {
  return http.request<NodeNetworkActionResponse>("put", "/api/v1/nodes/network", {
    data
  });
};

export interface RevertNodeNetworkPayload {
  node_id: number | string;
}

/** 恢复节点网络配置更改 */
export const revertNodeNetwork = (data: RevertNodeNetworkPayload) => {
  return http.request<NodeNetworkActionResponse>("delete", "/api/v1/nodes/network", {
    data
  });
};

/** 节点状态控制 */
export interface UpdateNodeStatusPayload {
  node_id: number | string;
  command: "reboot" | "shutdown";
}

export interface UpdateNodeStatusResponse {
  code: number;
  message: string;
}

/** 更新节点状态（重启/关闭） */
export const updateNodeStatus = (data: UpdateNodeStatusPayload) => {
  return http.request<UpdateNodeStatusResponse>("post", "/api/v1/nodes/status", {
    data
  });
};

/** 更新节点信息 */
export interface UpdateNodePayload {
  vm_limit?: number;
  is_schedulable?: number;
  annotations?: string;
}

export interface UpdateNodeResponse {
  code: number;
  message: string;
}

/** 更新节点信息 */
export const updateNode = (node_id: number | string, data: UpdateNodePayload) => {
  return http.request<UpdateNodeResponse>("put", `/api/v1/nodes/${encodeURIComponent(String(node_id))}`, {
    data
  });
};

/** 节点 RRD 数据 */
export interface NodeRrdData {
  [key: string]: any;
}

export interface NodeRrdResponse {
  code: number;
  message: string;
  data: NodeRrdData;
}

/** 获取节点 RRD 数据 */
export const fetchNodeRrd = (node_id: number | string, timeframe: string = 'hour', cf: string = 'AVERAGE') => {
  return http.request<NodeRrdResponse>("get", "/api/v1/nodes/rrd", {
    params: { node_id, timeframe, cf }
  });
};

/** 虚拟机 RRD 数据 */
export interface VmRrdData {
  [key: string]: any;
}

export interface VmRrdResponse {
  code: number;
  message: string;
  data: VmRrdData;
}

/** 获取虚拟机 RRD 数据 */
export const fetchVmRrd = (vm_id: number | string, timeframe: string = 'hour', cf: string = 'AVERAGE') => {
  return http.request<VmRrdResponse>("get", "/api/v1/vms/rrd", {
    params: { vm_id, timeframe, cf }
  });
};

/** 虚拟机迁移 */
export interface VmMigratePayload {
  bwlimit?: number;
  migration_network?: string;
  online?: boolean;
  target_node_id: number;
  vm_id: number | string;
  with_local_disks?: boolean;
}

export const migrateVm = (data: VmMigratePayload) => {
  return http.request<{ code: number; message: string }>("post", "/api/v1/vms/migrate", {
    data
  });
};

/** 存储（根据后端实际字段命名） */
export interface Storage {
  id: number;
  node_name: string;
  cluster_id: number;
  active: number;
  type: string;
  avail: number;
  storage_name: string;
  content: string;
  used: number;
  total: number;
  enabled: number;
  used_fraction: number;
  shared: number;
}

export interface StorageQuery {
  keyword?: string;
  node_name?: string;
  page?: number;
  page_size?: number;
}

export interface StorageListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: Storage[];
  };
}

export const fetchStorages = (params?: StorageQuery) => {
  return http.request<StorageListResponse>("get", "/api/v1/storages", {
    params
  });
};

export const fetchStorageDetail = (id: number | string) => {
  return http.request<Storage>(
    "get",
    `/api/v1/storages/${encodeURIComponent(String(id))}`
  );
};

/** 存储状态 */
export interface StorageStatus {
  enabled: boolean | string | number;
  active: boolean | string | number;
  content: string;
  type: string;
  used: number;
  total: number;
  [key: string]: any;
}

export interface StorageStatusResponse {
  code: number;
  message: string;
  data: StorageStatus;
}

/** 获取节点存储状态 */
export const fetchNodeStorageStatus = (params: {
  node_id: number | string;
  storage: string;
}) => {
  return http.request<StorageStatusResponse>(
    "get",
    "/api/v1/nodes/storage/status",
    { params }
  );
};

/** 存储 RRD 指标 */
export interface StorageRrdPoint {
  time: number;
  used?: number;
  total?: number;
  [key: string]: any;
}

export interface StorageRrdResponse {
  code: number;
  message: string;
  data: StorageRrdPoint[] | { data: StorageRrdPoint[] };
}

/** 获取节点存储 RRD 指标 */
export const fetchNodeStorageRrd = (
  params: {
    node_id: number | string;
    storage: string;
    timeframe?: string;
    cf?: string;
  }
) => {
  const { timeframe = "day", cf = "AVERAGE", ...rest } = params;
  return http.request<StorageRrdResponse>(
    "get",
    "/api/v1/nodes/storage/rrd",
    {
      params: { timeframe, cf, ...rest }
    }
  );
};

/** 存储内容 */
export interface StorageContentItem {
  volid: string;
  format?: string;
  size?: number;
  used?: number;
  ctime?: number;
  vmid?: number;
  content?: string;
  parent?: string | null;
  [key: string]: any;
}

export interface StorageContentListResponse {
  code: number;
  message: string;
  data: StorageContentItem[];
}

/** 获取存储内容列表 */
export const fetchNodeStorageContent = (params: {
  node_id: number | string;
  storage: string;
  content?: string;
}) => {
  return http.request<StorageContentListResponse>(
    "get",
    "/api/v1/nodes/storage/content",
    { params }
  );
};

/** 卷属性 */
export interface StorageVolumeDetail {
  volid: string;
  size?: number;
  format?: string;
  vmid?: number;
  ctime?: number;
  [key: string]: any;
}

export interface StorageVolumeDetailResponse {
  code: number;
  message: string;
  data: StorageVolumeDetail;
}

/** 获取卷属性 */
export const fetchNodeStorageVolumeDetail = (params: {
  node_id: number | string;
  storage: string;
  volume: string;
}) => {
  return http.request<StorageVolumeDetailResponse>(
    "get",
    "/api/v1/nodes/storage/content/detail",
    { params }
  );
};

/** 删除存储内容 */
export interface DeleteStorageContentPayload {
  node_id: number | string;
  storage: string;
  volume: string;
  content?: string; // "iso", "images" 等
  delay?: number; // 延迟删除时间（秒），默认 5
}

export interface DeleteStorageContentResponse {
  code: number;
  message: string;
}

/** 删除存储内容 */
export const deleteStorageContent = (params: DeleteStorageContentPayload) => {
  return http.request<DeleteStorageContentResponse>(
    "delete",
    "/api/v1/nodes/storage/content",
    { params }
  );
};

/** 上传文件到存储 */
export interface UploadStorageFilePayload {
  node_id: number | string;
  storage: string;
  content: string; // "iso", "vztmpl", "images" 等
  file: File;
  hash_algorithm?: string; // "md5", "sha256", "sha512" 等，可选
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
}

export interface UploadStorageFileResponse {
  code: number;
  message: string;
  data?: {
    upid?: string; // 任务ID
    [key: string]: any;
  };
}

/** 上传文件到存储 */
export const uploadStorageFile = (data: UploadStorageFilePayload) => {
  const formData = new FormData();
  formData.append("node_id", String(data.node_id));
  formData.append("storage", data.storage);
  formData.append("content", data.content);
  formData.append("file", data.file);
  if (data.hash_algorithm) {
    formData.append("hash_algorithm", data.hash_algorithm);
  }

  return http.request<UploadStorageFileResponse>(
    "post",
    "/api/v1/nodes/storage/upload",
    {
      data: formData,
      // 大文件上传可能较慢，这里将超时时间单独放宽到 10 分钟
      timeout: 600000,
      headers: {
        "Content-Type": "multipart/form-data"
      },
      // 上传进度回调
      onUploadProgress: data.onUploadProgress
    }
  );
};

/** 虚拟机（根据后端实际字段命名） */
export interface Vm {
  id: number;
  vm_name: string;
  cluster_id: number;
  cluster_name: string;
  node_id: number;
  node_name: string;
  template_id: number;
  template_name: string;
  vmid: number;
  cpu_num: number;
  memory_size: number;
  status: string;
  app_id: string;
  node_ip: string;
  description?: string;
  is_template?: number; // 是否为模板：1 表示模板，0 或其他表示普通虚拟机
}

export interface VmQuery {
  keyword?: string;
  node_name?: string;
  status?: string;
  page?: number;
  page_size?: number;
}

export interface VmListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: Vm[];
  };
}

export const fetchVms = (params?: VmQuery) => {
  return http.request<VmListResponse>("get", "/api/v1/vms", { params });
};

export const fetchVmDetail = (id: number | string) => {
  return http.request<Vm>("get", `/api/v1/vms/${encodeURIComponent(String(id))}`);
};

/** 获取虚拟机基本信息 */
export const fetchVmBasicInfo = (vm_id: number | string) => {
  return http.request<{ code: number; message: string; data: Vm }>(
    "get",
    `/api/v1/vms/${encodeURIComponent(String(vm_id))}`
  );
};

/** 虚拟机状态信息 */
export interface VmStatus {
  agent: number;
  balloon: number;
  ballooninfo?: {
    actual: number;
    free_mem: number;
    last_update: number;
    major_page_faults: number;
    max_mem: number;
    mem_swapped_in: number;
    mem_swapped_out: number;
    minor_page_faults: number;
    total_mem: number;
  };
  blockstat?: Record<string, any>;
  cpu: number;
  cpus: number;
  disk: number;
  diskread: number;
  diskwrite: number;
  freemem: number;
  ha?: {
    managed: number;
  };
  maxdisk: number;
  maxmem: number;
  mem: number;
  name: string;
  netin: number;
  netout: number;
  nics?: Record<string, any>;
  pid?: number;
  "proxmox-support"?: Record<string, any>;
  qmpstatus: string;
  "running-machine"?: string;
  "running-qemu"?: string;
  status: string;
  uptime: number;
  vmid: number;
}

export interface VmStatusResponse {
  code: number;
  message: string;
  data: VmStatus;
}

/** 获取虚拟机状态 */
export const fetchVmStatus = (vm_id: number | string) => {
  return http.request<VmStatusResponse>("get", "/api/v1/vms/status", {
    params: { vm_id }
  });
};

/** 创建虚拟机入参（根据后端提供的示例） */
export interface CreateVmPayload {
  vm_name: string;
  node_name: string;
  vmid: number;
  template_id: number;
  cluster_name: string;
  cpu_num: number;
  memory_size: number;
  storage: string;
  storage_cfg?: string;
  full_clone: number;
  app_id: string;
  vm_user: string;
  vm_password: string;
  description?: string;
  ip_address_id?: number | null;
}

/** 创建虚拟机（简化版，兼容旧接口） */
export const createVm = (data: CreateVmPayload) => {
  return http.request<{ code: number; message: string; data?: Vm }>(
    "post",
    "/api/v1/vms",
    { data }
  );
};

/** 创建虚拟机（完整配置版） */
export const createVmFull = (data: CreateVmFullPayload) => {
  return http.request<{ code: number; message: string; data?: Vm }>(
    "post",
    "/api/v1/vms/create",
    { data }
  );
};

/** 启动虚拟机 */
export const startVm = (id: number | string) => {
  return http.request<{ code: number; message: string }>(
    "post",
    `/api/v1/vms/${encodeURIComponent(String(id))}/start`
  );
};

/** 关闭虚拟机 */
export const stopVm = (id: number | string) => {
  return http.request<{ code: number; message: string }>(
    "post",
    `/api/v1/vms/${encodeURIComponent(String(id))}/stop`
  );
};

/** 虚拟机 Console 登录 */
export interface VmConsolePayload {
  vm_id: number | string;
}

export interface VmConsoleResponse {
  code: number;
  message: string;
  data?: {
    cert?: string;
    port?: string | number;
    ticket?: string;
    upid?: string;
    user?: string;
    // 新增：同域 WS 代理
    ws_url?: string; // ws/wss 或相对路径
    ws_token?: string; // 2分钟有效、单次使用
    ws_expires_at?: number; // 时间戳
    [key: string]: any;
  };
}

/** 获取虚拟机 Console 登录信息 */
export const createVmConsole = (data: VmConsolePayload) => {
  return http.request<VmConsoleResponse>("post", "/api/v1/vms/console", { data });
};

/** 删除虚拟机 */
export const deleteVm = (id: number | string) => {
  return http.request<{ code: number; message: string }>(
    "delete",
    `/api/v1/vms/${encodeURIComponent(String(id))}`
  );
};

/** 模板（根据后端实际字段命名） */
export interface Template {
  id: number;
  template_name: string;
  cluster_id: number;
  description: string;
}

export interface TemplateQuery {
  keyword?: string;
}

export interface TemplateListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: Template[];
  };
}

export const fetchTemplates = (params?: TemplateQuery) => {
  return http.request<TemplateListResponse>("get", "/api/v1/templates", {
    params
  });
};

export const fetchTemplateDetail = (id: number | string, includeInstances: boolean = false) => {
  return http.request<{
    code: number;
    message: string;
    data: TemplateDetail;
  }>(
    "get",
    `/api/v1/templates/${encodeURIComponent(String(id))}/detail`,
    {
      params: { include_instances: includeInstances }
    }
  );
};

/** 模板详情（包含上传信息、实例信息） */
export interface TemplateDetail extends Template {
  cluster_name?: string;
  upload_info?: {
    upload_id: number;
    storage_name: string;
    is_shared: boolean;
    file_name: string;
    file_size: number;
    status: string;
  };
  instances?: TemplateInstance[];
}

/** 模板实例 */
export interface TemplateInstance {
  instance_id: number;
  node_id: number;
  node_name: string;
  vmid: number;
  storage_name: string;
  status: string;
  is_primary: boolean;
}

/** 上传模板 */
export interface UploadTemplatePayload {
  template_name: string;
  cluster_id: number;
  storage_id: number;
  description?: string;
  auto_sync?: boolean;
  sync_node_ids?: string; // 逗号分隔的节点ID列表
  file: File;
  onUploadProgress?: (progressEvent: AxiosProgressEvent) => void;
}

export interface UploadTemplateResponse {
  code: number;
  message: string;
  data: {
    template_id: number;
    upload_id: number;
    storage_type: string;
    is_shared: boolean;
    import_node: {
      node_id: number;
      node_name: string;
    };
    sync_tasks: Array<{
      task_id: number;
      target_node_id: number;
      target_node_name: string;
      status: string;
    }>;
  };
}

export const uploadTemplate = (data: UploadTemplatePayload) => {
  const formData = new FormData();
  formData.append("template_name", data.template_name);
  formData.append("cluster_id", String(data.cluster_id));
  formData.append("storage_id", String(data.storage_id));
  if (data.description) {
    formData.append("description", data.description);
  }
  if (data.auto_sync !== undefined) {
    formData.append("auto_sync", String(data.auto_sync));
  }
  if (data.sync_node_ids) {
    formData.append("sync_node_ids", data.sync_node_ids);
  }
  formData.append("file", data.file);

  return http.request<UploadTemplateResponse>(
    "post",
    "/api/v1/templates/upload",
    {
      data: formData,
      timeout: 600000, // 10分钟超时
      headers: {
        "Content-Type": "multipart/form-data"
      },
      onUploadProgress: data.onUploadProgress
    }
  );
};

/** 同步模板 */
export interface SyncTemplatePayload {
  target_node_ids: number[];
}

export interface SyncTemplateResponse {
  code: number;
  message: string;
  data: {
    sync_tasks: Array<{
      task_id: number;
      target_node_id: number;
      target_node_name: string;
      status: string;
    }>;
  };
}

export const syncTemplate = (id: number | string, data: SyncTemplatePayload) => {
  return http.request<SyncTemplateResponse>(
    "post",
    `/api/v1/templates/${encodeURIComponent(String(id))}/sync`,
    { data }
  );
};

/** 导入模板（从存储备份文件） */
export interface ImportTemplatePayload {
  template_name: string;
  cluster_id: number;
  node_id: number;
  backup_storage_id: number;
  backup_file: string;
  target_storage_id: number;
  description?: string;
  sync_node_ids?: number[];
}

export interface ImportTemplateResponse {
  code: number;
  message: string;
  data: {
    template_id: number;
    upload_id?: number;
    storage_type?: string;
    is_shared?: boolean;
    import_node?: {
      node_id: number;
      node_name: string;
    };
    sync_tasks?: TemplateSyncTask[];
  };
}

export const importTemplate = (data: ImportTemplatePayload) => {
  return http.request<ImportTemplateResponse>("post", "/api/v1/templates/import", {
    data,
    timeout: 300000 // 5分钟超时
  });
};

/** 同步任务 */
export interface TemplateSyncTask {
  task_id: number;
  template_id: number;
  template_name: string;
  source_node: {
    node_id: number;
    node_name: string;
  };
  target_node: {
    node_id: number;
    node_name: string;
  };
  storage_name: string;
  status: "pending" | "syncing" | "completed" | "failed";
  progress: number;
  sync_start_time?: string;
  error_message?: string;
}

export interface TemplateSyncTaskListResponse {
  code: number;
  message: string;
  data: {
    total: number;
    list: TemplateSyncTask[];
  };
}

export interface TemplateSyncTaskQuery {
  page?: number;
  page_size?: number;
  template_id?: number;
  status?: "pending" | "syncing" | "completed" | "failed";
}

export const fetchTemplateSyncTasks = (params?: TemplateSyncTaskQuery) => {
  return http.request<TemplateSyncTaskListResponse>(
    "get",
    "/api/v1/templates/sync-tasks",
    { params }
  );
};

export const fetchTemplateSyncTaskDetail = (taskId: number | string) => {
  return http.request<{
    code: number;
    message: string;
    data: TemplateSyncTask;
  }>(
    "get",
    `/api/v1/templates/sync-tasks/${encodeURIComponent(String(taskId))}`
  );
};

export const retryTemplateSyncTask = (taskId: number | string) => {
  return http.request<{
    code: number;
    message: string;
  }>(
    "post",
    `/api/v1/templates/sync-tasks/${encodeURIComponent(String(taskId))}/retry`
  );
};

/** 获取模板实例列表 */
export const fetchTemplateInstances = (id: number | string) => {
  return http.request<{
    code: number;
    message: string;
    data: TemplateInstance[];
  }>(
    "get",
    `/api/v1/templates/${encodeURIComponent(String(id))}/instances`
  );
};

/** 删除模板 */
export const deleteTemplate = (id: number | string, cascade?: boolean) => {
  return http.request<{
    code: number;
    message: string;
  }>(
    "delete",
    `/api/v1/templates/${encodeURIComponent(String(id))}`,
    {
      params: cascade ? { cascade: true } : undefined
    }
  );
};

/** ISO镜像 */
export interface IsoImage {
  volid: string; // 存储卷ID，格式如 "local:iso/ubuntu-22.04.iso"
  size: number; // 文件大小（字节）
  format?: string; // 格式，如 "iso"
  content?: string; // 内容类型
  [key: string]: any;
}

export interface IsoImageQuery {
  node_name?: string;
  storage?: string;
}

export interface IsoImageListResponse {
  code: number;
  message: string;
  data: IsoImage[];
}

/** 获取ISO镜像列表 */
export const fetchIsoImages = (params?: IsoImageQuery) => {
  return http.request<IsoImageListResponse>("get", "/api/v1/storages/iso", {
    params
  });
};

/** 创建虚拟机（完整配置） */
export interface CreateVmFullPayload {
  /** 基本信息 */
  vm_name: string;
  cluster_id: number;

  /** 节点：新接口使用 node_id（推荐），旧代码可能仍用 node_name */
  node_id?: number | string;
  node_name?: string;

  /** 创建模式：模板克隆默认不传；ISO/空机用 create_mode */
  create_mode?: "iso" | "empty";
  /** 兼容旧字段（历史代码） */
  create_type?: "template" | "iso";

  /** 模板克隆 */
  template_id?: number;
  full_clone?: number; // 0/1

  /** 通用资源 */
  cpu_num?: number;
  memory_size: number; // MB
  storage?: string;

  /** ISO 安装 / 空机 */
  disk_size_gb?: number;
  iso_volume?: string;
  os_type?: string; // 例如 l26
  bridge?: string;
  net_model?: string;

  /** 兼容旧字段（历史代码） */
  app_id?: string;
  iso_volid?: string;
  guest_os_type?: "Linux" | "Windows" | "Other";
  kernel?: string;
  graphic_card?: string;
  scsi_controller?: string;
  machine?: string;
  qemu_agent?: boolean;
  bios?: "seabios" | "ovmf";
  add_tpm?: boolean;
  sockets?: number;
  cpu_type?: string;
  cores?: number;
  total_cores?: number;
  disks?: Array<{
    storage: string;
    size: number;
    format?: string;
    cache?: string;
  }>;
  networks?: Array<{
    bridge?: string;
    model?: string;
    vlan_tag?: number;
    mac_address?: string;
    firewall?: boolean;
  }>;
  description?: string;
  vmid?: number;
}

/** 任务相关 */
export interface Task {
  upid: string;
  type: string;
  id: string;
  user: string;
  status: string;
  starttime: number;
  endtime?: number;
  node?: string;
  description?: string;
  exitstatus?: string;
  extra?: {
    node?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface TaskLog {
  n: number;
  t: string;
  [key: string]: any;
}

export interface TaskStatus {
  upid: string;
  status: string;
  exitstatus?: string;
  [key: string]: any;
}

export interface TaskListResponse {
  code: number;
  message: string;
  data: Task[];
}

export interface TaskLogResponse {
  code: number;
  message: string;
  data: TaskLog[];
}

export interface TaskStatusResponse {
  code: number;
  message: string;
  data: TaskStatus;
}

/** 获取集群任务列表 */
export const fetchClusterTasks = (params?: { cluster_id?: number }) => {
  return http.request<TaskListResponse>("get", "/api/v1/tasks/cluster", {
    params
  });
};

/** 获取节点任务列表 */
export const fetchNodeTasks = (params?: {
  cluster_id?: number;
  node_name?: string;
}) => {
  return http.request<TaskListResponse>("get", "/api/v1/tasks/node", {
    params
  });
};

/** 获取任务日志 */
export const fetchTaskLog = (params?: {
  cluster_id?: number;
  node_name?: string;
  upid: string;
  start?: number;
  limit?: number;
}) => {
  return http.request<TaskLogResponse>("get", "/api/v1/tasks/log", {
    params
  });
};

/** 获取任务状态 */
export const fetchTaskStatus = (params?: {
  cluster_id?: number;
  node_name?: string;
  upid: string;
}) => {
  return http.request<TaskStatusResponse>("get", "/api/v1/tasks/status", {
    params
  });
};

/** 终止任务 */
export const stopTask = (params: { cluster_id: number; node_name?: string; upid: string }) => {
  return http.request<{ code: number; message: string }>("delete", "/api/v1/tasks/stop", {
    params
  });
};

/** 虚拟机配置相关 */
export interface VmConfigItem {
  key: string;
  value: string | number;
  pendingValue?: string | number; // pending 要修改的值
  pending?: boolean; // 是否为待生效配置
  [key: string]: any;
}

export interface VmConfigResponse {
  code: number;
  message: string;
  data: {
    [key: string]: string | number | any;
  };
}

export interface VmPendingConfigItem {
  key: string;
  value: string | number;
  pending?: string | number;
}

export interface VmPendingConfigResponse {
  code: number;
  message: string;
  data: VmPendingConfigItem[];
}

/** 获取虚拟机当前配置 */
export const fetchVmCurrentConfig = (vm_id: number | string) => {
  return http.request<VmConfigResponse>("get", "/api/v1/vms/config", {
    params: { vm_id }
  });
};

/** 获取虚拟机pending配置 */
export const fetchVmPendingConfig = (vm_id: number | string) => {
  return http.request<VmPendingConfigResponse>("get", "/api/v1/vms/config/pending", {
    params: { vm_id }
  });
};

/** 更新虚拟机配置 */
export interface UpdateVmConfigPayload {
  vm_id: number | string;
  config: {
    [key: string]: string | number | any;
  };
  digest?: string; // 配置摘要，用于防止并发修改冲突
}

export const updateVmConfig = (data: UpdateVmConfigPayload) => {
  const payload: any = {
    vm_id: data.vm_id,
    config: data.config
  };
  if (data.digest) {
    payload.digest = data.digest;
  }
  return http.request<{ code: number; message: string }>("put", "/api/v1/vms/config", {
    data: payload
  });
};

// Cloud-Init 配置相关
export interface CloudinitConfigPayload {
  vm_id: number;
  node_id: number;
  ciuser?: string;
  cipassword?: string;
  ciupgrade?: string;
  searchdomain?: string;
  nameserver?: string;
  sshkeys?: string;
  ipconfig0?: string;
  [key: string]: any; // 允许其他配置项
}

export interface CloudinitConfigResponse {
  code: number;
  message: string;
  data?: any;
}

// 获取 Cloud-Init 配置
export const fetchCloudinitConfig = (params: { vm_id: number; node_id: number }) => {
  return http.request<CloudinitConfigResponse>("get", "/api/v1/vms/cloudinit", {
    params
  });
};

// 更新 Cloud-Init 配置
export const updateCloudinitConfig = (data: CloudinitConfigPayload) => {
  return http.request<CloudinitConfigResponse>("put", "/api/v1/vms/cloudinit", {
    data
  });
};

/** 虚拟机备份 */
export interface VmBackupPayload {
  vmid: number;
  storage: string;
  compress?: "zst" | "gz" | "lzo" | "none";
  mode?: "snapshot" | "suspend" | "stop";
  maxfiles?: number;
}

export interface VmBackupResponse {
  code: number;
  message: string;
  data?: {
    task_id?: string;
    [key: string]: any;
  };
}

export const createVmBackup = (data: VmBackupPayload) => {
  return http.request<VmBackupResponse>("post", "/api/v1/vms/backup", {
    data
  });
};

/** 删除 VM 备份 */
export interface DeleteVmBackupPayload {
  node_id: number;
  storage_id: number;
  volume: string; // 备份文件路径，如 "local:backup/vzdump-qemu-63054460-2025_12_25-12_52_31.vma.zst"
  delay?: number; // 延迟删除时间（秒），默认 5
}

export interface DeleteVmBackupResponse {
  code: number;
  message: string;
}

export const deleteVmBackup = (data: DeleteVmBackupPayload) => {
  return http.request<DeleteVmBackupResponse>("delete", "/api/v1/vms/backup", {
    data
  });
};

/** 磁盘相关 - 通用磁盘列表 */
export interface Disk {
  by_id_link?: string;
  devpath: string; // 设备路径，如 /dev/sda
  gpt?: number | boolean | string; // 1 表示是 GPT
  health?: string; // 健康状态，如 "OK"
  model?: string;
  osdid?: number;
  "osdid-list"?: any;
  rpm?: number;
  serial?: string;
  size: number; // 字节数
  type: string; // 类型，如 "unknown"
  used?: string; // 用途，如 "BIOS boot", "xfs"
  vendor?: string;
  wearout?: string; // 如 "N/A"
  wwn?: string; // 如 "unknown"
  children?: Disk[]; // 分区信息
  [key: string]: any;
}

/** Directory 存储 */
export interface DirectoryStorage {
  device: string; // 设备路径，如 /dev/disk/by-uuid/xxx
  options: string; // 挂载选项，如 "defaults"
  path: string; // 挂载路径，如 /mnt/pve/local-dir
  type: string; // 文件系统类型，如 "xfs"
  unitfile: string; // systemd unit 文件路径
  [key: string]: any;
}

/** LVM 存储 */
export interface LvmStorage {
  free?: number; // 可用空间（字节）
  leaf?: number; // 是否为叶子节点，0 或 1
  lvcount?: number; // 逻辑卷数量
  name: string; // 名称，如 "pve" 或 "/dev/sda3"
  size: number; // 大小（字节）
  vg_name: string; // 卷组名称，如 "pve"
  [key: string]: any;
}

/** LVM-Thin 存储 */
export interface LvmThinStorage {
  ctime: string; // 创建时间（时间戳）
  lv: string; // 逻辑卷名称，如 "data"
  lv_size: number; // 逻辑卷大小（字节）
  lv_state: string; // 逻辑卷状态，如 "a" (active)
  lv_type: string; // 逻辑卷类型，如 "t" (thin)
  metadata_size: number; // 元数据大小（字节）
  metadata_used: number; // 已用元数据大小（字节）
  used: number; // 已用空间（字节）
  vg: string; // 卷组名称，如 "pve"
  [key: string]: any;
}

/** ZFS 存储 */
export interface ZfsStorage {
  [key: string]: any;
}

export interface DiskListResponse {
  code: number;
  message: string;
  data: Disk[];
}

export interface DirectoryStorageResponse {
  code: number;
  message: string;
  data: DirectoryStorage[];
}

export interface LvmStorageResponse {
  code: number;
  message: string;
  data: LvmStorage[];
}

export interface LvmThinStorageResponse {
  code: number;
  message: string;
  data: LvmThinStorage[];
}

export interface ZfsStorageResponse {
  code: number;
  message: string;
  data: ZfsStorage[];
}

/** 获取节点磁盘列表 */
export const fetchNodeDisks = (node_id: number | string) => {
  return http.request<DiskListResponse>("get", "/api/v1/nodes/disks/list", {
    params: { node_id }
  });
};

/** 获取 Directory 存储 */
export const fetchNodeDirectoryStorage = (node_id: number | string) => {
  return http.request<DirectoryStorageResponse>("get", "/api/v1/nodes/disks/directory", {
    params: { node_id }
  });
};

/** 获取 LVM 存储 */
export const fetchNodeLvmStorage = (node_id: number | string) => {
  return http.request<LvmStorageResponse>("get", "/api/v1/nodes/disks/lvm", {
    params: { node_id }
  });
};

/** 获取 LVM-Thin 存储 */
export const fetchNodeLvmThinStorage = (node_id: number | string) => {
  return http.request<LvmThinStorageResponse>("get", "/api/v1/nodes/disks/lvmthin", {
    params: { node_id }
  });
};

/** 获取 ZFS 存储 */
export const fetchNodeZfsStorage = (node_id: number | string) => {
  return http.request<ZfsStorageResponse>("get", "/api/v1/nodes/disks/zfs", {
    params: { node_id }
  });
};

/** 初始化 GPT 磁盘 */
export interface InitGptPayload {
  node_id: number | string;
  device: string;
}

export const initGptDisk = (data: InitGptPayload) => {
  return http.request<{ code: number; message: string }>("post", "/api/v1/nodes/disks/initgpt", {
    data
  });
};

/** 擦除磁盘或分区 */
export interface WipeDiskPayload {
  node_id: number | string;
  device: string;
}

export const wipeDisk = (data: WipeDiskPayload) => {
  return http.request<{ code: number; message: string }>("put", "/api/v1/nodes/disks/wipedisk", {
    data
  });
};

/** 获取 PVE 访问 Ticket */
export interface PveAccessTicketPayload {
  cluster_id: number;
  username: string;
  realm: string;
  password: string;
}

export interface PveAccessTicketResponse {
  code: number;
  message: string;
  data?: {
    ticket: string; // PVE:root@pam:...
    CSRFPreventionToken?: string; // 后端可能返回的字段名
    [key: string]: any;
  };
}

/** 获取 PVE 访问 Ticket */
export const createPveAccessTicket = (data: PveAccessTicketPayload) => {
  return http.request<PveAccessTicketResponse>("post", "/api/v1/pve/access/ticket", { data });
};

/** 节点 Console 登录 */
export interface NodeConsolePayload {
  node_id: number | string;
  console_type: 'vncshell' | 'termproxy';
  websocket?: boolean; // 仅 vncshell 模式支持
  ticket?: string; // PVE ticket，用于termproxy模式
  csrf_token?: string; // CSRF token，用于termproxy模式
}

export interface NodeConsoleResponse {
  code: number;
  message: string;
  data?: {
    cert?: string;
    port?: string | number;
    ticket?: string;
    user?: string;
    // WebSocket 地址（VNC Shell 和 TermProxy 模式都使用）
    ws_url?: string; // ws/wss 或相对路径
    ws_token?: string; // 2分钟有效、单次使用（VNC Shell 模式）
    ws_expires_at?: number; // 时间戳（VNC Shell 模式）
    // 如果后端支持返回 HTML 页面（类似 Proxmox 官方方式）
    console_url?: string; // 完整的控制台页面 URL，可以直接在 iframe 中使用
    [key: string]: any;
  };
}

/** 获取节点 Console 登录信息 */
export const createNodeConsole = (data: NodeConsolePayload) => {
  return http.request<NodeConsoleResponse>("post", "/api/v1/nodes/console", { data });
};



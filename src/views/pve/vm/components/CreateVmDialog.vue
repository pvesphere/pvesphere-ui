<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { ElMessage, ElMessageBox } from "element-plus";
import { Plus } from "@element-plus/icons-vue";
import { useI18n } from "vue-i18n";
import {
  fetchClusters,
  fetchNodes,
  fetchTemplates,
  fetchIsoImages,
  fetchStorages,
  createVmFull,
  type Cluster,
  type Node,
  type Template,
  type IsoImage,
  type Storage,
  type CreateVmFullPayload
} from "@/api/pve";

const { t } = useI18n();

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "success"): void;
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val)
});

// 步骤控制
const activeStep = ref(0);
const steps = [
  { title: t("pve.vm.create.basicInfo"), icon: "ep:document" },
  { title: t("pve.vm.create.osSettings"), icon: "ep:monitor" },
  { title: t("pve.vm.create.systemConfig"), icon: "ep:setting" },
  { title: t("pve.vm.create.diskConfig"), icon: "ep:hard-drive" },
  { title: t("pve.vm.create.cpuMemory"), icon: "ep:cpu" },
  { title: t("pve.vm.create.networkConfig"), icon: "ep:connection" },
  { title: t("pve.vm.create.confirm"), icon: "ep:check" }
];

// 表单数据
const formData = ref<CreateVmFullPayload>({
  vm_name: "",
  cluster_id: 0,
  node_name: "",
  app_id: "",
  create_type: "template",
  template_id: undefined,
  iso_volid: undefined,
  guest_os_type: "Linux",
  kernel: "6.x",
  graphic_card: "std",
  scsi_controller: "virtio-scsi-pci",
  machine: "q35",
  qemu_agent: true,
  bios: "seabios",
  add_tpm: false,
  sockets: 1,
  cpu_type: "host",
  cores: 2,
  total_cores: 2,
  memory_size: 4096,
  disks: [
    {
      storage: "",
      size: 32,
      format: "qcow2",
      cache: "writeback"
    }
  ],
  networks: [
    {
      bridge: "vmbr0",
      model: "virtio",
      vlan_tag: undefined,
      mac_address: "",
      firewall: true
    }
  ],
  description: ""
});

// 基础数据
const clusters = ref<Cluster[]>([]);
const nodes = ref<Node[]>([]);
const templates = ref<Template[]>([]);
const isoImages = ref<IsoImage[]>([]);
const storages = ref<Storage[]>([]);
const loading = ref(false);
const submitting = ref(false);

// 过滤后的节点（根据集群）
const filteredNodes = computed(() => {
  if (!formData.value.cluster_id) return [];
  return nodes.value.filter(n => n.cluster_id === formData.value.cluster_id);
});

// 过滤后的模板（根据集群）
const filteredTemplates = computed(() => {
  if (!formData.value.cluster_id) return [];
  return templates.value.filter(t => t.cluster_id === formData.value.cluster_id);
});

// 过滤后的存储（根据节点）
const filteredStorages = computed(() => {
  if (!formData.value.node_name) return [];
  return storages.value.filter(s => s.node_name === formData.value.node_name);
});

// 计算总核心数
watch(
  () => [formData.value.sockets, formData.value.cores],
  () => {
    formData.value.total_cores =
      (formData.value.sockets || 1) * (formData.value.cores || 1);
  },
  { immediate: true }
);

// 加载基础数据
const loadBaseData = async () => {
  loading.value = true;
  try {
    const [clusterRes, nodeRes, templateRes, storageRes] = await Promise.all([
      fetchClusters(),
      fetchNodes(),
      fetchTemplates(),
      fetchStorages()
    ]);
    clusters.value = clusterRes?.data?.list ?? [];
    nodes.value = nodeRes?.data?.list ?? [];
    templates.value = templateRes?.data?.list ?? [];
    storages.value = storageRes?.data?.list ?? [];
  } catch (error) {
    console.error("加载基础数据失败:", error);
  } finally {
    loading.value = false;
  }
};

// 加载ISO镜像（当选择节点后）
const loadIsoImages = async () => {
  if (!formData.value.node_name) {
    isoImages.value = [];
    return;
  }
  try {
    const res = await fetchIsoImages({
      node_name: formData.value.node_name
    });
    isoImages.value = res?.data ?? [];
  } catch (error) {
    console.error("加载ISO镜像失败:", error);
    isoImages.value = [];
  }
};

// 监听节点变化，加载ISO镜像
watch(
  () => formData.value.node_name,
  () => {
    if (formData.value.create_type === "iso") {
      loadIsoImages();
    }
  }
);

// 监听创建方式变化
watch(
  () => formData.value.create_type,
  () => {
    if (formData.value.create_type === "iso" && formData.value.node_name) {
      loadIsoImages();
    }
  }
);

// 添加磁盘
const addDisk = () => {
  formData.value.disks?.push({
    storage: "",
    size: 32,
    format: "qcow2",
    cache: "writeback"
  });
};

// 删除磁盘
const removeDisk = (index: number) => {
  if (formData.value.disks && formData.value.disks.length > 1) {
    formData.value.disks.splice(index, 1);
  } else {
    ElMessage.warning(t("pve.vm.create.atLeastOneDisk"));
  }
};

// 添加网卡
const addNetwork = () => {
  formData.value.networks?.push({
    bridge: "vmbr0",
    model: "virtio",
    vlan_tag: undefined,
    mac_address: "",
    firewall: true
  });
};

// 删除网卡
const removeNetwork = (index: number) => {
  if (formData.value.networks && formData.value.networks.length > 1) {
    formData.value.networks.splice(index, 1);
  } else {
    ElMessage.warning(t("pve.vm.create.atLeastOneNetwork"));
  }
};

// 生成随机MAC地址
const generateMacAddress = (index: number) => {
  const prefix = "52:54:00";
  const random = Array.from({ length: 3 }, () =>
    Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, "0")
  ).join(":");
  return `${prefix}:${random}`;
};

// 验证当前步骤
const validateStep = (step: number): boolean => {
  switch (step) {
    case 0: // 基本信息
      if (!formData.value.vm_name) {
        ElMessage.warning(t("pve.vm.create.pleaseInputVmName"));
        return false;
      }
      if (!formData.value.cluster_id) {
        ElMessage.warning(t("pve.vm.create.pleaseSelectCluster"));
        return false;
      }
      if (!formData.value.node_name) {
        ElMessage.warning(t("pve.vm.create.pleaseSelectNode"));
        return false;
      }
      if (
        formData.value.create_type === "template" &&
        !formData.value.template_id
      ) {
        ElMessage.warning(t("pve.vm.create.pleaseSelectTemplate"));
        return false;
      }
      if (
        formData.value.create_type === "iso" &&
        !formData.value.iso_volid
      ) {
        ElMessage.warning(t("pve.vm.create.pleaseSelectIso"));
        return false;
      }
      return true;
    case 1: // OS设置
      return true; // OS设置都是可选的
    case 2: // 系统配置
      return true; // 系统配置都有默认值
    case 3: // 磁盘配置
      if (
        !formData.value.disks ||
        formData.value.disks.length === 0 ||
        formData.value.disks.some(d => !d.storage || !d.size)
      ) {
        ElMessage.warning(t("pve.vm.create.pleaseConfigDisks"));
        return false;
      }
      return true;
    case 4: // CPU和内存
      if (!formData.value.memory_size || formData.value.memory_size < 512) {
        ElMessage.warning(t("pve.vm.create.memoryAtLeast512MB"));
        return false;
      }
      return true;
    case 5: // 网络配置
      if (
        !formData.value.networks ||
        formData.value.networks.length === 0 ||
        formData.value.networks.some(n => !n.bridge || !n.model)
      ) {
        ElMessage.warning(t("pve.vm.create.pleaseConfigNetworks"));
        return false;
      }
      return true;
    default:
      return true;
  }
};

// 下一步
const nextStep = () => {
  if (validateStep(activeStep.value)) {
    if (activeStep.value < steps.length - 1) {
      activeStep.value++;
    }
  }
};

// 上一步
const prevStep = () => {
  if (activeStep.value > 0) {
    activeStep.value--;
  }
};

// 提交
const handleSubmit = async () => {
  if (!validateStep(activeStep.value)) {
    return;
  }

  try {
    await ElMessageBox.confirm(
      t("pve.vm.create.confirmCreateVm"),
      t("pve.common.confirm"),
      {
        type: "warning"
      }
    );
  } catch {
    return;
  }

  submitting.value = true;
  try {
    await createVmFull(formData.value);
    ElMessage.success(t("pve.vm.create.createSuccess"));
    emit("success");
    handleClose();
  } catch (error: any) {
    const msg =
      error?.response?.data?.message || error?.message || t("pve.vm.create.createFailed");
    ElMessage.error(msg);
  } finally {
    submitting.value = false;
  }
};

// 关闭对话框
const handleClose = () => {
  // 重置表单
  activeStep.value = 0;
  formData.value = {
    vm_name: "",
    cluster_id: 0,
    node_name: "",
    app_id: "",
    create_type: "template",
    template_id: undefined,
    iso_volid: undefined,
    guest_os_type: "Linux",
    kernel: "6.x",
    graphic_card: "std",
    scsi_controller: "virtio-scsi-pci",
    machine: "q35",
    qemu_agent: true,
    bios: "seabios",
    add_tpm: false,
    sockets: 1,
    cpu_type: "host",
    cores: 2,
    total_cores: 2,
    memory_size: 4096,
    disks: [
      {
        storage: "",
        size: 32,
        format: "qcow2",
        cache: "writeback"
      }
    ],
    networks: [
      {
        bridge: "vmbr0",
        model: "virtio",
        vlan_tag: undefined,
        mac_address: "",
        firewall: true
      }
    ],
    description: ""
  };
  dialogVisible.value = false;
};

// 监听对话框打开
watch(dialogVisible, (val) => {
  if (val) {
    loadBaseData();
  }
});

onMounted(() => {
  if (dialogVisible.value) {
    loadBaseData();
  }
});
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="t('pve.vm.createVm')"
    width="900px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @close="handleClose"
  >
    <div v-loading="loading" class="create-vm-container">
      <!-- 步骤条 -->
      <el-steps :active="activeStep" finish-status="success" align-center>
        <el-step
          v-for="(step, index) in steps"
          :key="index"
          :title="step.title"
        />
      </el-steps>

      <div class="step-content">
        <!-- 步骤1: 基本信息 -->
        <div v-show="activeStep === 0" class="step-panel">
          <el-form label-width="140px" label-position="right">
            <el-form-item :label="t('pve.vm.vmName')" required>
              <el-input
                v-model="formData.vm_name"
                :placeholder="t('pve.common.pleaseInput')"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item :label="t('pve.cluster.clusterName')" required>
              <el-select
                v-model="formData.cluster_id"
                filterable
                :placeholder="t('pve.common.pleaseSelect')"
                style="width: 100%"
                @change="formData.node_name = ''"
              >
                <el-option
                  v-for="item in clusters"
                  :key="item.id"
                  :label="item.cluster_name_alias || item.cluster_name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.node.nodeName')" required>
              <el-select
                v-model="formData.node_name"
                filterable
                :placeholder="t('pve.common.pleaseSelect')"
                style="width: 100%"
                :disabled="!formData.cluster_id"
              >
                <el-option
                  v-for="item in filteredNodes"
                  :key="item.id"
                  :label="item.node_name"
                  :value="item.node_name"
                />
              </el-select>
            </el-form-item>

            <el-form-item label="APP ID">
              <el-input
                v-model="formData.app_id"
                :placeholder="t('pve.common.pleaseInput')"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.createType')" required>
              <el-radio-group v-model="formData.create_type">
                <el-radio label="template">{{ t("pve.vm.create.fromTemplate") }}</el-radio>
                <el-radio label="iso">{{ t("pve.vm.create.fromIso") }}</el-radio>
              </el-radio-group>
            </el-form-item>

            <el-form-item
              v-if="formData.create_type === 'template'"
              :label="t('pve.template.templateName')"
              required
            >
              <el-select
                v-model="formData.template_id"
                filterable
                :placeholder="t('pve.common.pleaseSelect')"
                style="width: 100%"
                :disabled="!formData.cluster_id"
              >
                <el-option
                  v-for="item in filteredTemplates"
                  :key="item.id"
                  :label="item.template_name"
                  :value="item.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item
              v-if="formData.create_type === 'iso'"
              :label="t('pve.vm.create.isoImage')"
              required
            >
              <el-select
                v-model="formData.iso_volid"
                filterable
                :placeholder="t('pve.common.pleaseSelect')"
                style="width: 100%"
                :disabled="!formData.node_name"
              >
                <el-option
                  v-for="item in isoImages"
                  :key="item.volid"
                  :label="item.volid"
                  :value="item.volid"
                />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤2: OS设置 -->
        <div v-show="activeStep === 1" class="step-panel">
          <el-form label-width="140px" label-position="right">
            <el-form-item :label="t('pve.vm.create.guestOsType')">
              <el-select
                v-model="formData.guest_os_type"
                style="width: 100%"
              >
                <el-option label="Linux" value="Linux" />
                <el-option label="Windows" value="Windows" />
                <el-option label="Other" value="Other" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.kernel')">
              <el-select v-model="formData.kernel" style="width: 100%">
                <el-option label="6.x" value="6.x" />
                <el-option label="2.6" value="2.6" />
              </el-select>
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤3: 系统配置 -->
        <div v-show="activeStep === 2" class="step-panel">
          <el-form label-width="140px" label-position="right">
            <el-form-item :label="t('pve.vm.create.graphicCard')">
              <el-select
                v-model="formData.graphic_card"
                style="width: 100%"
              >
                <el-option label="std" value="std" />
                <el-option label="vmware" value="vmware" />
                <el-option label="cirrus" value="cirrus" />
                <el-option label="qxl" value="qxl" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.scsiController')">
              <el-select
                v-model="formData.scsi_controller"
                style="width: 100%"
              >
                <el-option
                  label="virtio-scsi-pci"
                  value="virtio-scsi-pci"
                />
                <el-option label="lsi" value="lsi" />
                <el-option label="lsi53c810a" value="lsi53c810a" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.machine')">
              <el-select v-model="formData.machine" style="width: 100%">
                <el-option label="q35" value="q35" />
                <el-option label="pc" value="pc" />
                <el-option label="pc-i440fx-7.2" value="pc-i440fx-7.2" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.qemuAgent')">
              <el-switch v-model="formData.qemu_agent" />
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.bios')">
              <el-select v-model="formData.bios" style="width: 100%">
                <el-option label="SeaBIOS" value="seabios" />
                <el-option label="OVMF (UEFI)" value="ovmf" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.addTpm')">
              <el-switch v-model="formData.add_tpm" />
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤4: 磁盘配置 -->
        <div v-show="activeStep === 3" class="step-panel">
          <div
            v-for="(disk, index) in formData.disks"
            :key="index"
            class="disk-item"
          >
            <div class="disk-header">
              <span class="disk-title">{{ t("pve.vm.create.disk") }} {{ index + 1 }}</span>
              <el-button
                v-if="formData.disks && formData.disks.length > 1"
                type="danger"
                link
                size="small"
                @click="removeDisk(index)"
              >
                {{ t("pve.common.delete") }}
              </el-button>
            </div>
            <el-form label-width="120px" label-position="right">
              <el-form-item :label="t('pve.vm.storage')" required>
                <el-select
                  v-model="disk.storage"
                  filterable
                  :placeholder="t('pve.common.pleaseSelect')"
                  style="width: 100%"
                >
                  <el-option
                    v-for="item in filteredStorages"
                    :key="item.id"
                    :label="item.storage_name"
                    :value="item.storage_name"
                  />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.diskSize') + ' (GB)'" required>
                <el-input-number
                  v-model="disk.size"
                  :min="1"
                  :max="10000"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.diskFormat')">
                <el-select v-model="disk.format" style="width: 100%">
                  <el-option label="qcow2" value="qcow2" />
                  <el-option label="raw" value="raw" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.cacheMode')">
                <el-select v-model="disk.cache" style="width: 100%">
                  <el-option label="writeback" value="writeback" />
                  <el-option label="writethrough" value="writethrough" />
                  <el-option label="none" value="none" />
                </el-select>
              </el-form-item>
            </el-form>
          </div>
          <el-button type="primary" link @click="addDisk">
            <el-icon><Plus /></el-icon>
            {{ t("pve.vm.create.addDisk") }}
          </el-button>
        </div>

        <!-- 步骤5: CPU和内存 -->
        <div v-show="activeStep === 4" class="step-panel">
          <el-form label-width="140px" label-position="right">
            <el-form-item :label="t('pve.vm.create.sockets')">
              <el-input-number
                v-model="formData.sockets"
                :min="1"
                :max="16"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.cores')">
              <el-input-number
                v-model="formData.cores"
                :min="1"
                :max="64"
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.totalCores')">
              <el-input
                :model-value="formData.total_cores"
                disabled
                style="width: 100%"
              />
            </el-form-item>

            <el-form-item :label="t('pve.vm.create.cpuType')">
              <el-select v-model="formData.cpu_type" style="width: 100%">
                <el-option label="host" value="host" />
                <el-option label="kvm64" value="kvm64" />
                <el-option label="qemu64" value="qemu64" />
              </el-select>
            </el-form-item>

            <el-form-item :label="t('pve.vm.memorySize') + ' (MB)'" required>
              <el-input-number
                v-model="formData.memory_size"
                :min="512"
                :step="512"
                style="width: 100%"
              />
            </el-form-item>
          </el-form>
        </div>

        <!-- 步骤6: 网络配置 -->
        <div v-show="activeStep === 5" class="step-panel">
          <div
            v-for="(network, index) in formData.networks"
            :key="index"
            class="network-item"
          >
            <div class="network-header">
              <span class="network-title">{{ t("pve.vm.create.network") }} {{ index + 1 }}</span>
              <el-button
                v-if="formData.networks && formData.networks.length > 1"
                type="danger"
                link
                size="small"
                @click="removeNetwork(index)"
              >
                {{ t("pve.common.delete") }}
              </el-button>
            </div>
            <el-form label-width="120px" label-position="right">
              <el-form-item :label="t('pve.vm.create.bridge')" required>
                <el-input
                  v-model="network.bridge"
                  :placeholder="t('pve.common.pleaseInput')"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.model')" required>
                <el-select v-model="network.model" style="width: 100%">
                  <el-option label="virtio" value="virtio" />
                  <el-option label="e1000" value="e1000" />
                  <el-option label="rtl8139" value="rtl8139" />
                </el-select>
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.vlanTag')">
                <el-input-number
                  v-model="network.vlan_tag"
                  :min="1"
                  :max="4094"
                  style="width: 100%"
                />
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.macAddress')">
                <el-input
                  v-model="network.mac_address"
                  :placeholder="t('pve.vm.create.autoGenerate')"
                  style="width: 100%"
                >
                  <template #append>
                    <el-button @click="network.mac_address = generateMacAddress(index)">
                      {{ t("pve.vm.create.generate") }}
                    </el-button>
                  </template>
                </el-input>
              </el-form-item>
              <el-form-item :label="t('pve.vm.create.firewall')">
                <el-switch v-model="network.firewall" />
              </el-form-item>
            </el-form>
          </div>
          <el-button type="primary" link @click="addNetwork">
            <el-icon><Plus /></el-icon>
            {{ t("pve.vm.create.addNetwork") }}
          </el-button>
        </div>

        <!-- 步骤7: 配置确认 -->
        <div v-show="activeStep === 6" class="step-panel">
          <el-descriptions :column="2" border>
            <el-descriptions-item :label="t('pve.vm.vmName')">
              {{ formData.vm_name }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.cluster.clusterName')">
              {{
                clusters.find(c => c.id === formData.cluster_id)
                  ?.cluster_name_alias ||
                clusters.find(c => c.id === formData.cluster_id)?.cluster_name
              }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.node.nodeName')">
              {{ formData.node_name }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.create.createType')">
              {{
                formData.create_type === "template"
                  ? t("pve.vm.create.fromTemplate")
                  : t("pve.vm.create.fromIso")
              }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.create.guestOsType')">
              {{ formData.guest_os_type }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.memorySize')">
              {{ formData.memory_size }} MB
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.create.totalCores')">
              {{ formData.total_cores }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.create.diskCount')">
              {{ formData.disks?.length || 0 }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('pve.vm.create.networkCount')">
              {{ formData.networks?.length || 0 }}
            </el-descriptions-item>
          </el-descriptions>
        </div>
      </div>
    </div>

    <template #footer>
      <div class="dialog-footer">
        <el-button @click="handleClose">{{ t("pve.common.cancel") }}</el-button>
        <el-button v-if="activeStep > 0" @click="prevStep">
          {{ t("pve.vm.create.prevStep") }}
        </el-button>
        <el-button
          v-if="activeStep < steps.length - 1"
          type="primary"
          @click="nextStep"
        >
          {{ t("pve.vm.create.nextStep") }}
        </el-button>
        <el-button
          v-else
          type="primary"
          :loading="submitting"
          @click="handleSubmit"
        >
          {{ t("pve.common.confirm") }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.create-vm-container {
  padding: 20px 0;
}

.step-content {
  margin-top: 30px;
  min-height: 400px;
}

.step-panel {
  padding: 20px;
}

.disk-item,
.network-item {
  margin-bottom: 20px;
  padding: 16px;
  border: 1px solid var(--el-border-color);
  border-radius: 4px;
  background-color: var(--el-bg-color-page);
}

.disk-header,
.network-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.disk-title,
.network-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>

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
import { ref, computed, watch } from "vue";
import { ElMessage, ElForm, ElFormItem } from "element-plus";
import { useI18n } from "vue-i18n";
import {
  createCluster,
  updateCluster,
  verifyClusterApi,
  type Cluster,
  type CreateClusterPayload,
  type UpdateClusterPayload
} from "@/api/pve";

const { t } = useI18n();

const props = defineProps<{
  modelValue: boolean;
  cluster?: Cluster | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "success"): void;
}>();

const dialogVisible = computed({
  get: () => props.modelValue,
  set: (val) => emit("update:modelValue", val)
});

const formRef = ref<InstanceType<typeof ElForm>>();
const loading = ref(false);
const verifying = ref(false);

const isEdit = computed(() => !!props.cluster?.id);

// 表单数据
const formData = ref<CreateClusterPayload>({
  cluster_name: "",
  cluster_name_alias: "",
  env: "",
  datacenter: "",
  api_url: "",
  region: "",
  is_schedulable: 1,
  is_enabled: 1,
  user_id: "",
  user_token: ""
});

// 表单验证规则
const rules = computed(() => ({
  cluster_name: [
    { required: true, message: t('pve.cluster.clusterNameRequired'), trigger: "blur" },
    { min: 1, max: 100, message: t('pve.common.lengthBetween', { min: 1, max: 100 }), trigger: "blur" }
  ],
  cluster_name_alias: [
    { required: true, message: t('pve.cluster.clusterNameAliasRequired'), trigger: "blur" },
    { min: 1, max: 100, message: t('pve.common.lengthBetween', { min: 1, max: 100 }), trigger: "blur" }
  ],
  env: [
    { required: true, message: t('pve.cluster.envRequired'), trigger: "blur" }
  ],
  datacenter: [
    { required: true, message: t('pve.cluster.datacenterRequired'), trigger: "blur" }
  ],
  api_url: [
    { required: true, message: t('pve.cluster.apiUrlRequired'), trigger: "blur" },
    {
      pattern: /^https?:\/\/.+/,
      message: t('pve.cluster.apiUrlInvalid'),
      trigger: "blur"
    }
  ],
  region: [
    { required: true, message: t('pve.cluster.regionRequired'), trigger: "blur" }
  ],
  user_id: [
    { required: true, message: t('pve.cluster.userIdRequired'), trigger: "blur" }
  ],
  user_token: [
    { required: true, message: t('pve.cluster.userTokenRequired'), trigger: "blur" }
  ]
}));

// 监听 cluster 变化，填充表单
watch(
  () => props.cluster,
  (cluster) => {
    if (cluster) {
      formData.value = {
        cluster_name: cluster.cluster_name || "",
        cluster_name_alias: cluster.cluster_name_alias || "",
        env: cluster.env || "",
        datacenter: cluster.datacenter || "",
        api_url: cluster.api_url || "",
        region: cluster.region || "",
        is_schedulable: cluster.is_schedulable ?? 1,
        is_enabled: cluster.is_enabled ?? 1,
        user_id: "",
        user_token: ""
      };
    } else {
      // 重置表单
      formData.value = {
        cluster_name: "",
        cluster_name_alias: "",
        env: "",
        datacenter: "",
        api_url: "",
        region: "",
        is_schedulable: 1,
        is_enabled: 1,
        user_id: "",
        user_token: ""
      };
    }
    // 清除验证状态
    formRef.value?.clearValidate();
  },
  { immediate: true }
);

// 验证API状态
const handleVerifyApi = async () => {
  // 编辑模式：使用 cluster_id 验证
  if (isEdit.value && props.cluster?.id) {
    verifying.value = true;
    try {
      const res = await verifyClusterApi({
        cluster_id: props.cluster.id
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
      verifying.value = false;
    }
    return;
  }

  // 创建模式：使用表单中的 API URL、User ID、User Token 验证
  if (!formData.value.api_url || !formData.value.user_id || !formData.value.user_token) {
    ElMessage.warning(t('pve.cluster.pleaseInputApiCredentials'));
    return;
  }

  verifying.value = true;
  try {
    const res = await verifyClusterApi({
      api_url: formData.value.api_url,
      user_id: formData.value.user_id,
      user_token: formData.value.user_token
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
    verifying.value = false;
  }
};

// 提交表单
const handleSubmit = async () => {
  if (!formRef.value) return;

  await formRef.value.validate(async (valid) => {
    if (!valid) return;

    loading.value = true;
    try {
      if (isEdit.value && props.cluster?.id) {
        // 更新集群
        const updatePayload: UpdateClusterPayload = {
          cluster_name: formData.value.cluster_name,
          cluster_name_alias: formData.value.cluster_name_alias,
          env: formData.value.env,
          datacenter: formData.value.datacenter,
          api_url: formData.value.api_url,
          region: formData.value.region,
          is_schedulable: formData.value.is_schedulable,
          is_enabled: formData.value.is_enabled
        };

        // 如果提供了用户凭证，则更新
        if (formData.value.user_id) {
          updatePayload.user_id = formData.value.user_id;
        }
        if (formData.value.user_token) {
          updatePayload.user_token = formData.value.user_token;
        }

        const res = await updateCluster(props.cluster.id, updatePayload);
        if (res.code === 0) {
          ElMessage.success(t('pve.cluster.updateSuccess'));
          emit("success");
          dialogVisible.value = false;
        } else {
          ElMessage.error(res.message || t('pve.cluster.updateFailed'));
        }
      } else {
        // 创建集群
        const res = await createCluster(formData.value);
        if (res.code === 0) {
          ElMessage.success(t('pve.cluster.createSuccess'));
          emit("success");
          dialogVisible.value = false;
        } else {
          ElMessage.error(res.message || t('pve.cluster.createFailed'));
        }
      }
    } catch (error: any) {
      ElMessage.error(error?.response?.data?.message || error?.message || t('pve.common.failed'));
    } finally {
      loading.value = false;
    }
  });
};

// 取消
const handleCancel = () => {
  dialogVisible.value = false;
};
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? t('pve.cluster.editCluster') : t('pve.cluster.addCluster')"
    width="600px"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    @close="handleCancel"
  >
    <el-form
      ref="formRef"
      :model="formData"
      :rules="rules"
      label-width="120px"
      label-position="right"
    >
      <el-form-item :label="t('pve.cluster.clusterName')" prop="cluster_name">
        <el-input
          v-model="formData.cluster_name"
          :placeholder="t('pve.cluster.pleaseInputClusterName')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.clusterNameAlias')" prop="cluster_name_alias">
        <el-input
          v-model="formData.cluster_name_alias"
          :placeholder="t('pve.cluster.pleaseInputClusterNameAlias')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.envLabel')" prop="env">
        <el-input
          v-model="formData.env"
          :placeholder="t('pve.cluster.pleaseInputEnv')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.datacenterLabel')" prop="datacenter">
        <el-input
          v-model="formData.datacenter"
          :placeholder="t('pve.cluster.pleaseInputDatacenter')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.apiUrlLabel')" prop="api_url">
        <div class="flex items-center gap-2">
          <el-input
            v-model="formData.api_url"
            :placeholder="t('pve.cluster.pleaseInputApiUrl')"
            clearable
            class="flex-1"
          />
          <el-button
            :loading="verifying"
            :disabled="!formData.api_url || !formData.user_id || !formData.user_token"
            @click="handleVerifyApi"
          >
            {{ t('pve.cluster.verifyApi') }}
          </el-button>
        </div>
      </el-form-item>

      <el-form-item :label="t('pve.cluster.regionLabel')" prop="region">
        <el-input
          v-model="formData.region"
          :placeholder="t('pve.cluster.pleaseInputRegion')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.userId')" prop="user_id">
        <el-input
          v-model="formData.user_id"
          :placeholder="t('pve.cluster.pleaseInputUserId')"
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.userToken')" prop="user_token">
        <el-input
          v-model="formData.user_token"
          type="password"
          :placeholder="t('pve.cluster.pleaseInputUserToken')"
          show-password
          clearable
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.isSchedulable')">
        <el-switch
          v-model="formData.is_schedulable"
          :active-value="1"
          :inactive-value="0"
        />
      </el-form-item>

      <el-form-item :label="t('pve.cluster.isEnabled')">
        <el-switch
          v-model="formData.is_enabled"
          :active-value="1"
          :inactive-value="0"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <div class="flex justify-end gap-2">
        <el-button @click="handleCancel">{{ t('pve.common.cancel') }}</el-button>
        <el-button type="primary" :loading="loading" @click="handleSubmit">
          {{ isEdit ? t('pve.common.save') : t('pve.common.create') }}
        </el-button>
      </div>
    </template>
  </el-dialog>
</template>

<style scoped>
.flex {
  display: flex;
}

.items-center {
  align-items: center;
}

.gap-2 {
  gap: 8px;
}

.flex-1 {
  flex: 1;
}

.justify-end {
  justify-content: flex-end;
}
</style>


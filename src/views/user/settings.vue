<template>
  <div class="user-settings-container">
    <el-card class="settings-card">
      <template #header>
        <div class="card-header">
          <span>{{ t("user.settings.title") }}</span>
        </div>
      </template>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-width="120px"
        label-position="left"
      >
        <el-form-item :label="t('user.settings.email')" prop="email">
          <el-input v-model="form.email" disabled />
        </el-form-item>

        <el-form-item :label="t('user.settings.nickname')" prop="nickname">
          <el-input
            v-model="form.nickname"
            :placeholder="t('user.settings.nicknamePlaceholder')"
            clearable
            style="width: 300px"
          />
        </el-form-item>

        <el-divider>
          <span style="color: #909399; font-size: 14px">{{
            t("user.settings.changePassword")
          }}</span>
        </el-divider>

        <el-form-item
          :label="t('user.settings.oldPassword')"
          prop="oldPassword"
        >
          <el-input
            v-model="form.oldPassword"
            type="password"
            show-password
            :placeholder="t('user.settings.oldPasswordPlaceholder')"
            clearable
            style="width: 300px"
          />
        </el-form-item>

        <el-form-item :label="t('user.settings.newPassword')" prop="newPassword">
          <el-input
            v-model="form.newPassword"
            type="password"
            show-password
            :placeholder="t('user.settings.newPasswordPlaceholder')"
            clearable
            style="width: 300px"
          />
        </el-form-item>

        <el-form-item
          :label="t('user.settings.confirmPassword')"
          prop="confirmPassword"
        >
          <el-input
            v-model="form.confirmPassword"
            type="password"
            show-password
            :placeholder="t('user.settings.confirmPasswordPlaceholder')"
            clearable
            style="width: 300px"
          />
        </el-form-item>

        <el-form-item>
          <el-button type="primary" :loading="loading" @click="onSubmit">
            {{ t("user.settings.save") }}
          </el-button>
          <el-button @click="onReset">{{ t("user.settings.reset") }}</el-button>
        </el-form-item>
      </el-form>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from "vue";
import { useI18n } from "vue-i18n";
import { message } from "@/utils/message";
import type { FormInstance, FormRules } from "element-plus";
import { getUserInfo, updateUserInfo } from "@/api/user";
import { useUserStoreHook } from "@/store/modules/user";
import { REGEXP_PWD } from "@/views/login/utils/rule";

const { t } = useI18n();

defineOptions({
  name: "UserSettings"
});

const formRef = ref<FormInstance>();
const loading = ref(false);
const form = reactive({
  email: "",
  nickname: "",
  oldPassword: "",
  newPassword: "",
  confirmPassword: ""
});

// 确认密码验证
const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (form.newPassword && !value) {
    callback(new Error(t("user.settings.confirmPasswordRequired")));
  } else if (form.newPassword && value !== form.newPassword) {
    callback(new Error(t("user.settings.confirmPasswordMismatch")));
  } else {
    callback();
  }
};

// 新密码验证（只有填写了新密码才验证）
const validateNewPassword = (rule: any, value: string, callback: any) => {
  if (!value) {
    // 新密码为空时不验证（表示不修改密码）
    callback();
  } else if (!REGEXP_PWD.test(value)) {
    callback(new Error(t("user.settings.passwordRule")));
  } else {
    callback();
  }
};

// 当前密码验证（只有填写了新密码时才需要验证当前密码）
const validateOldPassword = (rule: any, value: string, callback: any) => {
  if (form.newPassword && !value) {
    callback(new Error(t("user.settings.oldPasswordRequired")));
  } else {
    callback();
  }
};

const rules = reactive<FormRules>({
  nickname: [
    {
      required: true,
      message: t("user.settings.nicknameRequired"),
      trigger: "blur"
    },
    {
      min: 1,
      max: 50,
      message: t("user.settings.nicknameLength"),
      trigger: "blur"
    }
  ],
  oldPassword: [
    {
      validator: validateOldPassword,
      trigger: "blur"
    }
  ],
  newPassword: [
    {
      validator: validateNewPassword,
      trigger: "blur"
    }
  ],
  confirmPassword: [
    {
      validator: validateConfirmPassword,
      trigger: "blur"
    }
  ]
});

// 加载用户信息
const loadUserInfo = async () => {
  try {
    loading.value = true;
    const res = await getUserInfo();
    const userInfo = (res as any)?.data || res;
    form.email = userInfo?.email || "";
    form.nickname = userInfo?.nickname || "";
  } catch (error) {
    message(t("user.settings.getUserInfoFailed"), { type: "error" });
  } finally {
    loading.value = false;
  }
};

// 提交表单
const onSubmit = async () => {
  if (!formRef.value) return;
  await formRef.value.validate(valid => {
    if (valid) {
      loading.value = true;
      const updateData: any = {
        nickname: form.nickname
      };

      // 如果填写了新密码，则添加密码相关字段
      if (form.newPassword) {
        updateData.oldPassword = form.oldPassword;
        updateData.newPassword = form.newPassword;
      }

      updateUserInfo(updateData)
        .then(res => {
          if (res.code === 200 || res.code === 0) {
            message(t("user.settings.saveSuccess"), { type: "success" });
            // 更新 store 中的用户信息
            useUserStoreHook().SET_NICKNAME(form.nickname);
            // 如果修改了密码，清空密码相关字段
            if (form.newPassword) {
              form.oldPassword = "";
              form.newPassword = "";
              form.confirmPassword = "";
            }
            // 重新加载用户信息
            loadUserInfo();
          } else {
            message(
              res.message || t("user.settings.saveFailed"),
              { type: "error" }
            );
          }
        })
        .catch(error => {
          message(
            error?.response?.data?.message ||
              error?.message ||
              t("user.settings.saveFailed"),
            { type: "error" }
          );
        })
        .finally(() => {
          loading.value = false;
        });
    }
  });
};

// 重置表单
const onReset = () => {
  formRef.value?.resetFields();
  loadUserInfo();
};

onMounted(() => {
  loadUserInfo();
});
</script>

<style scoped lang="scss">
.user-settings-container {
  padding: 20px;
  min-height: calc(100vh - 84px);
}

.settings-card {
  max-width: 800px;
  margin: 0 auto;
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 18px;
  font-weight: 500;
}
</style>


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
import { useI18n } from "vue-i18n";
import Motion from "./utils/motion";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import { loginRules } from "./utils/rule";
import { ref, reactive, toRaw } from "vue";
import { debounce } from "@pureadmin/utils";
import { useNav } from "@/layout/hooks/useNav";
import { useEventListener } from "@vueuse/core";
import type { FormInstance } from "element-plus";
import { $t, transformI18n } from "@/plugins/i18n";
import { useLayout } from "@/layout/hooks/useLayout";
import { useUserStoreHook } from "@/store/modules/user";
import { initRouter, getTopMenu } from "@/router/utils";
import { bg, avatar, illustration } from "./utils/static";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { useTranslationLang } from "@/layout/hooks/useTranslationLang";
import { useDataThemeChange } from "@/layout/hooks/useDataThemeChange";

import dayIcon from "@/assets/svg/day.svg?component";
import darkIcon from "@/assets/svg/dark.svg?component";
import globalization from "@/assets/svg/globalization.svg?component";
import Lock from "~icons/ri/lock-fill";
import Check from "~icons/ep/check";
import User from "~icons/ri/user-3-fill";

defineOptions({
  name: "Login"
});

const router = useRouter();
const loading = ref(false);
const disabled = ref(false);
const ruleFormRef = ref<FormInstance>();

const { initStorage } = useLayout();
initStorage();

const { t } = useI18n();
const { dataTheme, overallStyle, dataThemeChange } = useDataThemeChange();
dataThemeChange(overallStyle.value);
const { title, getDropdownItemStyle, getDropdownItemClass } = useNav();
const { locale, translationCh, translationEn } = useTranslationLang();

// 存储历史登录账户的 key
const LOGIN_ACCOUNTS_KEY = "pvesphere_login_accounts";
const MAX_ACCOUNTS = 10; // 最多保存10个账户

// 从本地存储获取历史登录账户
const getStoredAccounts = (): string[] => {
  try {
    const stored = localStorage.getItem(LOGIN_ACCOUNTS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// 保存账户到历史记录
const saveAccount = (account: string) => {
  if (!account) return;
  try {
    const accounts = getStoredAccounts();
    // 移除已存在的相同账户
    const filtered = accounts.filter(a => a !== account);
    // 添加到最前面
    filtered.unshift(account);
    // 只保留前 MAX_ACCOUNTS 个
    const limited = filtered.slice(0, MAX_ACCOUNTS);
    localStorage.setItem(LOGIN_ACCOUNTS_KEY, JSON.stringify(limited));
  } catch (error) {
    console.error("保存账户失败:", error);
  }
};

const ruleForm = reactive({
  account: getStoredAccounts()[0] || "",
  password: ""
});

const accountOptions = ref<string[]>(getStoredAccounts());

const onLogin = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate(valid => {
    if (valid) {
      loading.value = true;
      useUserStoreHook()
        .loginByUsername({
          account: ruleForm.account,
          password: ruleForm.password
        })
        .then(res => {
          if (res.success) {
            // 保存登录成功的账户到历史记录
            saveAccount(ruleForm.account);
            accountOptions.value = getStoredAccounts();
            // 获取后端路由
            return initRouter().then(() => {
              disabled.value = true;
              router
                .push(getTopMenu(true).path)
                .then(() => {
                  message(t("login.pureLoginSuccess"), { type: "success" });
                })
                .finally(() => (disabled.value = false));
            });
          } else {
            message(t("login.pureLoginFailTip"), { type: "error" });
          }
        })
        .catch(error => {
          // 处理登录失败的错误
          const errorMessage =
            error?.response?.data?.message ||
            error?.message ||
            t("login.pureLoginFailTip");
          message(errorMessage, { type: "error" });
        })
        .finally(() => (loading.value = false));
    }
  });
};

const immediateDebounce: any = debounce(
  formRef => onLogin(formRef),
  1000,
  true
);

useEventListener(document, "keydown", ({ code }) => {
  if (
    ["Enter", "NumpadEnter"].includes(code) &&
    !disabled.value &&
    !loading.value
  )
    immediateDebounce(ruleFormRef.value);
});
</script>

<template>
  <div class="select-none">
    <img :src="bg" class="wave" />
    <div class="flex-c absolute right-5 top-3">
      <!-- 主题 -->
      <el-switch
        v-model="dataTheme"
        inline-prompt
        :active-icon="dayIcon"
        :inactive-icon="darkIcon"
        @change="dataThemeChange"
      />
      <!-- 国际化 -->
      <el-dropdown trigger="click">
        <globalization
          class="hover:text-primary hover:bg-[transparent]! w-[20px] h-[20px] ml-1.5 cursor-pointer outline-hidden duration-300"
        />
        <template #dropdown>
          <el-dropdown-menu class="translation">
            <el-dropdown-item
              :style="getDropdownItemStyle(locale, 'zh')"
              :class="['dark:text-white!', getDropdownItemClass(locale, 'zh')]"
              @click="translationCh"
            >
              <IconifyIconOffline
                v-show="locale === 'zh'"
                class="check-zh"
                :icon="Check"
              />
              简体中文
            </el-dropdown-item>
            <el-dropdown-item
              :style="getDropdownItemStyle(locale, 'en')"
              :class="['dark:text-white!', getDropdownItemClass(locale, 'en')]"
              @click="translationEn"
            >
              <span v-show="locale === 'en'" class="check-en">
                <IconifyIconOffline :icon="Check" />
              </span>
              English
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>
    <div class="login-container">
      <div class="img">
        <component :is="toRaw(illustration)" />
      </div>
      <div class="login-box">
        <div class="login-form">
          <avatar class="avatar" />
          <Motion>
            <h2 class="outline-hidden">{{ title }}</h2>
          </Motion>

          <el-form
            ref="ruleFormRef"
            :model="ruleForm"
            :rules="loginRules"
            size="large"
          >
            <Motion :delay="100">
              <el-form-item prop="account">
                <el-select
                  v-model="ruleForm.account"
                  filterable
                  allow-create
                  default-first-option
                  placeholder="请输入或选择用户名/邮箱"
                  clearable
                  style="width: 100%"
                >
                  <el-option
                    v-for="account in accountOptions"
                    :key="account"
                    :label="account"
                    :value="account"
                  />
                </el-select>
              </el-form-item>
            </Motion>

            <Motion :delay="150">
              <el-form-item prop="password">
                <el-input
                  v-model="ruleForm.password"
                  clearable
                  show-password
                  :placeholder="t('login.purePassword')"
                  :prefix-icon="useRenderIcon(Lock)"
                />
              </el-form-item>
            </Motion>

            <Motion :delay="250">
              <el-button
                class="w-full mt-4!"
                size="default"
                type="primary"
                :loading="loading"
                :disabled="disabled"
                @click="onLogin(ruleFormRef)"
              >
                {{ t("login.pureLogin") }}
              </el-button>
            </Motion>
          </el-form>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@import url("@/style/login.css");
</style>

<style lang="scss" scoped>
:deep(.el-input-group__append, .el-input-group__prepend) {
  padding: 0;
}

.translation {
  ::v-deep(.el-dropdown-menu__item) {
    padding: 5px 40px;
  }

  .check-zh {
    position: absolute;
    left: 20px;
  }

  .check-en {
    position: absolute;
    left: 20px;
  }
}
</style>

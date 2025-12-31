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
import { useNav } from "@/layout/hooks/useNav";
import MdiKeyboardEsc from "@/assets/svg/keyboard_esc.svg?component";
import EnterOutlined from "@/assets/svg/enter_outlined.svg?component";
import ArrowUpLine from "~icons/ri/arrow-up-line";
import ArrowDownLine from "~icons/ri/arrow-down-line";

withDefaults(defineProps<{ total?: number }>(), {
  total: 0
});

const { t } = useI18n();
const { device } = useNav();
</script>

<template>
  <div class="search-footer text-[#333] dark:text-white">
    <span class="search-footer-item">
      <EnterOutlined class="icon" />
      {{ t("buttons.pureConfirm") }}
    </span>
    <span class="search-footer-item">
      <IconifyIconOffline :icon="ArrowUpLine" class="icon" />
      <IconifyIconOffline :icon="ArrowDownLine" class="icon" />
      {{ t("buttons.pureSwitch") }}
    </span>
    <span class="search-footer-item">
      <MdiKeyboardEsc class="icon" />
      {{ t("buttons.pureClose") }}
    </span>
    <p v-if="device !== 'mobile' && total > 0" class="search-footer-total">
      {{ `${t("search.pureTotal")} ${total}` }}
    </p>
  </div>
</template>

<style lang="scss" scoped>
.search-footer {
  display: flex;

  .search-footer-item {
    display: flex;
    align-items: center;
    margin-right: 14px;
  }

  .icon {
    padding: 2px;
    margin-right: 3px;
    font-size: 20px;
    box-shadow:
      inset 0 -2px #cdcde6,
      inset 0 0 1px 1px #fff,
      0 1px 2px 1px #1e235a66;
  }

  .search-footer-total {
    position: absolute;
    right: 20px;
  }
}
</style>

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

import type { VNode, Component } from "vue";
import type { iconType } from "@/components/ReIcon/src/types.ts";

export interface OptionsType {
  /** 文字 */
  label?: string | (() => VNode | Component);
  /**
   * @description 图标，采用平台内置的 `useRenderIcon` 函数渲染
   * @see {@link 用法参考 https://pure-admin.cn/pages/icon/#%E9%80%9A%E7%94%A8%E5%9B%BE%E6%A0%87-userendericon-hooks }
   */
  icon?: string | Component;
  /** 图标属性、样式配置 */
  iconAttrs?: iconType;
  /** 值 */
  value?: any;
  /** 是否禁用 */
  disabled?: boolean;
  /** `tooltip` 提示 */
  tip?: string;
}

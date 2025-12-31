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

import type { Directive } from "vue";
import type { CopyEl, OptimizeOptions, RippleOptions } from "@/directives";

declare module "vue" {
  export interface ComponentCustomProperties {
    /** `Loading` 动画加载指令，具体看：https://element-plus.org/zh-CN/component/loading.html#%E6%8C%87%E4%BB%A4 */
    vLoading: Directive<Element, boolean>;
    /** 按钮权限指令（根据路由`meta`中的`auths`字段进行判断）*/
    vAuth: Directive<HTMLElement, string | Array<string>>;
    /** 文本复制指令（默认双击复制） */
    vCopy: Directive<CopyEl, string>;
    /** 长按指令 */
    vLongpress: Directive<HTMLElement, Function>;
    /** 防抖、节流指令 */
    vOptimize: Directive<HTMLElement, OptimizeOptions>;
    /** 按钮权限指令（根据登录接口返回的`permissions`字段进行判断）*/
    vPerms: Directive<HTMLElement, string | Array<string>>;
    /**
     * `v-ripple`指令，用法如下：
     * 1. `v-ripple`代表启用基本的`ripple`功能
     * 2. `v-ripple="{ class: 'text-red' }"`代表自定义`ripple`颜色，支持`tailwindcss`，生效样式是`color`
     * 3. `v-ripple.center`代表从中心扩散
     */
    vRipple: Directive<HTMLElement, RippleOptions>;
  }
}

export {};

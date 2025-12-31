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

import { $t } from "@/plugins/i18n";
const { VITE_HIDE_HOME } = import.meta.env;
const Layout = () => import("@/layout/index.vue");

export default {
  path: "/",
  name: "Home",
  component: Layout,
  redirect: "/pve/dashboard",
  meta: {
    icon: "ep/home-filled",
    title: $t("menus.pureHome"),
    rank: 0,
    showLink: false
  },
  children: [
    {
      path: "/user/settings",
      name: "UserSettings",
      component: () => import("@/views/user/settings.vue"),
      meta: {
        title: "用户设置",
        icon: "ep:user",
        rank: 100
      }
    }
  ]
} satisfies RouteConfigsTable;

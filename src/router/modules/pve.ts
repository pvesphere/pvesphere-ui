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

export default {
  path: "/pve",
  redirect: "/pve/dashboard",
  meta: {
    icon: "ep:cpu",
    title: $t("menus.purePveManagement"),
    rank: 5
  },
  children: [
    {
      path: "/pve/dashboard",
      name: "PveDashboard",
      component: () => import("@/views/pve/dashboard/HomeDashboard.vue"),
      meta: {
        title: $t("menus.purePveOverview")
      }
    },
    {
      path: "/pve/clusters",
      name: "PveClusters",
      component: () => import("@/views/pve/cluster/index.vue"),
      meta: {
        title: $t("menus.purePveDatacenter")
      }
    },
    {
      path: "/pve/nodes",
      name: "PveNodes",
      component: () => import("@/views/pve/node/index.vue"),
      meta: {
        title: $t("menus.purePveNodes")
      }
    },
    {
      path: "/pve/vms",
      name: "PveVms",
      component: () => import("@/views/pve/vm/index.vue"),
      meta: {
        title: $t("menus.purePveVms")
      }
    },
    {
      path: "/pve/storages",
      name: "PveStorages",
      component: () => import("@/views/pve/storage/index.vue"),
      meta: {
        title: $t("menus.purePveStorage")
      }
    },
    {
      path: "/pve/templates",
      name: "PveTemplates",
      component: () => import("@/views/pve/template/index.vue"),
      meta: {
        title: $t("menus.purePveTemplates")
      }
    }
  ]
} satisfies RouteConfigsTable;



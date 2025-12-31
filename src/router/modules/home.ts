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

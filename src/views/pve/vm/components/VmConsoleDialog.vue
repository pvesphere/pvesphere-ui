<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import RFB from "@novnc/novnc/lib/rfb.js";
import FullscreenIcon from "~icons/ri/fullscreen-fill";
import ExitFullscreenIcon from "~icons/ri/fullscreen-exit-fill";
import ExpandIcon from "~icons/ri/arrow-right-s-line";
import CollapseIcon from "~icons/ri/arrow-left-s-line";
// element-plus 由父组件负责提示，这里不主动弹消息

const props = defineProps<{
  modelValue: boolean;
  title: string;
  wsUrl: string;
  password?: string;
  loading?: boolean;
  guestRunning?: boolean;
  startLoading?: boolean;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
  (e: "refresh"): void;
  (e: "start"): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: val => emit("update:modelValue", val)
});

const screenRef = ref<HTMLDivElement | null>(null);
let rfb: RFB | null = null;

const maximized = ref(false);
const toolsPanelOpen = ref(false);
const ctrlActive = ref(false);
const altActive = ref(false);
const metaActive = ref(false);
const status = ref<"idle" | "connecting" | "connected" | "disconnected" | "error">("idle");
const statusDetail = ref("");

const dialogWidth = computed(() => (maximized.value ? "100%" : "78%"));
const dialogTop = computed(() => (maximized.value ? "0" : "6vh"));
const dialogStyle = computed(() => (maximized.value ? {} : { maxWidth: "1200px" }));

const statusText = computed(() => {
  if (props.guestRunning === false) return "未开机";
  switch (status.value) {
    case "connecting":
      return "连接中…";
    case "connected":
      return "已连接";
    case "disconnected":
      return "已断开";
    case "error":
      return "连接失败";
    default:
      return "未连接";
  }
});

const cleanup = () => {
  if (rfb) {
    try {
      rfb.disconnect();
    } catch {
      // ignore
    }
    rfb = null;
  }
  status.value = "idle";
  statusDetail.value = "";
  ctrlActive.value = false;
  altActive.value = false;
  metaActive.value = false;
};

const sendKey = (keysym: number, code: string, down: boolean) => {
  if (!rfb) return;
  try {
    rfb.sendKey(keysym, code, down);
  } catch {
    // ignore
  }
};

const tapKey = (keysym: number, code: string) => {
  sendKey(keysym, code, true);
  sendKey(keysym, code, false);
};

const toggleModifier = (name: "ctrl" | "alt" | "meta") => {
  if (name === "ctrl") {
    ctrlActive.value = !ctrlActive.value;
    // Control_L keysym: 0xFFE3
    sendKey(0xffe3, "ControlLeft", ctrlActive.value);
    return;
  }
  if (name === "alt") {
    altActive.value = !altActive.value;
    // Alt_L keysym: 0xFFE9
    sendKey(0xffe9, "AltLeft", altActive.value);
    return;
  }
  metaActive.value = !metaActive.value;
  // Super_L keysym: 0xFFEB
  sendKey(0xffeb, "MetaLeft", metaActive.value);
};

const sendCtrlAltDel = () => {
  if (!rfb) return;
  // 优先使用 noVNC 内置方法（若存在）
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const anyRfb: any = rfb as any;
  if (typeof anyRfb.sendCtrlAltDel === "function") {
    anyRfb.sendCtrlAltDel();
    return;
  }
  // 兜底：手动发送 Ctrl+Alt+Delete
  const tmpCtrl = !ctrlActive.value;
  const tmpAlt = !altActive.value;
  if (tmpCtrl) sendKey(0xffe3, "ControlLeft", true);
  if (tmpAlt) sendKey(0xffe9, "AltLeft", true);
  // Delete keysym: 0xFFFF
  tapKey(0xffff, "Delete");
  if (tmpAlt) sendKey(0xffe9, "AltLeft", false);
  if (tmpCtrl) sendKey(0xffe3, "ControlLeft", false);
};

const connect = async () => {
  if (!visible.value) return;
  if (props.loading) return;
  if (props.guestRunning === false) return;
  if (!props.wsUrl) return;
  if (!screenRef.value) return;

  cleanup();
  status.value = "connecting";

  await nextTick();
  if (!screenRef.value) return;

  try {
    rfb = new RFB(
      screenRef.value,
      props.wsUrl,
      props.password ? { credentials: { password: props.password } } : undefined
    );

    // UX
    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.showDotCursor = true;

    rfb.addEventListener("connect", () => {
      status.value = "connected";
      statusDetail.value = "";
    });

    rfb.addEventListener("disconnect", (e: any) => {
      const clean = Boolean(e?.detail?.clean);
      // 断开连接时不保持修饰键状态，避免“按键卡住”的错觉
      ctrlActive.value = false;
      altActive.value = false;
      metaActive.value = false;

      status.value = clean ? "disconnected" : "error";
      statusDetail.value = e?.detail?.reason || "";
    });

    rfb.addEventListener("securityfailure", (e: any) => {
      status.value = "error";
      statusDetail.value = e?.detail?.reason || "security failure";
    });

    rfb.addEventListener("credentialsrequired", () => {
      if (props.password && rfb) {
        rfb.sendCredentials({ password: props.password });
      }
    });
  } catch (err: any) {
    status.value = "error";
    statusDetail.value = err?.message || "连接失败";
  }
};

const handleReconnect = () => {
  // token 单次使用：建议刷新 token 再连
  emit("refresh");
};

const handleStartNow = () => {
  emit("start");
};

const toggleMaximize = async () => {
  maximized.value = !maximized.value;
  await nextTick();
  // 触发布局变化，让 noVNC 重新适配容器大小
  window.dispatchEvent(new Event("resize"));
};

const toggleToolsPanel = () => {
  toolsPanelOpen.value = !toolsPanelOpen.value;
};

watch(
  () => visible.value,
  async val => {
    if (val) {
      await connect();
    } else {
      cleanup();
    }
  }
);

watch(
  () => props.wsUrl,
  async () => {
    if (visible.value) {
      await connect();
    }
  }
);

onUnmounted(() => cleanup());
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="title"
    :width="dialogWidth"
    :fullscreen="maximized"
    :top="dialogTop"
    :close-on-click-modal="false"
    :destroy-on-close="true"
    :style="dialogStyle"
  >
    <div class="console-toolbar">
      <div class="console-status">
        <span class="status-dot" :class="status" />
        <span>{{ statusText }}</span>
        <span v-if="statusDetail" class="status-detail">- {{ statusDetail }}</span>
      </div>
      <div class="console-actions">
        <el-button :disabled="loading || startLoading" @click="handleReconnect">重新连接</el-button>
      </div>
    </div>

    <div v-loading="loading" class="console-body">
      <div v-if="guestRunning === false && !loading" class="console-guest-off">
        <div class="guest-off-card">
          <div class="guest-off-title">Guest not running</div>
          <el-button
            type="primary"
            :loading="startLoading"
            @click="handleStartNow"
          >
            Start Now
          </el-button>
        </div>
      </div>
      <div v-if="!wsUrl && !loading" class="console-empty">
        <el-empty description="暂无控制台连接信息" />
      </div>
      <div v-else class="console-screen">
        <div ref="screenRef" class="console-screen-inner" />
        <!-- 默认只显示侧边展开按钮，点击后展示整列工具 -->
        <button
          class="vnc-side-toggle"
          type="button"
          :title="toolsPanelOpen ? '收起' : '展开'"
          @click="toggleToolsPanel"
        >
          <component :is="toolsPanelOpen ? CollapseIcon : ExpandIcon" />
        </button>

        <div v-if="toolsPanelOpen" class="vnc-float-panel">
          <button
            class="vnc-panel-btn"
            type="button"
            :title="maximized ? '还原' : '最大化'"
            @click="toggleMaximize"
          >
            <component :is="maximized ? ExitFullscreenIcon : FullscreenIcon" />
          </button>

          <button
            class="vnc-panel-btn"
            type="button"
            :class="{ active: ctrlActive }"
            :aria-pressed="ctrlActive"
            title="Ctrl"
            @click="toggleModifier('ctrl')"
          >
            Ctrl
          </button>
          <button
            class="vnc-panel-btn"
            type="button"
            :class="{ active: altActive }"
            :aria-pressed="altActive"
            title="Alt"
            @click="toggleModifier('alt')"
          >
            Alt
          </button>
          <button
            class="vnc-panel-btn"
            type="button"
            :class="{ active: metaActive }"
            :aria-pressed="metaActive"
            title="Win"
            @click="toggleModifier('meta')"
          >
            ⊞
          </button>
          <button class="vnc-panel-btn" type="button" title="Ctrl+Alt+Del" @click="sendCtrlAltDel">
            ⇄
          </button>
          <button class="vnc-panel-btn" type="button" title="Esc" @click="tapKey(0xff1b, 'Escape')">
            Esc
          </button>

          <button class="vnc-panel-btn vnc-panel-collapse" type="button" title="收起" @click="toggleToolsPanel">
            <component :is="CollapseIcon" />
          </button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped>
.console-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.console-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--el-text-color-regular);
  overflow: hidden;
}

.status-detail {
  color: var(--el-text-color-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-border-color);
}
.status-dot.connecting {
  background: var(--el-color-warning);
}
.status-dot.connected {
  background: var(--el-color-success);
}
.status-dot.disconnected {
  background: var(--el-color-info);
}
.status-dot.error {
  background: var(--el-color-danger);
}

.console-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.console-body {
  position: relative;
  height: calc(78vh - 140px);
  min-height: 520px;
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  overflow: hidden;
  background: #111;
}

.console-screen {
  position: relative;
  width: 100%;
  height: 100%;
}

.console-screen-inner {
  width: 100%;
  height: 100%;
}

.vnc-side-toggle {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 34px;
  height: 54px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.92);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(6px);
  z-index: 4;
  transition: background 0.15s ease, border-color 0.15s ease;
}

.vnc-side-toggle:hover {
  background: rgba(0, 0, 0, 0.34);
  border-color: rgba(255, 255, 255, 0.18);
}

.vnc-side-toggle :deep(svg) {
  width: 20px;
  height: 20px;
}

.vnc-float-panel {
  position: absolute;
  left: 56px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px 8px;
  border-radius: 16px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
  z-index: 4;
}

.vnc-panel-btn {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.2px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease, transform 0.15s ease;
  user-select: none;
}

.vnc-panel-btn:hover {
  background: rgba(255, 255, 255, 0.14);
  border-color: rgba(255, 255, 255, 0.18);
  transform: translateY(-1px);
}

.vnc-panel-btn:active {
  transform: translateY(0);
}

.vnc-panel-btn.active {
  background: rgba(64, 158, 255, 0.22);
  border-color: rgba(64, 158, 255, 0.45);
}

.vnc-panel-btn :deep(svg) {
  width: 18px;
  height: 18px;
}

.vnc-panel-collapse {
  background: rgba(0, 0, 0, 0.18);
}

.console-empty {
  display: flex;
  height: 100%;
  align-items: center;
  justify-content: center;
  background: var(--el-bg-color);
}

.console-guest-off {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.35);
  z-index: 2;
}

.guest-off-card {
  background: rgba(32, 32, 32, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  padding: 18px 22px;
  min-width: 320px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.45);
}

.guest-off-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
}
</style>



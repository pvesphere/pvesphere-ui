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
import { computed, nextTick, onUnmounted, ref, watch } from "vue";
import RFB from "@novnc/novnc/lib/rfb.js";
import FullscreenIcon from "~icons/ri/fullscreen-fill";
import ExitFullscreenIcon from "~icons/ri/fullscreen-exit-fill";
import ExpandIcon from "~icons/ri/arrow-right-s-line";
import CollapseIcon from "~icons/ri/arrow-left-s-line";
import { 
  createNodeConsole, 
  createPveAccessTicket,
  type NodeConsolePayload,
  type PveAccessTicketPayload 
} from "@/api/pve";
import { ElMessage, ElMessageBox } from "element-plus";

const props = defineProps<{
  modelValue: boolean;
  nodeId: number | string;
  nodeName?: string;
  clusterId: number | string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: boolean): void;
}>();

const visible = computed({
  get: () => props.modelValue,
  set: val => emit("update:modelValue", val)
});

// Console 类型 - 默认使用 vncshell（termproxy 已隐藏，保留代码以便后续恢复）
const consoleType = ref<"vncshell" | "termproxy">("vncshell");
// Console 显示方式：'embedded' 前端封装，'iframe' 使用 iframe 嵌入后端页面
const consoleMode = ref<"embedded" | "iframe">("embedded");
const loading = ref(false);
const consoleData = ref<any>(null);

// 密码输入相关
const passwordDialogVisible = ref(false);
const password = ref("");
const passwordLoading = ref(false);

// VNC 相关 - termproxy 和 vncshell 都使用 noVNC
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

// 清理 VNC 连接
const cleanupVnc = () => {
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

// 清理所有连接
const cleanup = () => {
  cleanupVnc();
};

// VNC 按键发送
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
    sendKey(0xffe3, "ControlLeft", ctrlActive.value);
    return;
  }
  if (name === "alt") {
    altActive.value = !altActive.value;
    sendKey(0xffe9, "AltLeft", altActive.value);
    return;
  }
  metaActive.value = !metaActive.value;
  sendKey(0xffeb, "MetaLeft", metaActive.value);
};

const sendCtrlAltDel = () => {
  if (!rfb) return;
  const anyRfb: any = rfb as any;
  if (typeof anyRfb.sendCtrlAltDel === "function") {
    anyRfb.sendCtrlAltDel();
    return;
  }
  const tmpCtrl = !ctrlActive.value;
  const tmpAlt = !altActive.value;
  if (tmpCtrl) sendKey(0xffe3, "ControlLeft", true);
  if (tmpAlt) sendKey(0xffe9, "AltLeft", true);
  tapKey(0xffff, "Delete");
  if (tmpAlt) sendKey(0xffe9, "AltLeft", false);
  if (tmpCtrl) sendKey(0xffe3, "ControlLeft", false);
};


// 处理密码输入确认
const handlePasswordConfirm = async () => {
  if (!password.value.trim()) {
    ElMessage.warning("请输入密码");
    return;
  }
  
  passwordLoading.value = true;
  try {
    const payload: PveAccessTicketPayload = {
      cluster_id: Number(props.clusterId),
      username: "root",
      realm: "pam",
      password: password.value
    };
    
    const res = await createPveAccessTicket(payload);
    if (res.code === 0 && res.data) {
      // 兼容多种可能的字段名：csrf_token, CSRFPreventionToken, csrfPreventionToken
      const csrfToken = res.data.csrf_token || 
                       res.data.CSRFPreventionToken || 
                       res.data.csrfPreventionToken;
      
      
      if (!csrfToken) {
        console.error("未找到 CSRF Token，后端返回的数据:", res.data);
        ElMessage.error("未获取到 CSRF Token，请检查后端返回的数据");
        return;
      }
      
      passwordDialogVisible.value = false;
      passwordLoading.value = false;
      // 继续执行 console 连接
      await connectConsoleWithAuth(res.data.ticket, csrfToken);
    } else {
      ElMessage.error(res.message || "获取认证信息失败");
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || "获取认证信息失败");
  } finally {
    passwordLoading.value = false;
  }
};

// 使用认证信息连接 Console
const connectConsoleWithAuth = async (ticket: string, csrf_token: string) => {
  if (!props.nodeId) return;
  
  loading.value = true;
  try {
    // termproxy 和 vncshell 都使用相同的认证流程
    const payload: NodeConsolePayload = {
      node_id: props.nodeId,
      console_type: consoleType.value, // 使用当前选择的 console 类型
      ticket: ticket,
      csrf_token: csrf_token,
      // vncshell 模式需要 websocket 参数
      websocket: consoleType.value === "vncshell" ? true : undefined
    };
    
    
    const res = await createNodeConsole(payload);
    if (res.code === 0 && res.data) {
      consoleData.value = res.data;
      await nextTick();
      
      // 如果后端返回 console_url（类似 Proxmox 官方方式），使用 iframe 模式
      if (res.data.console_url) {
        consoleMode.value = "iframe";
        status.value = "connected";
        statusDetail.value = "";
        loading.value = false;
      } else if (res.data.ws_url) {
        // termproxy 和 vncshell 都使用 noVNC（RFB）
        consoleMode.value = "embedded";
        // 等待 DOM 更新，确保 screenRef 已经渲染
        await nextTick();
        await nextTick();
        
        // 在调用 connectVnc 之前，先设置 loading 为 false
        loading.value = false;
        
        // 再次等待，确保 loading 状态已更新
        await nextTick();
        
        // 调试：打印准备连接 VNC 的信息
        if (import.meta.env.DEV) {
          console.log("准备连接 VNC，consoleType:", consoleType.value);
          console.log("screenRef:", screenRef.value);
          console.log("consoleData:", consoleData.value);
          console.log("loading:", loading.value);
          console.log("ws_url:", res.data.ws_url);
        }
        
        await connectVnc();
      } else {
        ElMessage.error("后端未返回有效的控制台连接信息");
        status.value = "error";
        statusDetail.value = "缺少 ws_url 或 console_url";
        loading.value = false;
      }
    } else {
      ElMessage.error(res.message || "获取控制台信息失败");
      status.value = "error";
      statusDetail.value = res.message || "获取控制台信息失败";
      loading.value = false;
    }
  } catch (error: any) {
    ElMessage.error(error?.response?.data?.message || error?.message || "获取控制台信息失败");
    status.value = "error";
    statusDetail.value = error?.response?.data?.message || error?.message || "获取控制台信息失败";
    loading.value = false;
  }
};

// 获取 Console 信息
const fetchConsoleInfo = async () => {
  if (!props.nodeId) return;
  
  // termproxy 和 vncshell 都需要先获取 ticket（高权限认证）
  // 显示密码输入对话框
  password.value = "";
  passwordDialogVisible.value = true;
  // 密码确认逻辑在 handlePasswordConfirm 中处理
};

// 连接 VNC
const connectVnc = async () => {
  if (!visible.value) return;
  if (loading.value) return;
  if (!consoleData.value?.ws_url) return;
  if (!screenRef.value) return;

  cleanupVnc();
  status.value = "connecting";

  await nextTick();
  if (!screenRef.value) return;

  try {
    // termproxy 和 vncshell 都使用 VNC 协议，都需要 ticket 作为密码
    // Proxmox 的 termproxy 虽然名字叫"终端代理"，但实际上返回的是 VNC 协议连接信息
    const vncPassword = consoleData.value.ticket || "";
    const credentials = { credentials: { password: vncPassword } };
    
    if (import.meta.env.DEV) {
      console.log("连接 VNC，consoleType:", consoleType.value);
      console.log("ws_url:", consoleData.value.ws_url);
      console.log("VNC ticket prefix:", vncPassword.substring(0, 20) + "...");
    }
    
    rfb = new RFB(
      screenRef.value,
      consoleData.value.ws_url,
      credentials
    );

    rfb.scaleViewport = true;
    rfb.resizeSession = true;
    rfb.showDotCursor = true;

    rfb.addEventListener("connect", () => {
      if (import.meta.env.DEV) {
        console.log("VNC 连接成功");
      }
      status.value = "connected";
      statusDetail.value = "";
    });

    rfb.addEventListener("disconnect", (e: any) => {
      const clean = Boolean(e?.detail?.clean);
      ctrlActive.value = false;
      altActive.value = false;
      metaActive.value = false;

      status.value = clean ? "disconnected" : "error";
      statusDetail.value = e?.detail?.reason || "";
      
      if (import.meta.env.DEV) {
        console.log("VNC 断开连接:", clean ? "正常断开" : "异常断开", e?.detail?.reason);
      }
    });

    rfb.addEventListener("securityfailure", (e: any) => {
      status.value = "error";
      statusDetail.value = e?.detail?.reason || "security failure";
      if (import.meta.env.DEV) {
        console.error("VNC 安全验证失败:", e?.detail?.reason);
      }
    });

    rfb.addEventListener("credentialsrequired", () => {
      if (consoleData.value?.ticket && rfb) {
        rfb.sendCredentials({ password: consoleData.value.ticket });
      } else {
        // 如果没有 ticket，使用空密码
        rfb.sendCredentials({ password: "" });
      }
    });
  } catch (err: any) {
    status.value = "error";
    statusDetail.value = err?.message || "连接失败";
    if (import.meta.env.DEV) {
      console.error("VNC 连接失败:", err);
    }
      }
    };


const handleReconnect = () => {
  cleanup();
  consoleData.value = null;
  fetchConsoleInfo();
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

const handleConsoleTypeChange = () => {
  cleanup();
  consoleData.value = null;
  fetchConsoleInfo();
};

// 取消密码输入
const handlePasswordCancel = () => {
  passwordDialogVisible.value = false;
  password.value = "";
  visible.value = false;
};

watch(
  () => visible.value,
  async val => {
    if (val) {
      await fetchConsoleInfo();
    } else {
      cleanup();
      consoleData.value = null;
      password.value = "";
      passwordDialogVisible.value = false;
    }
  }
);

onUnmounted(() => cleanup());
</script>

<template>
  <el-dialog
    v-model="visible"
    :title="`${nodeName || 'Node'} Console`"
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
        <!-- 暂时隐藏控制台类型选择器，默认使用 vncshell，保留代码以便后续恢复 -->
        <el-select
          v-if="false"
          v-model="consoleType"
          size="small"
          style="width: 140px; margin-right: 8px;"
          @change="handleConsoleTypeChange"
        >
          <el-option label="VNC Shell" value="vncshell" />
          <el-option label="TermProxy" value="termproxy" />
        </el-select>
        <el-button :disabled="loading" @click="handleReconnect">重新连接</el-button>
      </div>
    </div>

    <div v-loading="loading" class="console-body">
      <div v-if="!consoleData && !loading" class="console-empty">
        <el-empty description="暂无控制台连接信息" />
      </div>
      
      <!-- VNC Shell 和 TermProxy 模式都使用 noVNC -->
      <div v-else-if="(consoleType === 'vncshell' || consoleType === 'termproxy') && consoleData" class="console-screen">
        <!-- iframe 模式：如果后端返回 console_url，使用 iframe 嵌入 -->
        <iframe
          v-if="consoleMode === 'iframe' && consoleData.console_url"
          :src="consoleData.console_url"
          class="console-iframe"
          frameborder="0"
          allowfullscreen
        />
        <!-- embedded 模式：使用 noVNC（RFB） -->
        <template v-else-if="consoleMode === 'embedded'">
        <div ref="screenRef" class="console-screen-inner" />
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
        </template>
      </div>
    </div>
  </el-dialog>

  <!-- 密码输入对话框 -->
  <el-dialog
    v-model="passwordDialogVisible"
    title="输入密码"
    width="400px"
    :close-on-click-modal="false"
    :close-on-press-escape="false"
    :show-close="false"
  >
    <el-form>
      <el-form-item label="密码">
        <el-input
          v-model="password"
          type="password"
          placeholder="请输入 PVE root 密码"
          show-password
          @keyup.enter="handlePasswordConfirm"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="handlePasswordCancel">取消</el-button>
      <el-button type="primary" :loading="passwordLoading" @click="handlePasswordConfirm">
        确认
      </el-button>
    </template>
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

.console-iframe {
  width: 100%;
  height: 100%;
  border: none;
  background: #0d1117;
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
</style>

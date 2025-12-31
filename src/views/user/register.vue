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

<template>
  <div class="register-container">
    <div class="register-box">
      <div class="register-form">
        <Motion>
          <h2 class="outline-hidden">用户注册</h2>
        </Motion>

        <el-form
          ref="ruleFormRef"
          :model="ruleForm"
          :rules="registerRules"
          size="large"
        >
          <Motion :delay="100">
            <el-form-item prop="email">
              <el-input
                v-model="ruleForm.email"
                clearable
                placeholder="请输入邮箱"
                :prefix-icon="useRenderIcon(User)"
              />
            </el-form-item>
          </Motion>

          <Motion :delay="150">
            <el-form-item prop="password">
              <el-input
                v-model="ruleForm.password"
                clearable
                show-password
                placeholder="请输入密码"
                :prefix-icon="useRenderIcon(Lock)"
              />
            </el-form-item>
          </Motion>

          <Motion :delay="200">
            <el-form-item prop="confirmPassword">
              <el-input
                v-model="ruleForm.confirmPassword"
                clearable
                show-password
                placeholder="请确认密码"
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
              @click="onRegister(ruleFormRef)"
            >
              注册
            </el-button>
          </Motion>

          <Motion :delay="300">
            <div class="flex justify-center items-center mt-2">
              <el-link
                type="primary"
                :underline="false"
                @click="router.push('/login')"
              >
                已有账号？去登录
              </el-link>
            </div>
          </Motion>
        </el-form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRouter } from "vue-router";
import { message } from "@/utils/message";
import type { FormInstance } from "element-plus";
import Motion from "@/views/login/utils/motion";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { registerUser } from "@/api/user";
import { REGEXP_EMAIL, REGEXP_PWD } from "@/views/login/utils/rule";
import Lock from "~icons/ri/lock-fill";
import User from "~icons/ri/user-3-fill";

defineOptions({
  name: "Register"
});

const router = useRouter();
const loading = ref(false);
const ruleFormRef = ref<FormInstance>();

const ruleForm = reactive({
  email: "",
  password: "",
  confirmPassword: ""
});

// 确认密码验证
const validateConfirmPassword = (rule: any, value: string, callback: any) => {
  if (value === "") {
    callback(new Error("请再次输入密码"));
  } else if (value !== ruleForm.password) {
    callback(new Error("两次输入的密码不一致"));
  } else {
    callback();
  }
};

const registerRules = reactive({
  email: [
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value === "") {
          callback(new Error("请输入邮箱"));
        } else if (!REGEXP_EMAIL.test(value)) {
          callback(new Error("请输入正确的邮箱格式"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ],
  password: [
    {
      validator: (rule: any, value: string, callback: any) => {
        if (value === "") {
          callback(new Error("请输入密码"));
        } else if (!REGEXP_PWD.test(value)) {
          callback(
            new Error("密码格式应为8-18位数字、字母、符号的任意两种组合")
          );
        } else {
          callback();
        }
      },
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

const onRegister = async (formEl: FormInstance | undefined) => {
  if (!formEl) return;
  await formEl.validate(valid => {
    if (valid) {
      loading.value = true;
      registerUser({
        email: ruleForm.email,
        password: ruleForm.password
      })
        .then(res => {
          if (res.code === 200 || res.code === 0) {
            message("注册成功，请登录", { type: "success" });
            router.push("/login");
          } else {
            message(res.message || "注册失败", { type: "error" });
          }
        })
        .catch(error => {
          message(error?.response?.data?.message || "注册失败", {
            type: "error"
          });
        })
        .finally(() => {
          loading.value = false;
        });
    }
  });
};
</script>

<style scoped>
.register-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
}

.register-box {
  width: 100%;
  max-width: 400px;
  padding: 20px;
}

.register-form {
  background: rgba(255, 255, 255, 0.95);
  padding: 40px;
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

.register-form h2 {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
  font-size: 24px;
}
</style>


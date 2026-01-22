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

import { defineStore } from "pinia";
import {
  type userType,
  store,
  router,
  resetRouter,
  routerArrays,
  storageLocal
} from "../utils";
import {
  type UserResult,
  type RefreshTokenResult,
  getLogin,
  refreshTokenApi,
  getUserInfo
} from "@/api/user";
import { useMultiTagsStoreHook } from "./multiTags";
import { type DataInfo, setToken, removeToken, userKey } from "@/utils/auth";

export const useUserStore = defineStore("pure-user", {
  state: (): userType => ({
    // 头像
    avatar: storageLocal().getItem<DataInfo<number>>(userKey)?.avatar ?? "",
    // 用户名
    username: storageLocal().getItem<DataInfo<number>>(userKey)?.username ?? "",
    // 昵称
    nickname: storageLocal().getItem<DataInfo<number>>(userKey)?.nickname ?? "",
    // 页面级别权限
    roles: storageLocal().getItem<DataInfo<number>>(userKey)?.roles ?? [],
    // 按钮级别权限
    permissions:
      storageLocal().getItem<DataInfo<number>>(userKey)?.permissions ?? [],
    // 是否勾选了登录页的免登录
    isRemembered: false,
    // 登录页的免登录存储几天，默认7天
    loginDay: 7
  }),
  actions: {
    /** 存储头像 */
    SET_AVATAR(avatar: string) {
      this.avatar = avatar;
    },
    /** 存储用户名 */
    SET_USERNAME(username: string) {
      this.username = username;
    },
    /** 存储昵称 */
    SET_NICKNAME(nickname: string) {
      this.nickname = nickname;
    },
    /** 存储角色 */
    SET_ROLES(roles: Array<string>) {
      this.roles = roles;
    },
    /** 存储按钮级别权限 */
    SET_PERMS(permissions: Array<string>) {
      this.permissions = permissions;
    },
    /** 存储是否勾选了登录页的免登录 */
    SET_ISREMEMBERED(bool: boolean) {
      this.isRemembered = bool;
    },
    /** 设置登录页的免登录存储几天 */
    SET_LOGINDAY(value: number) {
      this.loginDay = Number(value);
    },
    /** 登入 */
    async loginByUsername(data: { account: string; password: string }) {
      return new Promise<UserResult>((resolve, reject) => {
        getLogin(data)
          .then(async loginRes => {
            // 后端返回的格式可能是多种形式，需要适配为前端期望的格式
            let formattedData: UserResult;

            // 如果后端返回的是标准格式（包含success和data），直接使用
            if (loginRes?.success && loginRes?.data) {
              formattedData = loginRes;
            } else {
              // 如果后端返回的是简单格式，需要适配
              // 常见格式：{ token: "xxx" } 或 { accessToken: "xxx" } 或直接返回token字符串
              const rawResponse = loginRes as any;
              let accessToken = '';

              // 尝试从不同可能的字段中提取token
              if (typeof rawResponse === 'string') {
                accessToken = rawResponse;
              } else if (rawResponse?.token) {
                accessToken = rawResponse.token;
              } else if (rawResponse?.accessToken) {
                accessToken = rawResponse.accessToken;
              } else if (rawResponse?.data?.token) {
                accessToken = rawResponse.data.token;
              } else if (rawResponse?.data?.accessToken) {
                accessToken = rawResponse.data.accessToken;
              }

              if (!accessToken) {
                reject(new Error('登录失败：未获取到token'));
                return;
              }

              // 先临时保存token，以便后续调用getUserInfo时能够携带token
              const tempTokenData = {
                accessToken: accessToken,
                refreshToken: rawResponse?.refreshToken || '',
                expires: rawResponse?.expires
                  ? new Date(rawResponse.expires)
                  : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 默认7天过期
                avatar: '',
                username: data.account,
                nickname: data.account,
                roles: ['common'],
                permissions: []
              };

              // 临时保存token（不包含用户信息）
              setToken(tempTokenData);

              // 登录成功后，调用获取用户信息接口
              try {
                const userInfoRes = await getUserInfo();
                const userInfo = (userInfoRes as any)?.data || userInfoRes;

                // 将token和用户信息组合成前端期望的格式
                formattedData = {
                  success: true,
                  data: {
                    accessToken: accessToken,
                    refreshToken: rawResponse?.refreshToken || '',
                    expires: tempTokenData.expires,
                    avatar: userInfo?.avatar || '',
                    username: userInfo?.username || userInfo?.email || data.account,
                    nickname: userInfo?.nickname || userInfo?.name || data.account,
                    roles: userInfo?.roles || ['common'],
                    permissions: userInfo?.permissions || []
                  }
                };
              } catch (error) {
                // 如果获取用户信息失败，使用默认值（但token已经保存）
                formattedData = {
                  success: true,
                  data: tempTokenData
                };
              }
            }

            // 最终保存完整的token和用户信息
            if (formattedData?.success) {
              setToken(formattedData.data);
            }
            resolve(formattedData);
          })
          .catch(error => {
            reject(error);
          });
      });
    },
    /** 前端登出（不调用接口） */
    logOut() {
      this.username = "";
      this.roles = [];
      this.permissions = [];
      removeToken();
      useMultiTagsStoreHook().handleTags("equal", [...routerArrays]);
      resetRouter();
      router.push("/login");
    },
    /** 刷新`token` */
    async handRefreshToken(data) {
      return new Promise<RefreshTokenResult>((resolve, reject) => {
        refreshTokenApi(data)
          .then(data => {
            if (data) {
              setToken(data.data);
              resolve(data);
            }
          })
          .catch(error => {
            reject(error);
          });
      });
    }
  }
});

export function useUserStoreHook() {
  return useUserStore(store);
}

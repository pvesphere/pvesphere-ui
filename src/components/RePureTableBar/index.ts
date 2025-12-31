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

import pureTableBar from "./src/bar";
import { withInstall } from "@pureadmin/utils";

/** 配合 `@pureadmin/table` 实现快速便捷的表格操作 https://github.com/pure-admin/pure-admin-table */
export const PureTableBar = withInstall(pureTableBar);

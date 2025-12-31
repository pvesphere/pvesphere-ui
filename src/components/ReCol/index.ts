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

import { ElCol } from "element-plus";
import { h, defineComponent } from "vue";

// 封装element-plus的el-col组件
export default defineComponent({
  name: "ReCol",
  props: {
    value: {
      type: Number,
      default: 24
    }
  },
  render() {
    const attrs = this.$attrs;
    const val = this.value;
    return h(
      ElCol,
      {
        xs: val,
        sm: val,
        md: val,
        lg: val,
        xl: val,
        ...attrs
      },
      { default: () => this.$slots.default() }
    );
  }
});
